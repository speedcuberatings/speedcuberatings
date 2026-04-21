import type { MetadataRoute } from 'next';

/**
 * Keep `/calibrate` out of search indexes. It's an unlinked sandbox
 * meant for a non-technical collaborator tuning the rating formula; no
 * reason to leak it into Google. The public `/rankings` and
 * `/competitors` routes remain fully crawlable.
 *
 * Note: Next's metadata convention also honours the `robots` field on
 * route-level `metadata` exports (the calibrate page sets
 * `robots.index = false`). Belt-and-braces here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/calibrate', '/calibrate/'] },
    ],
  };
}
