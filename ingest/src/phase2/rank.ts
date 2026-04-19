import { makePool } from '../db.ts';
import { log } from '../log.ts';

/**
 * Populate `app_staging.current_ratings.rank` via a window function.
 * Ties get the same rank (DENSE_RANK) so 1st/1st/3rd rather than 1st/2nd/3rd.
 */
export async function assignRanks(): Promise<void> {
  const pool = makePool();
  try {
    await pool.query(`
      WITH ranked AS (
        SELECT competitor_id, event_id,
               DENSE_RANK() OVER (PARTITION BY event_id ORDER BY rating DESC) AS r
        FROM app_staging.current_ratings
      )
      UPDATE app_staging.current_ratings cr
         SET rank = ranked.r
        FROM ranked
       WHERE cr.competitor_id = ranked.competitor_id
         AND cr.event_id = ranked.event_id
    `);
    log.info('phase2: ranks assigned');
  } finally {
    await pool.end();
  }
}
