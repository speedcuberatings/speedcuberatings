import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePool } from '../db.ts';
import { log } from '../log.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SQL = path.resolve(__dirname, '../../sql/app_schema.sql');

/**
 * Create (or recreate) the `app_staging` schema plus the long-lived
 * `scr.rating_history` / `scr.rating_snapshot_state` tables.
 * The staging schema is always torn down first so each run starts fresh.
 */
export async function applyAppSchema(): Promise<void> {
  const sql = await fsp.readFile(APP_SQL, 'utf8');
  const pool = makePool();
  try {
    await pool.query(sql);
    log.info('derive: app_staging schema ready');
  } finally {
    await pool.end();
  }
}
