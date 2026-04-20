import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Neon's HTTP driver works in every Next.js runtime (Node, Edge, Cloudflare).
 *
 * We explicitly pass `fetchOptions: { cache: 'no-store' }` because the
 * underlying transport is `fetch()`, and Next.js will happily cache
 * per-query fetch responses at the route segment's `revalidate` TTL.
 * That led to production pinning ratings to whatever was in the database
 * the first time the route warmed up, even after background ingest runs
 * updated `app.current_ratings`. Caching at the SQL-response layer is
 * the wrong granularity for us — the route's `revalidate: 300` is fine,
 * but each render should freshly pull from Neon.
 */
let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = neon(url, { fetchOptions: { cache: 'no-store' } });
  return _sql;
}
