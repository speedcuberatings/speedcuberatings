/**
 * Manually re-derive the rating for one competitor from raw data and
 * compare against our stored value, so we can surface where our math
 * diverges from the reference figures.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/verify-rating.ts 2019WANY36
 */

import { makePool, makeClient } from '../ingest/src/db.ts';

const WEIGHT_BASE = 0.99;
const INACTIVITY_BASE = 0.995;
const INACTIVITY_GRACE_DAYS = 90;
const MIN_RESULTS = 3;

// Current (15%-cap) bonus scheme — same as production ratings.ts
const BONUS_SCALE = 15 / 17;
const BONUS_FINAL = 0.03 * BONUS_SCALE;
const BONUS_MEDAL = [0.04, 0.02, 0.01].map((v) => v * BONUS_SCALE);
const BONUS_RECORD = {
  WR: 0.06 * BONUS_SCALE,
  continental: 0.03 * BONUS_SCALE,
  NR: 0.01 * BONUS_SCALE,
};
const BONUS_CHAMP = {
  world: 0.04 * BONUS_SCALE,
  continental: 0.02 * BONUS_SCALE,
  national: 0.01 * BONUS_SCALE,
};
const CONTINENTAL_RECORD_CODES = new Set(['AfR', 'AsR', 'ER', 'NAR', 'OcR', 'SAR']);

function recordTier(code: string | null | undefined): number {
  if (!code) return 0;
  if (code === 'WR') return BONUS_RECORD.WR;
  if (CONTINENTAL_RECORD_CODES.has(code)) return BONUS_RECORD.continental;
  if (code === 'NR') return BONUS_RECORD.NR;
  return 0;
}

const EVENT_ID = '333';

async function main() {
  const wcaId = process.argv[2] ?? '2019WANY36';

  const pool = makePool();
  const wrRes = await pool.query<{ wr: string }>(
    `SELECT min(average::int)::text AS wr
       FROM raw_wca.results
      WHERE event_id = $1 AND average::int > 0`,
    [EVENT_ID],
  );
  const wr = Number(wrRes.rows[0]!.wr);
  console.log('\nWR (3x3 average) =', wr, 'cs (', (wr / 100).toFixed(2), 's)\n');

  const storedRes = await pool.query<{
    rating: string;
    raw_rating: string;
    rank: number;
    result_count: number;
  }>(
    `SELECT rating::text, raw_rating::text, rank, result_count
       FROM app.current_ratings
      WHERE competitor_id = $1 AND event_id = $2 AND metric = 'average'`,
    [wcaId, EVENT_ID],
  );
  console.log(`Stored rating for ${wcaId}:`, storedRes.rows[0]);

  const resRes = await pool.query(
    `SELECT r.competition_date,
            r.competition_id,
            r.average,
            r.position,
            r.is_final,
            r.regional_single_record  AS rsr,
            r.regional_average_record AS rar,
            r.is_championship,
            r.championship_scope,
            (current_date - r.competition_date)::int AS days_old
       FROM app.official_results r
      WHERE r.competitor_id = $1
        AND r.event_id = $2
        AND r.average IS NOT NULL
        AND r.average > 0
      ORDER BY r.competition_date DESC`,
    [wcaId, EVENT_ID],
  );

  let weightedScoreSum = 0;
  let weightSum = 0;
  let count = 0;
  let lastDate: Date | null = null;

  console.log(
    '\n' +
      ['date', 'comp', 'avg', 'pos', 'fin', 'rec', 'chmp', 'kinch', 'bonus', 'wt', 'contrib'].join('\t'),
  );
  const rows = resRes.rows as Array<{
    competition_date: Date;
    competition_id: string;
    average: number;
    position: number;
    is_final: boolean;
    rsr: string | null;
    rar: string | null;
    is_championship: boolean;
    championship_scope: string | null;
    days_old: number;
  }>;
  for (const r of rows) {
    if (r.average <= 0) continue;
    const kinch = 100 * (wr / r.average);
    let bonus = 0;
    if (r.is_final) {
      bonus += BONUS_FINAL;
      if (r.position >= 1 && r.position <= 3) bonus += BONUS_MEDAL[r.position - 1]!;
    }
    bonus += Math.max(recordTier(r.rsr), recordTier(r.rar));
    if (r.is_championship && r.championship_scope) {
      bonus += (BONUS_CHAMP as any)[r.championship_scope] ?? 0;
    }
    const mult = 1 + bonus;
    const weight = Math.pow(WEIGHT_BASE, r.days_old);
    const boosted = kinch * mult;
    weightedScoreSum += boosted * weight;
    weightSum += weight;
    count += 1;
    if (!lastDate || r.competition_date > lastDate) lastDate = r.competition_date;

    console.log(
      [
        r.competition_date.toISOString().slice(0, 10),
        r.competition_id.slice(0, 18),
        r.average,
        r.position,
        r.is_final ? 'F' : '-',
        r.rsr ?? r.rar ?? '-',
        r.championship_scope ?? '-',
        kinch.toFixed(2),
        mult.toFixed(3),
        weight.toFixed(3),
        (boosted * weight).toFixed(2),
      ].join('\t'),
    );
  }

  const raw = weightedScoreSum / weightSum;
  const daysSince = lastDate
    ? Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 86_400_000))
    : 9999;
  const decay =
    daysSince > INACTIVITY_GRACE_DAYS
      ? Math.pow(INACTIVITY_BASE, daysSince - INACTIVITY_GRACE_DAYS)
      : 1;
  const rating = raw * decay;

  console.log('\nCount:', count, '(min required:', MIN_RESULTS, ')');
  console.log('Last date:', lastDate?.toISOString().slice(0, 10), '(', daysSince, 'days ago, decay=', decay.toFixed(3), ')');
  console.log('Raw rating:', raw.toFixed(4));
  console.log('Rating (post-decay):', rating.toFixed(4));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
