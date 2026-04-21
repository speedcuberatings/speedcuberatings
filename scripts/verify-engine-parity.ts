/**
 * Smoke-test the client-side rating engine against production.
 *
 * Fetches a candidate pool from the running `/api/calibrate/pool` route,
 * runs `computeLeaderboard()` at default config, and compares against
 * the production rows returned alongside the pool.
 *
 * Expected: MAE < 0.05 (basically rounding). Anything larger means
 * `web/lib/rating-engine/defaults.ts` has drifted from
 * `ingest/src/derive/ratings.ts` and should be resynced.
 *
 * Usage (with dev server running on :3000):
 *   npx tsx scripts/verify-engine-parity.ts                 # default 333 avg
 *   npx tsx scripts/verify-engine-parity.ts 333 single
 *   BASE_URL=http://localhost:4000 npx tsx scripts/verify-engine-parity.ts
 */
import { computeLeaderboard, engineParity } from '../web/lib/rating-engine/compute.ts';
import { freshDefault } from '../web/lib/rating-engine/defaults.ts';

async function main() {
  const event = process.argv[2] ?? '333';
  const metric = process.argv[3] ?? 'average';
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  const url = `${base}/api/calibrate/pool?event=${encodeURIComponent(event)}&metric=${metric}&poolSize=50`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`fetch ${url} → HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const pool = await res.json();
  const totalRows = pool.candidates.reduce(
    (acc: number, c: { results: unknown[] }) => acc + c.results.length,
    0,
  );
  console.log(
    `pool: ${pool.candidates.length} candidates · ${totalRows} results · WR=${pool.wr}`,
  );

  const rows = computeLeaderboard(pool, freshDefault());
  const parity = engineParity(rows);
  console.log(
    `parity  matched=${parity.matched}/${rows.length}  MAE=${parity.mae.toFixed(4)}  worstΔ=${parity.worstDelta.toFixed(4)}`,
  );

  const drifted = rows
    .filter((r) => r.rating != null && r.productionRating != null)
    .map((r) => ({
      name: r.name,
      ours: r.rating as number,
      prod: r.productionRating as number,
      d: (r.rating as number) - (r.productionRating as number),
    }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 5);

  console.log('\ntop-5 largest diffs:');
  for (const d of drifted) {
    console.log(
      `  ${d.name.padEnd(28)} ours=${d.ours.toFixed(2)} prod=${d.prod.toFixed(2)} Δ=${(d.d >= 0 ? '+' : '') + d.d.toFixed(3)}`,
    );
  }

  if (parity.mae > 0.05) {
    console.error(
      `\nFAIL: MAE ${parity.mae.toFixed(3)} > 0.05. Engine has drifted from the ingest rating model.`,
    );
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
