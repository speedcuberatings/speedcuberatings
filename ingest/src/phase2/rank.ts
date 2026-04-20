import { makePool } from '../db.ts';
import { log } from '../log.ts';

/**
 * Populate `app_staging.current_ratings.rank` via a window function.
 *
 * Uses standard RANK (not DENSE_RANK) so ties consume ordinal slots —
 * 5, 5, 7 rather than 5, 5, 6 — matching how WCA's rankings and every
 * other sports ladder display tied positions.
 *
 * Partitions by (event_id, metric) since we now store two ratings per
 * event (one per metric).
 */
export async function assignRanks(): Promise<void> {
  const pool = makePool();
  try {
    await pool.query(`
      WITH ranked AS (
        SELECT competitor_id, event_id, metric,
               RANK() OVER (PARTITION BY event_id, metric ORDER BY rating DESC) AS r
        FROM app_staging.current_ratings
      )
      UPDATE app_staging.current_ratings cr
         SET rank = ranked.r
        FROM ranked
       WHERE cr.competitor_id = ranked.competitor_id
         AND cr.event_id      = ranked.event_id
         AND cr.metric        = ranked.metric
    `);
    log.info('phase2: ranks assigned');
  } finally {
    await pool.end();
  }
}
