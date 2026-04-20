import { OG_SIZE, loadOgFonts } from '@/lib/og-fonts';
import { renderRankingsOg } from '@/lib/og-render';
import {
  getEvent,
  getLeaderboard,
  defaultMetricFor,
} from '@/lib/queries';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings — event leaderboard';

/**
 * Default OG image for a rankings page. Uses the event's natural metric
 * and no region filter — this is what social crawlers see via the
 * <meta og:image> tag. A separate `/og` route handles filtered variants.
 */
export default async function OgImage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event: eventId } = await params;
  const event = await getEvent(eventId);
  if (!event || !event.rateable) {
    return new Response('Event not found', { status: 404 });
  }

  const metric = defaultMetricFor(event);
  const [fonts, top] = await Promise.all([
    loadOgFonts(),
    getLeaderboard(event.id, { metric, limit: 3 }),
  ]);

  return renderRankingsOg({
    event,
    metric,
    regionLabel: null,
    top,
    path: `rankings/${event.id}`,
    fonts,
  });
}
