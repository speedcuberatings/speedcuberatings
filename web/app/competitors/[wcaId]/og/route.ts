import { NextRequest } from 'next/server';
import { loadOgFonts } from '@/lib/og-fonts';
import { renderCompetitorOg } from '@/lib/og-render';
import {
  coerceMetric,
  getCompetitor,
  getCompetitorRatings,
} from '@/lib/queries';

export const runtime = 'nodejs';

/**
 * Filter-aware competitor OG. `metric` query param picks which metric the
 * highlight cards prefer; falls back to the other when a given event
 * isn't rated in the preferred metric.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await ctx.params;
  const competitor = await getCompetitor(wcaId);
  if (!competitor) return new Response('Not found', { status: 404 });

  const preferredMetric = coerceMetric(
    req.nextUrl.searchParams.get('metric'),
    'average',
  );

  const [fonts, ratings] = await Promise.all([
    loadOgFonts(),
    getCompetitorRatings(wcaId),
  ]);

  return renderCompetitorOg({ competitor, ratings, preferredMetric, fonts });
}
