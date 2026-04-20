import { log } from '../log.ts';
import { applyAppSchema } from './schema.ts';
import { transform } from './transform.ts';
import { computeRatings } from './ratings.ts';
import { assignRanks } from './rank.ts';
import { atomicAppSwap } from './swap.ts';
import { maybeSnapshot } from './snapshot.ts';

/**
 * Run the derive stage end-to-end. Rebuilds `app.*` from `raw_wca.*` and
 * recomputes current ratings. Assumes a prior WCA import has populated
 * `raw_wca` (or that an older refresh is acceptable — the pipeline
 * doesn't need the very latest WCA data to run, it just operates on
 * whatever's there).
 *
 * Safe to run repeatedly.
 */
export async function runDerive(): Promise<void> {
  const startedAt = Date.now();
  await applyAppSchema();
  const t = await transform();
  const r = await computeRatings();
  await assignRanks();
  await atomicAppSwap();
  await maybeSnapshot();
  log.info('derive: complete', {
    elapsed_sec: Math.round((Date.now() - startedAt) / 1000),
    transform: t,
    ratings: r,
  });
}
