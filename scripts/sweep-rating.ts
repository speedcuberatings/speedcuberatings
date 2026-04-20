/**
 * Parameter sweep — try variations of the rating formula and see which
 * configuration best matches James Macdiarmid's reference figures from
 * the source video.
 *
 * Current result: 2% bonus cap with 0.99^days weighting reproduces the
 * reference leaderboard to MAE 0.12 at a cutoff of 2026-04-01
 * (approximately the video's publish date). Without a cutoff, MAE is
 * 0.45 — the difference is purely results accumulated after the video.
 *
 * Use the cutoff variants below to sanity-check that the model still
 * matches James's figures whenever constants are touched.
 */

import { makePool } from '../ingest/src/db.ts';

const CONTINENTAL_RECORD_CODES = new Set(['AfR', 'AsR', 'ER', 'NAR', 'OcR', 'SAR']);

interface Params {
  label: string;
  weightBase: number;
  bonusScale: number;
  metric: 'average' | 'single';
  wrOverride?: number;
  noBonuses?: boolean;
  /** If set, ignore results dated after this ISO yyyy-mm-dd. */
  cutoffDate?: string;
}

interface ResultRow {
  value: number;
  days_old: number;
  is_final: boolean;
  position: number;
  rsr: string | null;
  rar: string | null;
  is_championship: boolean;
  championship_scope: string | null;
}

function bonusMultiplier(r: ResultRow, p: Params): number {
  if (p.noBonuses) return 1;
  const scale = p.bonusScale;
  let b = 0;
  if (r.is_final) {
    b += 0.03 * scale;
    if (r.position >= 1 && r.position <= 3) {
      const medals = [0.04, 0.02, 0.01];
      b += medals[r.position - 1]! * scale;
    }
  }
  const tier = (code: string | null) => {
    if (!code) return 0;
    if (code === 'WR') return 0.06 * scale;
    if (CONTINENTAL_RECORD_CODES.has(code)) return 0.03 * scale;
    if (code === 'NR') return 0.01 * scale;
    return 0;
  };
  b += Math.max(tier(r.rsr), tier(r.rar));
  if (r.is_championship && r.championship_scope) {
    const champ: Record<string, number> = {
      world: 0.04 * scale,
      continental: 0.02 * scale,
      national: 0.01 * scale,
    };
    b += champ[r.championship_scope] ?? 0;
  }
  return 1 + b;
}

async function fetchResults(
  pool: any,
  wcaId: string,
  metric: 'average' | 'single',
  cutoffDate: string | undefined,
): Promise<ResultRow[]> {
  const col = metric === 'average' ? 'average' : 'best';
  const cutoffClause = cutoffDate ? `AND r.competition_date <= '${cutoffDate}'::date` : '';
  const r = await pool.query(
    `SELECT r.${col} AS value,
            (DATE '${cutoffDate ?? 'now'}' - r.competition_date)::int AS days_old,
            r.is_final,
            r.position,
            r.regional_single_record AS rsr,
            r.regional_average_record AS rar,
            r.is_championship,
            r.championship_scope
       FROM app.official_results r
      WHERE r.competitor_id = $1
        AND r.event_id = '333'
        AND r.${col} IS NOT NULL
        AND r.${col} > 0
        ${cutoffClause}`,
    [wcaId],
  );
  return r.rows;
}

async function fetchWr(pool: any, metric: 'average' | 'single'): Promise<number> {
  const col = metric === 'average' ? 'average' : 'best';
  const r = await pool.query(
    `SELECT min(${col}::int)::int AS wr
       FROM raw_wca.results
      WHERE event_id='333' AND ${col}::int > 0`,
  );
  return r.rows[0]!.wr;
}

function computeRating(results: ResultRow[], wr: number, p: Params): number {
  let ws = 0;
  let w = 0;
  for (const r of results) {
    if (!r.value || r.value <= 0) continue;
    const kinch = 100 * (wr / r.value);
    const mult = bonusMultiplier(r, p);
    const weight = Math.pow(p.weightBase, r.days_old);
    ws += kinch * mult * weight;
    w += weight;
  }
  return ws / w;
}

async function main() {
  const pool = makePool();
  const COMPETITORS: Array<[string, string, number]> = [
    ['2023GENG02', 'Xuanyi Geng',        85.92],
    ['2019WANY36', 'Yiheng Wang',        85.04],
    ['2023DUYU01', 'Yufang Du',          74.92],
    ['2016KOLA02', 'Tymon Kolasiński',   73.56],
    ['2017XURU04', 'Ruihang Xu',         73.16],
    ['2024LIZH03', 'Zhaokun Li',         72.98],
    ['2026SHEN01', 'Yi Shen',            70.67],
    ['2012PARK03', 'Max Park',           69.45],
    ['2016INAB01', 'Matty Hiroto Inaba', 69.02],
    ['2023DONG20', 'Yize Dong',          67.95],
    ['2021ZAJD03', 'Teodor Zajder',      67.93],
  ];
  const configs: Params[] = [
    { label: '2% (current)',     weightBase: 0.99, bonusScale: 2 / 17,  metric: 'average' },
    { label: '2%, cutoff 2026-04-01', weightBase: 0.99, bonusScale: 2 / 17, metric: 'average', cutoffDate: '2026-04-01' },
    { label: '2%, cutoff 2026-03-01', weightBase: 0.99, bonusScale: 2 / 17, metric: 'average', cutoffDate: '2026-03-01' },
    { label: '2%, cutoff 2026-02-01', weightBase: 0.99, bonusScale: 2 / 17, metric: 'average', cutoffDate: '2026-02-01' },
  ];

  for (const config of configs) {
    const wr = config.wrOverride ?? (await fetchWr(pool, config.metric));
    const resultsByCompetitor = await Promise.all(
      COMPETITORS.map(async ([wcaId]) => fetchResults(pool, wcaId, config.metric, config.cutoffDate)),
    );
    const diffs: number[] = [];
    for (let i = 0; i < COMPETITORS.length; i++) {
      const [, , target] = COMPETITORS[i]!;
      const rating = computeRating(resultsByCompetitor[i]!, wr, config);
      diffs.push(rating - target);
    }
    const mae = diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length;
    const bias = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const worst = diffs.reduce((w, d, i) =>
      Math.abs(d) > Math.abs(w.d) ? { d, name: COMPETITORS[i]![1] } : w,
      { d: 0, name: '' });
    console.log(
      `[${config.label.padEnd(15)}] MAE=${mae.toFixed(2)}  bias=${bias >= 0 ? '+' : ''}${bias.toFixed(2)}  worst=${worst.name}:${worst.d >= 0 ? '+' : ''}${worst.d.toFixed(2)}`,
    );
  }

  // Detailed per-competitor for the best config we've identified (2% cap).
  console.log('\n--- detail: 2% cap, 0.99 ---');
  const bestConfig: Params = { label: '2%', weightBase: 0.99, bonusScale: 2 / 17, metric: 'average' };
  const wr = await fetchWr(pool, bestConfig.metric);
  for (let i = 0; i < COMPETITORS.length; i++) {
    const [wcaId, name, target] = COMPETITORS[i]!;
    const rows = await fetchResults(pool, wcaId, bestConfig.metric, undefined);
    const rating = computeRating(rows, wr, bestConfig);
    const diff = rating - target;
    console.log(`  ${name.padEnd(22)} ${rating.toFixed(2)}   ref=${target.toFixed(2)}   Δ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
