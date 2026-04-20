import { ImageResponse } from 'next/og';
import { loadOgFonts, OG_SIZE, OG_COLORS } from '@/lib/og-fonts';
import {
  getEvent,
  getLeaderboard,
  defaultMetricFor,
} from '@/lib/queries';
import { eventLabel, formatRating } from '@/lib/format';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings — event leaderboard';

export default async function OgImage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event: eventId } = await params;
  const event = await getEvent(eventId);
  if (!event || !event.rateable) return fallback();

  const metric = defaultMetricFor(event);
  const [fonts, top] = await Promise.all([
    loadOgFonts(),
    getLeaderboard(event.id, { metric, limit: 3 }),
  ]);

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
              fontFamily: 'Manrope',
              fontSize: 16,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: OG_COLORS.muted,
            }}
          >
            {metric === 'average' ? 'Average' : 'Single'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: 120,
              lineHeight: 0.95,
              letterSpacing: -3,
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <span>{eventLabel(event.id, event.name)}</span>
            <span style={{ fontStyle: 'italic', color: OG_COLORS.accent }}>
              rankings
            </span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top.map((r, i) => (
              <div
                key={r.wca_id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 24,
                  paddingTop: 8,
                  borderTop: i === 0 ? `1px solid ${OG_COLORS.rule}` : 'none',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontSize: 42,
                    width: 64,
                    color: i < 3 ? OG_COLORS.accent : OG_COLORS.ink,
                    fontStyle: i < 3 ? 'italic' : 'normal',
                  }}
                >
                  {r.rank}
                </span>
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontSize: 36,
                    flex: 1,
                    color: OG_COLORS.ink,
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 36,
                    color: OG_COLORS.ink,
                  }}
                >
                  {formatRating(r.rating)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px solid ${OG_COLORS.rule}`,
            paddingTop: 20,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 16,
              letterSpacing: 1,
              color: OG_COLORS.muted,
            }}
          >
            speedcuberatings.com/rankings/{event.id}
          </span>
          <span
            style={{
              fontFamily: 'Manrope',
              fontSize: 16,
              color: OG_COLORS.muted,
            }}
          >
            Based on WCA results · last 24 months
          </span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

function fallback() {
  return new Response('Event not found', { status: 404 });
}
