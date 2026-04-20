import { makePool } from '../db.ts';
import { log } from '../log.ts';
import { STAGING_SCHEMA } from './import.ts';

const LIVE_SCHEMA = 'raw_wca';
const PREV_SCHEMA = 'raw_wca_prev';

/**
 * Atomically swap the freshly-populated staging schema into place as `raw_wca`,
 * keeping the previous generation as `raw_wca_prev` until the next successful run.
 *
 * Sequence inside a transaction:
 *   1. Drop an older prev schema if it exists.
 *   2. Rename current live -> prev (if live exists).
 *   3. Rename staging -> live.
 */
export async function atomicSwap(): Promise<void> {
  const pool = makePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DROP SCHEMA IF EXISTS ${PREV_SCHEMA} CASCADE`);

    const { rows: liveRows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists`,
      [LIVE_SCHEMA],
    );
    if (liveRows[0]?.exists) {
      await client.query(`ALTER SCHEMA ${LIVE_SCHEMA} RENAME TO ${PREV_SCHEMA}`);
    }
    await client.query(`ALTER SCHEMA ${STAGING_SCHEMA} RENAME TO ${LIVE_SCHEMA}`);

    await client.query('COMMIT');
    log.info('schema swap complete', { live: LIVE_SCHEMA, prev: PREV_SCHEMA });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function updateMeta(args: {
  exportDate: string;
  exportVersion: string;
  tsvUrl: string;
  rowCounts: Record<string, number>;
  startedAt: Date;
}): Promise<void> {
  const pool = makePool();
  const normalisedVersion = args.exportVersion.replace(/^v/, '');
  try {
    await pool.query(
      `UPDATE scr._meta
         SET last_export_date = $1,
             last_export_version = $2,
             last_tsv_url = $3,
             last_row_counts = $4::jsonb,
             last_import_started = $5,
             last_import_finished = now()
       WHERE id = 1`,
      [
        args.exportDate,
        normalisedVersion,
        args.tsvUrl,
        JSON.stringify(args.rowCounts),
        args.startedAt,
      ],
    );
  } finally {
    await pool.end();
  }
}
