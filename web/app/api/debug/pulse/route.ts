import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * Diagnostic endpoint — returns what this specific Vercel runtime actually
 * sees in the database. If it doesn't match what a direct psql query to the
 * same Neon project shows, we've got two different databases and the fix
 * is an env-var reconciliation, not a caching tweak.
 *
 * No force-dynamic / no caching tricks needed; Next's Route Handlers are
 * dynamic by default and don't inherit a parent segment's revalidate.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid';
    }
  })();

  const top3 = (await sql()`
    SELECT competitor_id, rating::float8 AS rating
      FROM app.current_ratings
     WHERE event_id = '333' AND metric = 'average'
     ORDER BY rating DESC
     LIMIT 3
  `) as Array<{ competitor_id: string; rating: number }>;

  const meta = (await sql()`
    SELECT last_import_finished::text   AS last_import_finished,
           last_export_date::text       AS last_export_date
      FROM scr._meta
     LIMIT 1
  `) as Array<{ last_import_finished: string; last_export_date: string }>;

  const counts = (await sql()`
    SELECT schemaname
      FROM pg_tables
     WHERE tablename='current_ratings'
     ORDER BY schemaname
  `) as Array<{ schemaname: string }>;

  return NextResponse.json({
    db_host: host,
    now: new Date().toISOString(),
    top3,
    meta: meta[0] ?? null,
    current_ratings_schemas: counts.map((c) => c.schemaname),
  });
}
