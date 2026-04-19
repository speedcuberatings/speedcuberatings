import copyFrom from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { makeClient, makePool } from '../db.ts';
import { log } from '../log.ts';

/** Rating-model constants (see docs/Rubik's Cube Ranking_Ratings.txt). */
const WEIGHT_BASE = 0.99;       // per day
const INACTIVITY_BASE = 0.995;  // per day beyond grace
const INACTIVITY_GRACE_DAYS = 90;
const MIN_RESULTS = 3;          // require >= this many results in window

/**
 * Bonus factors per the rating spec. At most one from each category
 * applies; the total maxes at +15%.
 *
 * The spec states a max of "15 to 17%"; we use the lower end (+15%) to
 * stay close to the reference implementation's calibration. All weights
 * are the 17%-scale values multiplied by 15/17 so the internal ordering
 * (record > championship = medal > final) is preserved.
 *
 *   final            +2.65%
 *   gold/silver/bronze medal in final   +3.53 / +1.76 / +0.88%
 *   WR / continental / national record  +5.29 / +2.65 / +0.88%
 *   world / continental / national championship  +3.53 / +1.76 / +0.88%
 */
const BONUS_SCALE = 15 / 17;
const BONUS_FINAL = 0.03 * BONUS_SCALE;
const BONUS_MEDAL = [0.04 * BONUS_SCALE, 0.02 * BONUS_SCALE, 0.01 * BONUS_SCALE] as const;
const BONUS_RECORD = {
  WR: 0.06 * BONUS_SCALE,
  continental: 0.03 * BONUS_SCALE,
  NR: 0.01 * BONUS_SCALE,
} as const;
const BONUS_CHAMP = {
  world: 0.04 * BONUS_SCALE,
  continental: 0.02 * BONUS_SCALE,
  national: 0.01 * BONUS_SCALE,
} as const;

const CONTINENTAL_RECORD_CODES = new Set(['AfR', 'AsR', 'ER', 'NAR', 'OcR', 'SAR']);

function recordTier(code: string | null): number {
  if (!code) return 0;
  if (code === 'WR') return BONUS_RECORD.WR;
  if (CONTINENTAL_RECORD_CODES.has(code)) return BONUS_RECORD.continental;
  if (code === 'NR') return BONUS_RECORD.NR;
  return 0;
}

function recordBoost(single: string | null, avg: string | null): number {
  // Spec says "a record of any kind" — credit the higher of single-record
  // or average-record for this round.
  return Math.max(recordTier(single), recordTier(avg));
}

function bonusMultiplier(row: ResultRow): number {
  let b = 0;
  if (row.is_final) {
    b += BONUS_FINAL;
    if (row.position >= 1 && row.position <= 3) b += BONUS_MEDAL[row.position - 1];
  }
  b += recordBoost(row.regional_single_record, row.regional_average_record);
  if (row.is_championship && row.championship_scope) {
    b += BONUS_CHAMP[row.championship_scope as keyof typeof BONUS_CHAMP] ?? 0;
  }
  return 1 + b;
}

interface ResultRow {
  competitor_id: string;
  metric_value: number;
  days_old: number;
  is_final: boolean;
  position: number;
  regional_single_record: string | null;
  regional_average_record: string | null;
  is_championship: boolean;
  championship_scope: string | null;
  competition_date: Date;
}

interface Accumulator {
  weightedScoreSum: number;
  weightSum: number;
  count: number;
  lastDate: Date;
}

/**
 * Compute ratings for every rateable event and bulk-load them into
 * `app_staging.current_ratings` via COPY.
 */
export async function computeRatings(): Promise<{
  events: number;
  competitors: number;
  ratings: number;
}> {
  // Pull rateable event ids via a short pool query, then iterate.
  const pool = makePool();
  const eventsRes = await pool.query<{ id: string }>(
    `SELECT id FROM app_staging.events WHERE rateable = true ORDER BY rank`,
  );
  await pool.end();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const rows: string[] = [];
  let eventsProcessed = 0;
  let competitorsTotal = 0;

  for (const { id: eventId } of eventsRes.rows) {
    const { added, competitors } = await computeEvent(eventId, today, rows);
    competitorsTotal += competitors;
    if (added) eventsProcessed += 1;
  }

  if (rows.length === 0) {
    log.warn('phase2: no ratings produced');
    return { events: eventsProcessed, competitors: competitorsTotal, ratings: 0 };
  }

  // Stream the buffered rows into app_staging.current_ratings via COPY.
  const client = await makeClient();
  try {
    const copyStream = client.query(
      copyFrom.from(
        `COPY app_staging.current_ratings (competitor_id, event_id, rating, raw_rating, result_count, last_competed_at)
         FROM STDIN WITH (FORMAT text, NULL '', DELIMITER E'\\t')`,
      ),
    );
    await pipeline(Readable.from(rows), copyStream);
  } finally {
    await client.end();
  }

  log.info('phase2: ratings written', {
    events: eventsProcessed,
    competitors: competitorsTotal,
    ratings: rows.length,
  });
  return { events: eventsProcessed, competitors: competitorsTotal, ratings: rows.length };
}

/**
 * Stream results for one event from Postgres and accumulate per-competitor
 * weighted sums in memory. Appends TSV rows to `out` (competitor_id,
 * event_id, rating, raw_rating, result_count, last_competed_at).
 *
 * Memory: even the biggest event (333) has ~2M results over 2 years; at
 * ~200 bytes/row that's well under 500MB, comfortable for a GH runner.
 */
async function computeEvent(
  eventId: string,
  today: Date,
  out: string[],
): Promise<{ added: boolean; competitors: number }> {
  const client = await makeClient();
  const acc = new Map<string, Accumulator>();
  let wr: number | null = null;
  let metricIsAverage = false;
  try {
    // Decide whether to score using average or single for this event.
    // Heuristic: if >= 50% of all-time results have a non-zero average,
    // the event is typically averaged (3x3 Ao5, etc); otherwise it's a
    // single-metric event (3BLD, FMC, multi, etc).
    const shareRes = await client.query<{ avg_share: string }>(
      `SELECT (count(*) FILTER (WHERE average::int > 0)::float
              / NULLIF(count(*), 0))::text AS avg_share
         FROM raw_wca.results
        WHERE event_id = $1 AND best::int > 0`,
      [eventId],
    );
    const avgShare = Number(shareRes.rows[0]?.avg_share ?? 0);
    metricIsAverage = avgShare >= 0.5;

    // World record = lowest non-zero value of the metric we're scoring.
    const wrCol = metricIsAverage ? 'average' : 'best';
    const wrRes = await client.query<{ wr: string | null }>(
      `SELECT min(${wrCol}::int)::text AS wr
         FROM raw_wca.results
        WHERE event_id = $1 AND ${wrCol}::int > 0`,
      [eventId],
    );
    wr = wrRes.rows[0]?.wr ? Number(wrRes.rows[0].wr) : null;
    if (!wr || wr <= 0) {
      log.warn('phase2: no WR for event, skipping', { eventId });
      return { added: false, competitors: 0 };
    }

    // Pass 2: stream results from app_staging.official_results (last 2 years).
    // We process in batches rather than a true server-side cursor for
    // simplicity; 2M rows fits fine in memory.
    const batch = await client.query<{
      competitor_id: string;
      metric_value: number;
      days_old: number;
      is_final: boolean;
      position: number;
      rsr: string | null;
      rar: string | null;
      is_championship: boolean;
      championship_scope: string | null;
      competition_date: Date;
    }>(
      `SELECT competitor_id,
              ${metricIsAverage
                ? 'CASE WHEN average > 0 THEN average ELSE NULL END'
                : 'best'} AS metric_value,
              (current_date - competition_date)::int AS days_old,
              is_final,
              position,
              regional_single_record AS rsr,
              regional_average_record AS rar,
              is_championship,
              championship_scope,
              competition_date
       FROM app_staging.official_results
       WHERE event_id = $1`,
      [eventId],
    );

    for (const r of batch.rows) {
      if (r.metric_value == null || r.metric_value <= 0) continue;
      const row: ResultRow = {
        competitor_id: r.competitor_id,
        metric_value: r.metric_value,
        days_old: r.days_old,
        is_final: r.is_final,
        position: r.position,
        regional_single_record: r.rsr,
        regional_average_record: r.rar,
        is_championship: r.is_championship,
        championship_scope: r.championship_scope,
        competition_date: r.competition_date,
      };
      const score = 100 * (wr / r.metric_value); // Kinch-style normalisation
      const mult = bonusMultiplier(row);
      const weight = Math.pow(WEIGHT_BASE, r.days_old);
      const boosted = score * mult;

      let a = acc.get(r.competitor_id);
      if (!a) {
        a = { weightedScoreSum: 0, weightSum: 0, count: 0, lastDate: r.competition_date };
        acc.set(r.competitor_id, a);
      }
      a.weightedScoreSum += boosted * weight;
      a.weightSum += weight;
      a.count += 1;
      if (r.competition_date > a.lastDate) a.lastDate = r.competition_date;
    }
  } finally {
    await client.end();
  }

  let kept = 0;
  for (const [competitor, a] of acc) {
    if (a.count < MIN_RESULTS) continue;
    const raw = a.weightedScoreSum / a.weightSum;

    const lastDate = a.lastDate;
    const daysSince = Math.max(
      0,
      Math.floor((today.getTime() - lastDate.getTime()) / 86_400_000),
    );
    const decay =
      daysSince > INACTIVITY_GRACE_DAYS
        ? Math.pow(INACTIVITY_BASE, daysSince - INACTIVITY_GRACE_DAYS)
        : 1;
    const rating = raw * decay;

    // TSV row: competitor_id \t event_id \t rating \t raw_rating \t count \t last_date \n
    out.push(
      `${competitor}\t${eventId}\t${rating.toFixed(2)}\t${raw.toFixed(2)}\t${a.count}\t${lastDate.toISOString().slice(0, 10)}\n`,
    );
    kept += 1;
  }

  log.info('phase2: event computed', { eventId, wr, metric: metricIsAverage ? 'avg' : 'single', considered: acc.size, rated: kept });
  return { added: true, competitors: kept };
}