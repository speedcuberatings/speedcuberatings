import { OG_SIZE, loadOgFonts } from '@/lib/og-fonts';
import { renderCompetitorOg } from '@/lib/og-render';
import { getCompetitor, getCompetitorRatings } from '@/lib/queries';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings — competitor profile';

/**
 * Default competitor OG image: shows the top three event ratings, preferring
 * average where the competitor has one. Filtered variants (single-only) are
 * handled by the `/og` route handler alongside this file.
 */
export default async function OgImage({
  params,
}: {
  params: Promise<{ wcaId: string }>;
}) {
  const { wcaId } = await params;
  const competitor = await getCompetitor(wcaId);
  if (!competitor) return new Response('Not found', { status: 404 });

  const [fonts, ratings] = await Promise.all([
    loadOgFonts(),
    getCompetitorRatings(wcaId),
  ]);

  return renderCompetitorOg({
    competitor,
    ratings,
    preferredMetric: 'average',
    fonts,
  });
}
