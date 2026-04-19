import { makePool } from '../db.ts';
import { log } from '../log.ts';

const LIVE = 'app';
const STAGING = 'app_staging';
const PREV = 'app_prev';

/**
 * Atomically promote `app_staging` to `app`. Keeps the previous generation
 * around briefly as `app_prev`, then drops it.
 */
export async function atomicAppSwap(): Promise<void> {
  const pool = makePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP SCHEMA IF EXISTS ${PREV} CASCADE`);
    const exists = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists`,
      [LIVE],
    );
    if (exists.rows[0]?.exists) {
      await client.query(`ALTER SCHEMA ${LIVE} RENAME TO ${PREV}`);
    }
    await client.query(`ALTER SCHEMA ${STAGING} RENAME TO ${LIVE}`);
    await client.query('COMMIT');
    log.info('phase2: app schema swap complete');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
