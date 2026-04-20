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
 * applies; the total maxes at +15% (low end of the spec's "15 to 17%").
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

type Metric = 'single' | 'average';

function recordTier(code: string | null): number {
  if (!code) return 0;
  if (code === 'WR') return BONUS_RECORD.WR;
  if (CONTINENTAL_RECORD_CODES.has(code)) return BONUS_RECORD.continental;
  if (code === 'NR') return BONUS_RECORD.NR;
  return 0;
}

function recordBoost(single: string | null, avg: string | null): number {
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
  days_old: number;
  is_final: boolean;
  position: number;
  regional_single_record: string | null;
  regional_average_record: string | null;
  is_championship: boolean;
  championship_scope: string | null;
  competition_date: Date;
  competition_id: string;
}

interface Accumulator {
  weightedScoreSum: number;
  weightSum: number;
  count: number;
  lastDate: Date;
  lastCompetitionId: string;
}

/**
 * Compute ratings for every rateable event — one pass per metric per event —
 * and bulk-load them into `app_staging.current_ratings` via COPY.
 *
 * We emit a 'single' row and an 'average' row for every event where the
 * corresponding metric has a defined world record. For events without
 * averages (333bf/444bf/555bf/333mbf/333fm in most cases), only 'single'
 * will be emitted.
 */
export async function computeRatings(): Promise<{
  events: number;
  ratings: number;
}> {
  const pool = makePool();
  const eventsRes = await pool.query<{ id: string }>(
    `SELECT id FROM app_staging.events WHERE rateable = true ORDER BY rank`,
  );
  await pool.end();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const rows: string[] = [];
  let eventsProcessed = 0;

  for (const { id: eventId } of eventsRes.rows) {
    const anyEmitted = await computeEvent(eventId, today, rows);
    if (anyEmitted) eventsProcessed += 1;
  }

  if (rows.length === 0) {
    log.warn('phase2: no ratings produced');
    return { events: eventsProcessed, ratings: 0 };
  }

  const client = await makeClient();
  try {
    const copyStream = client.query(
      copyFrom.from(
        `COPY app_staging.current_ratings (competitor_id, event_id, metric, rating, raw_rating, result_count, last_competed_at, last_competition_id)
         FROM STDIN WITH (FORMAT text, NULL '', DELIMITER E'\\t')`,
      ),
    );
    await pipeline(Readable.from(rows), copyStream);
  } finally {
    await client.end();
  }

  log.info('phase2: ratings written', {
    events: eventsProcessed,
    ratings: rows.length,
  });
  return { events: eventsProcessed, ratings: rows.length };
}

/**
 * Compute ratings for one event. Runs one or two passes depending on which
 * metrics are defined for the event. Returns true if any ratings were
 * emitted for this event.
 */
async function computeEvent(
  eventId: string,
  today: Date,
  out: string[],
): Promise<boolean> {
  // World records per metric (lowest non-zero value all-time in `raw_wca`).
  const wrRow = await (async () => {
    const client = await makeClient();
    try {
      const r = await client.query<{ wr_single: string | null; wr_average: string | null }>(
        `SELECT
           min(best::int)    FILTER (WHERE best::int > 0)    ::text AS wr_single,
           min(average::int) FILTER (WHERE average::int > 0) ::text AS wr_average
         FROM raw_wca.results
         WHERE event_id = $1`,
        [eventId],
      );
      return r.rows[0] ?? { wr_single: null, wr_average: null };
    } finally {
      await client.end();
    }
  })();
  const wrSingle = wrRow.wr_single ? Number(wrRow.wr_single) : null;
  const wrAverage = wrRow.wr_average ? Number(wrRow.wr_average) : null;

  let emittedAny = false;

  if (wrSingle && wrSingle > 0) {
    const kept = await computeEventMetric(eventId, 'single', wrSingle, today, out);
    log.info('phase2: event computed', { eventId, metric: 'single', wr: wrSingle, rated: kept });
    if (kept > 0) emittedAny = true;
  }
  if (wrAverage && wrAverage > 0) {
    const kept = await computeEventMetric(eventId, 'average', wrAverage, today, out);
    log.info('phase2: event computed', { eventId, metric: 'average', wr: wrAverage, rated: kept });
    if (kept > 0) emittedAny = true;
  }

  return emittedAny;
}

async function computeEventMetric(
  eventId: string,
  metric: Metric,
  wr: number,
  today: Date,
  out: string[],
): Promise<number> {
  const col = metric === 'average' ? 'average' : 'best';
  const client = await makeClient();
  const acc = new Map<string, Accumulator>();
  try {
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
      competition_id: string;
    }>(
      `SELECT competitor_id,
              ${col} AS metric_value,
              (current_date - competition_date)::int AS days_old,
              is_final,
              position,
              regional_single_record AS rsr,
              regional_average_record AS rar,
              is_championship,
              championship_scope,
              competition_date,
              competition_id
         FROM app_staging.official_results
        WHERE event_id = $1 AND ${col} IS NOT NULL AND ${col} > 0`,
      [eventId],
    );

    for (const r of batch.rows) {
      if (!r.metric_value || r.metric_value <= 0) continue;
      const row: ResultRow = {
        competitor_id: r.competitor_id,
        days_old: r.days_old,
        is_final: r.is_final,
        position: r.position,
        regional_single_record: r.rsr,
        regional_average_record: r.rar,
        is_championship: r.is_championship,
        championship_scope: r.championship_scope,
        competition_date: r.competition_date,
        competition_id: r.competition_id,
      };
      const score = 100 * (wr / r.metric_value);
      const mult = bonusMultiplier(row);
      const weight = Math.pow(WEIGHT_BASE, r.days_old);
      const boosted = score * mult;

      let a = acc.get(r.competitor_id);
      if (!a) {
        a = {
          weightedScoreSum: 0,
          weightSum: 0,
          count: 0,
          lastDate: r.competition_date,
          lastCompetitionId: r.competition_id,
        };
        acc.set(r.competitor_id, a);
      }
      a.weightedScoreSum += boosted * weight;
      a.weightSum += weight;
      a.count += 1;
      if (r.competition_date > a.lastDate) {
        a.lastDate = r.competition_date;
        a.lastCompetitionId = r.competition_id;
      }
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

    // TSV row: competitor \t event \t metric \t rating \t raw \t count \t last_date \t last_competition_id
    out.push(
      `${competitor}\t${eventId}\t${metric}\t${rating.toFixed(2)}\t${raw.toFixed(2)}\t${a.count}\t${lastDate.toISOString().slice(0, 10)}\t${a.lastCompetitionId}\n`,
    );
    kept += 1;
  }
  return kept;
}
