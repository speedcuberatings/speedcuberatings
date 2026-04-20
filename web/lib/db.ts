import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Neon's HTTP driver works in every Next.js runtime (Node, Edge, Cloudflare).
 * One-shot per query, memoised at the route-segment level by each page's
 * `revalidate` setting.
 */
let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = neon(url);
  return _sql;
}
