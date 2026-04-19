import { log } from '../log.ts';
import { applyAppSchema } from './schema.ts';
import { transform } from './transform.ts';
import { computeRatings } from './ratings.ts';
import { assignRanks } from './rank.ts';
import { atomicAppSwap } from './swap.ts';
import { maybeSnapshot } from './snapshot.ts';

/**
 * Run the Phase 2 rating pipeline end-to-end. Assumes `raw_wca.*` has just
 * been refreshed by Phase 1 (or an older refresh is acceptable). Safe to run
 * repeatedly.
 */
export async function runPhase2(): Promise<void> {
  const startedAt = Date.now();
  await applyAppSchema();
  const t = await transform();
  const r = await computeRatings();
  await assignRanks();
  await atomicAppSwap();
  await maybeSnapshot();
  log.info('phase2: complete', {
    elapsed_sec: Math.round((Date.now() - startedAt) / 1000),
    transform: t,
    ratings: r,
  });
}
