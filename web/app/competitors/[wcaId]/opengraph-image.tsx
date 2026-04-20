import { ImageResponse } from 'next/og';
import { loadOgFonts, OG_SIZE, OG_COLORS } from '@/lib/og-fonts';
import {
  getCompetitor,
  getCompetitorRatings,
} from '@/lib/queries';
import { eventLabel, formatRating } from '@/lib/format';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings — competitor profile';

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

  // Best three by rating, preferring average.
  const topByEvent = new Map<string, { event_id: string; event_name: string; rating: number; rank: number; metric: string }>();
  for (const r of ratings) {
    const existing = topByEvent.get(r.event_id);
    if (!existing || r.rating > existing.rating) {
      topByEvent.set(r.event_id, {
        event_id: r.event_id,
        event_name: r.event_name,
        rating: r.rating,
        rank: r.rank,
        metric: r.metric,
      });
    }
  }
  const highlights = [...topByEvent.values()]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: OG_COLORS.paper,
          padding: '64px 80px',
          fontFamily: 'Manrope',
          color: OG_COLORS.ink,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: 'Manrope',
              fontSize: 18,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: OG_COLORS.muted,
            }}
          >
            Speedcube Ratings
          </span>
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 16,
              letterSpacing: 1,
              color: OG_COLORS.muted,
            }}
          >
            {competitor.wca_id}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: 120,
              lineHeight: 0.95,
              letterSpacing: -3,
              color: OG_COLORS.ink,
              display: 'flex',
            }}
          >
            {competitor.name}
          </span>
          <span
            style={{
              fontFamily: 'Manrope',
              fontSize: 24,
              color: OG_COLORS.muted,
            }}
          >
            {competitor.country_id}
            {highlights.length > 0
              ? ` · Rated in ${ratings.length > 0 ? new Set(ratings.map((r) => r.event_id)).size : 0} events`
              : ''}
          </span>
        </div>

        {highlights.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 40,
              borderTop: `1px solid ${OG_COLORS.rule}`,
              paddingTop: 24,
            }}
          >
            {highlights.map((h, i) => (
              <div
                key={h.event_id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  flex: 1,
                  borderLeft: i === 0 ? 'none' : `1px solid ${OG_COLORS.rule}`,
                  paddingLeft: i === 0 ? 0 : 40,
                }}
              >
                <span
                  style={{
                    fontFamily: 'Manrope',
                    fontSize: 14,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: OG_COLORS.muted,
                  }}
                >
                  {eventLabel(h.event_id, h.event_name)} ·{' '}
                  {h.metric === 'average' ? 'Average' : 'Single'}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 56,
                    color: OG_COLORS.ink,
                  }}
                >
                  {formatRating(h.rating)}
                </span>
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontSize: 20,
                    fontStyle: 'italic',
                    color: OG_COLORS.accent,
                  }}
                >
                  #{h.rank.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
