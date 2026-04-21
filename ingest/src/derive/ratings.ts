import copyFrom from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { makeClient, makePool } from '../db.ts';
import { log } from '../log.ts';

/**
 * Rating-model constants. The model is by James Macdiarmid, proposed in
 * his video "Our ranking system is broken. Let's fix it!"
 * (https://www.youtube.com/watch?v=2lU-d6OUU3Q). This implementation is
 * calibrated against the reference leaderboard shown in that video.
 *
 * MIRROR NOTICE: `web/lib/rating-engine/defaults.ts` keeps a client-side
 * copy of these constants so the `/calibrate` sandbox can recompute
 * ratings in the browser. The two must stay in sync; the calibration
 * page surfaces an engine-parity pill that flashes if they drift.
 */
const WEIGHT_BASE = 0.99;        // per day, within-window recency weight
const INACTIVITY_BASE = 0.9995;  // per day beyond grace

/**
 * Inactivity grace period, in days, before an inactive competitor's rating
 * starts to decay. The spec suggests 90 days, but James Macdiarmid noted
 * in the YouTube comments that less-frequent events ("something like multi")
 * should use a higher threshold since even an active competitor may not
 * enter them every 90 days.
 *
 * Values below are per-event; events not listed use DEFAULT_INACTIVITY_GRACE_DAYS.
 */
const DEFAULT_INACTIVITY_GRACE_DAYS = 90;
const INACTIVITY_GRACE_DAYS: Record<string, number> = {
  // Standard short-cycle events — default 90 days.
  '333': 90,
  '222': 90,
  '333oh': 90,
  pyram: 90,
  skewb: 90,
  sq1: 90,
  // Bigger cubes, clock, megaminx, 3bld — still popular, but rarely held
  // at the smallest comps. A longer grace avoids penalising competitors
  // in regions with fewer full-event competitions.
  '444': 180,
  '555': 180,
  '666': 180,
  '777': 180,
  clock: 180,
  minx: 180,
  '333bf': 180,
  // Rare events — only scheduled at larger competitions. Allow a full year.
  '444bf': 365,
  '555bf': 365,
  '333fm': 365,
  '333mbf': 365,
};
function inactivityGraceDays(eventId: string): number {
  return INACTIVITY_GRACE_DAYS[eventId] ?? DEFAULT_INACTIVITY_GRACE_DAYS;
}

const MIN_RESULTS = 3;          // require >= this many results in window

/**
 * Bonus factors per James Macdiarmid's exact formula (reverse-engineered
 * from his "Seasonal ratings" reference spreadsheet, April 2026).
 *
 * Per-round, the bonus multiplier is
 *
 *   1 + 0.01 * (placement_score + record_score)
 *
 * where:
 *
 *   placement_score = (R + S + T + U + 0.5) * 0.3 * champ_mult - 0.075
 *     R  = 1 if round is final else 0
 *     S  = 1 if final AND position <= 3 (bronze+)
 *     T  = 1 if final AND position <= 2 (silver+)
 *     U  = 2 if final AND position == 1 (gold)
 *     champ_mult, based on championship tier:
 *       worlds              → 5.5
 *       continental         → 3.0
 *       national            → 1.0
 *       (non-championship)  → 0.5
 *
 *   record_score = 2*any_record + 2*continental_or_higher + 4*wr
 *     where "any record" includes NR / CR / WR (so a single NR adds 2,
 *     a CR adds 4, a WR adds 8).
 *
 * Notes:
 *   - Placement contributes even for non-final rounds at championships:
 *     a first-round heat at Worlds gets (0.5)*0.3*5.5 - 0.075 = 0.75.
 *   - Single and average regional records are de-duped: if a round set
 *     both the WR single AND WR average, it still only contributes one
 *     WR's worth of points (not two).
 *   - Max theoretical single-round bonus: gold at Worlds (placement=9)
 *     plus WR (record=8) → 1 + 0.01 * 17 = +17%. In practice, across
 *     all of a top competitor's rounds the aggregate bonus effect on
 *     the final rating is ~0.2–0.3 points.
 *
 * Ships June 2026. Supersedes the earlier heuristic 2/17 calibration
 * — this formula matches James's reference leaderboard to MAE ~0.025,
 * vs 0.45 for the heuristic.
 */

const JAMES_MODIFIER = 0.01;

const CONTINENTAL_RECORD_CODES = new Set(['AfR', 'AsR', 'ER', 'NAR', 'OcR', 'SAR']);

function champMult(isChampionship: boolean, scope: string | null): number {
  if (!isChampionship) return 0.5;
  if (scope === 'world')       return 5.5;
  if (scope === 'continental') return 3.0;
  if (scope === 'national')    return 1.0;
  return 0.5;
}

function placementScore(row: ResultRow): number {
  const R = row.is_final ? 1 : 0;
  const S = row.is_final && row.position <= 3 ? 1 : 0;
  const T = row.is_final && row.position <= 2 ? 1 : 0;
  const U = row.is_final && row.position === 1 ? 2 : 0;
  const mult = champMult(row.is_championship, row.championship_scope);
  return (R + S + T + U + 0.5) * 0.3 * mult - 0.075;
}

function recordScore(single: string | null, avg: string | null): number {
  // De-dupe: if both single and avg set the same tier of record, still
  // count each tier at most once. Across the two metrics, the highest
  // tier of each is what matters.
  let anyRecord = false;
  let anyContinental = false;
  let anyWR = false;
  for (const code of [single, avg]) {
    if (!code) continue;
    anyRecord = true;
    if (code === 'WR') { anyContinental = true; anyWR = true; }
    else if (CONTINENTAL_RECORD_CODES.has(code)) { anyContinental = true; }
  }
  return (anyRecord ? 2 : 0) + (anyContinental ? 2 : 0) + (anyWR ? 4 : 0);
}

function bonusMultiplier(row: ResultRow): number {
  const total = placementScore(row)
    + recordScore(row.regional_single_record, row.regional_average_record);
  return 1 + JAMES_MODIFIER * total;
}

type Metric = 'single' | 'average';

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
    log.warn('derive: no ratings produced');
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

  log.info('derive: ratings written', {
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
  // World records per metric: all-time lowest non-zero value, sourced
  // from `app_staging.events` (populated in transform.ts from
  // raw_wca.results). This is the single source of truth for the Kinch
  // denominator — the calibration sandbox's pool endpoint reads the same
  // column so engine parity holds even when the WR holder is outside
  // the current 2-year window.
  const wrRow = await (async () => {
    const client = await makeClient();
    try {
      const r = await client.query<{ wr_single: number | null; wr_average: number | null }>(
        `SELECT wr_single, wr_average
           FROM app_staging.events
          WHERE id = $1`,
        [eventId],
      );
      return r.rows[0] ?? { wr_single: null, wr_average: null };
    } finally {
      await client.end();
    }
  })();
  const wrSingle = wrRow.wr_single != null ? Number(wrRow.wr_single) : null;
  const wrAverage = wrRow.wr_average != null ? Number(wrRow.wr_average) : null;

  let emittedAny = false;

  if (wrSingle && wrSingle > 0) {
    const kept = await computeEventMetric(eventId, 'single', wrSingle, today, out);
    log.info('derive: event computed', { eventId, metric: 'single', wr: wrSingle, rated: kept });
    if (kept > 0) emittedAny = true;
  }
  if (wrAverage && wrAverage > 0) {
    const kept = await computeEventMetric(eventId, 'average', wrAverage, today, out);
    log.info('derive: event computed', { eventId, metric: 'average', wr: wrAverage, rated: kept });
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
  const graceDays = inactivityGraceDays(eventId);
  for (const [competitor, a] of acc) {
    if (a.count < MIN_RESULTS) continue;
    const raw = a.weightedScoreSum / a.weightSum;

    const lastDate = a.lastDate;
    const daysSince = Math.max(
      0,
      Math.floor((today.getTime() - lastDate.getTime()) / 86_400_000),
    );
    const decay =
      daysSince > graceDays
        ? Math.pow(INACTIVITY_BASE, daysSince - graceDays)
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
