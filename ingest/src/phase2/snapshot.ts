import { makePool } from '../db.ts';
import { log } from '../log.ts';

/**
 * Write a monthly snapshot of `app.current_ratings` into `scr.rating_history`,
 * keyed to the first day of the current calendar month. No-op if we've
 * already snapshotted this month.
 *
 * Runs AFTER the atomic app swap so it reads from the live `app` schema
 * (where `current_ratings` now lives).
 */
export async function maybeSnapshot(): Promise<boolean> {
  const pool = makePool();
  try {
    const { rows } = await pool.query<{ last_snapshot_month: Date | null }>(
      `SELECT last_snapshot_month FROM scr.rating_snapshot_state WHERE id = 1`,
    );
    const last = rows[0]?.last_snapshot_month;
    const now = new Date();
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (last && sameMonth(last, firstOfMonth)) {
      log.info('phase2: snapshot already recorded for this month, skipping');
      return false;
    }

    // Snapshot everything currently in app.current_ratings under today's
    // month-start date. ON CONFLICT DO NOTHING is belt-and-suspenders in case
    // the state table and history drift.
    await pool.query(
      `INSERT INTO scr.rating_history (snapshot_date, competitor_id, event_id, rating, rank)
       SELECT $1::date, competitor_id, event_id, rating, rank
       FROM app.current_ratings
       ON CONFLICT DO NOTHING`,
      [firstOfMonth.toISOString().slice(0, 10)],
    );
    await pool.query(
      `UPDATE scr.rating_snapshot_state SET last_snapshot_month = $1::date WHERE id = 1`,
      [firstOfMonth.toISOString().slice(0, 10)],
    );
    log.info('phase2: monthly snapshot written', {
      month: firstOfMonth.toISOString().slice(0, 10),
    });
    return true;
  } finally {
    await pool.end();
  }
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}
