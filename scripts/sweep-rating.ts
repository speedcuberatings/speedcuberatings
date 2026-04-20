/**
 * Validate our rating implementation against James Macdiarmid's reference
 * figures from his "Seasonal ratings" spreadsheet (April 2026).
 *
 * After implementing his exact bonus formula in production
 * (`ingest/src/derive/ratings.ts`), this should return MAE ~0.025 with
 * most competitors matching to two decimal places. The one persistent
 * outlier is typically a data-freshness issue — James updates his sheet
 * by scraping the WCA website directly, while we depend on the daily
 * export which lags by a few days on very recent competitions.
 */

import { makePool } from '../ingest/src/db.ts';

async function main() {
  const pool = makePool();

  // Reference figures from Seasonal ratings.xlsx (2026-04-20).
  const refs: Array<[string, string, number]> = [
    ['2019WANY36', 'Yiheng Wang',      86.87],
    ['2023GENG02', 'Xuanyi Geng',      86.03],
    ['2023DUYU01', 'Yufang Du',        75.19],
    ['2016KOLA02', 'Tymon Kolasiński', 73.51],
    ['2024LIZH03', 'Zhaokun Li',       73.42],
    ['2017XURU04', 'Ruihang Xu',       73.16],
    ['2026SHEN01', 'Yi Shen',          70.90],
    ['2023DONG20', 'Yize Dong',        69.70],
    ['2016INAB01', 'Matty Inaba',      69.60],
    ['2012PARK03', 'Max Park',         69.41],
    ['2021ZAJD03', 'Teodor Zajder',    68.11],
  ];

  console.log('Competitor               ours    james-ref    Δ');
  console.log('------------------------ ------- ----------   ------');
  const diffs: number[] = [];
  for (const [wcaId, name, ref] of refs) {
    const r = await pool.query<{ rating: string }>(
      `SELECT rating::text FROM app.current_ratings
        WHERE competitor_id = $1 AND event_id = '333' AND metric = 'average'`,
      [wcaId],
    );
    const ours = Number(r.rows[0]?.rating ?? 0);
    const d = ours - ref;
    diffs.push(d);
    console.log(
      `${name.padEnd(24)} ${ours.toFixed(2).padStart(7)} ${ref.toFixed(2).padStart(10)}   ${(d >= 0 ? '+' : '') + d.toFixed(2)}`,
    );
  }
  const mae = diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length;
  const bias = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const worstIdx = diffs.reduce((w, d, i) => Math.abs(d) > Math.abs(diffs[w]!) ? i : w, 0);
  console.log(`\nMAE=${mae.toFixed(3)}  bias=${(bias >= 0 ? '+' : '') + bias.toFixed(3)}  worst=${refs[worstIdx]![1]}:${(diffs[worstIdx]! >= 0 ? '+' : '') + diffs[worstIdx]!.toFixed(2)}`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
