import { ImageResponse } from 'next/og';
import { OG_COLORS, OG_SIZE, loadOgFonts } from './og-fonts';
import type {
  Event,
  LeaderboardRow,
  CompetitorProfile,
  CompetitorEventRating,
  Metric,
} from './queries';
import { eventLabel, formatRating } from './format';

type FontsResult = Awaited<ReturnType<typeof loadOgFonts>>;

const imgOpts = (fonts: FontsResult) => ({ ...OG_SIZE, fonts });

/* -------- Home -------- */

export function renderHomeOg(fonts: FontsResult) {
  return new ImageResponse(
    (
      <div style={frameStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <CubeMark />
          <span style={eyebrowStyle()}>Speedcube Ratings</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: 120,
              lineHeight: 0.95,
              letterSpacing: -3,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 18,
            }}
          >
            <span>A different way</span>
            <span>to read the</span>
            <span style={{ fontStyle: 'italic', color: OG_COLORS.accent }}>
              leaderboard.
            </span>
          </span>
          <span
            style={{
              fontFamily: 'Manrope',
              fontSize: 28,
              color: OG_COLORS.muted,
              maxWidth: 880,
              lineHeight: 1.35,
            }}
          >
            Hourly performance ratings from the official WCA results export.
            Rating model by James Macdiarmid.
          </span>
        </div>
        <div style={footerRowStyle()}>
          <span style={footerMonoStyle()}>speedcuberatings.com</span>
          <span style={footerBodyStyle()}>based on WCA results</span>
        </div>
      </div>
    ),
    imgOpts(fonts),
  );
}

/* -------- Rankings -------- */

export interface RenderRankingsOgInput {
  event: Event;
  metric: Metric;
  regionLabel: string | null;
  top: LeaderboardRow[];
  path: string; // e.g. "rankings/333"
  fonts: FontsResult;
}

export function renderRankingsOg({
  event,
  metric,
  regionLabel,
  top,
  path,
  fonts,
}: RenderRankingsOgInput) {
  const metricLabel = metric === 'average' ? 'Average' : 'Single';
  return new ImageResponse(
    (
      <div style={frameStyle(56, 80)}>
        <div style={headerRowStyle()}>
          <span style={eyebrowStyle()}>Speedcube Ratings</span>
          <span style={eyebrowStyle()}>
            {regionLabel ? `${regionLabel} · ` : ''}
            {metricLabel}
            {regionLabel ? ' · Global rank' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: 104,
              lineHeight: 0.95,
              letterSpacing: -3,
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            {regionLabel && (
              <span style={{ color: OG_COLORS.ink }}>{regionLabel}</span>
            )}
            <span>{eventLabel(event.id, event.name)}</span>
            <span style={{ fontStyle: 'italic', color: OG_COLORS.accent }}>
              rankings
            </span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top.map((r, i) => (
              <div
                key={r.wca_id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 24,
                  paddingTop: 6,
                  borderTop: i === 0 ? `1px solid ${OG_COLORS.rule}` : 'none',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontSize: 40,
                    width: 68,
                    color: r.rank <= 3 ? OG_COLORS.accent : OG_COLORS.ink,
                    fontStyle: r.rank <= 3 ? 'italic' : 'normal',
                  }}
                >
                  {r.rank}
                </span>
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontSize: 32,
                    flex: 1,
                    color: OG_COLORS.ink,
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 32,
                    color: OG_COLORS.ink,
                  }}
                >
                  {formatRating(r.rating)}
                </span>
              </div>
            ))}
            {top.length === 0 && (
              <span
                style={{
                  fontFamily: 'Manrope',
                  fontSize: 20,
                  color: OG_COLORS.muted,
                  paddingTop: 12,
                }}
              >
                No competitors match this filter.
              </span>
            )}
          </div>
        </div>

        <div style={footerRowStyle()}>
          <span style={footerMonoStyle()}>
            speedcuberatings.com/{path}
          </span>
          <span style={footerBodyStyle()}>
            Based on WCA results · last 24 months
          </span>
        </div>
      </div>
    ),
    imgOpts(fonts),
  );
}

/* -------- Competitor -------- */

export interface RenderCompetitorOgInput {
  competitor: CompetitorProfile;
  ratings: CompetitorEventRating[];
  preferredMetric: Metric;
  fonts: FontsResult;
}

export function renderCompetitorOg({
  competitor,
  ratings,
  preferredMetric,
  fonts,
}: RenderCompetitorOgInput) {
  // Prefer ratings in the chosen metric. Fall back to the other metric
  // only if a given event has nothing in the preferred one.
  const byEvent = new Map<string, CompetitorEventRating>();
  for (const r of ratings) {
    const existing = byEvent.get(r.event_id);
    if (!existing) {
      byEvent.set(r.event_id, r);
      continue;
    }
    // Replace with the one matching preferredMetric, if that's this row.
    if (existing.metric !== preferredMetric && r.metric === preferredMetric) {
      byEvent.set(r.event_id, r);
    }
  }
  const highlights = [...byEvent.values()]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  const eventsCount = new Set(ratings.map((r) => r.event_id)).size;
  const metricLabel = preferredMetric === 'average' ? 'Average' : 'Single';

  return new ImageResponse(
    (
      <div style={frameStyle(56, 80)}>
        <div style={headerRowStyle()}>
          <span style={eyebrowStyle()}>Speedcube Ratings</span>
          <span style={{ ...eyebrowStyle(), fontFamily: 'JetBrains Mono' }}>
            {competitor.wca_id} · {metricLabel}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: 112,
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
            {eventsCount > 0 ? ` · Rated in ${eventsCount} events` : ''}
          </span>
        </div>

        {highlights.length > 0 ? (
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
                key={h.event_id + h.metric}
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
        ) : (
          <div
            style={{
              borderTop: `1px solid ${OG_COLORS.rule}`,
              paddingTop: 24,
              display: 'flex',
            }}
          >
            <span
              style={{
                fontFamily: 'Manrope',
                fontSize: 24,
                color: OG_COLORS.muted,
              }}
            >
              Not currently rated.
            </span>
          </div>
        )}
      </div>
    ),
    imgOpts(fonts),
  );
}

/* -------- Shared style helpers -------- */

function frameStyle(vPad = 72, hPad = 80): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: OG_COLORS.paper,
    padding: `${vPad}px ${hPad}px`,
    fontFamily: 'Manrope',
    color: OG_COLORS.ink,
  };
}

function headerRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };
}

function eyebrowStyle(): React.CSSProperties {
  return {
    fontFamily: 'Manrope',
    fontSize: 18,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: OG_COLORS.muted,
  };
}

function footerRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTop: `1px solid ${OG_COLORS.rule}`,
    paddingTop: 20,
  };
}

function footerMonoStyle(): React.CSSProperties {
  return {
    fontFamily: 'JetBrains Mono',
    fontSize: 16,
    letterSpacing: 1,
    color: OG_COLORS.muted,
  };
}

function footerBodyStyle(): React.CSSProperties {
  return {
    fontFamily: 'Manrope',
    fontSize: 16,
    color: OG_COLORS.muted,
  };
}

function CubeMark() {
  const colors = ['#f5f5f0', '#ffd73a', '#c03028', '#ff8c1a', '#1a5fd8', '#1fae4d'];
  const tiles: string[] = [];
  for (let i = 0; i < 9; i++) tiles.push(colors[(i * 2 + Math.floor(i / 3)) % colors.length]!);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        backgroundColor: OG_COLORS.ink,
        borderRadius: 8,
      }}
    >
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((col) => (
            <div
              key={col}
              style={{
                width: 16,
                height: 16,
                backgroundColor: tiles[row * 3 + col]!,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
