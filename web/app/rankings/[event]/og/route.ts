import { NextRequest } from 'next/server';
import { loadOgFonts } from '@/lib/og-fonts';
import { renderRankingsOg } from '@/lib/og-render';
import {
  coerceMetric,
  defaultMetricFor,
  getContinents,
  getCountries,
  getEvent,
  getLeaderboard,
} from '@/lib/queries';

export const runtime = 'nodejs';

/**
 * Filter-aware OG image endpoint. Reads `metric` and `region` from the
 * query string so the "Share card" link on the rankings page carries
 * the current view's filters into the generated image.
 *
 * The static `opengraph-image.tsx` alongside this file still handles the
 * default (unfiltered) case for social-crawler <meta og:image> tags.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ event: string }> },
) {
  const { event: eventId } = await ctx.params;
  const event = await getEvent(eventId);
  if (!event || !event.rateable) {
    return new Response('Event not found', { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const region = sp.get('region') || null;
  const requested = coerceMetric(sp.get('metric'), defaultMetricFor(event));
  // If the requested metric doesn't exist for this event, fall back.
  const metric =
    (requested === 'single' && !event.has_single) ||
    (requested === 'average' && !event.has_average)
      ? defaultMetricFor(event)
      : requested;

  const [fonts, top, continents, countries] = await Promise.all([
    loadOgFonts(),
    getLeaderboard(event.id, { metric, region, limit: 3 }),
    getContinents(),
    getCountries(),
  ]);

  const regionLabel = region
    ? region.startsWith('_')
      ? (continents.find((c) => c.id === region)?.name ?? null)
      : (countries.find((c) => c.id === region)?.name ?? null)
    : null;

  const path = buildPath(event.id, metric, region);
  return renderRankingsOg({ event, metric, regionLabel, top, path, fonts });
}

function buildPath(
  eventId: string,
  metric: 'single' | 'average',
  region: string | null,
): string {
  const qs = new URLSearchParams();
  if (metric === 'single') qs.set('metric', 'single');
  if (region) qs.set('region', region);
  const s = qs.toString();
  return `rankings/${eventId}${s ? `?${s}` : ''}`;
}
