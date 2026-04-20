import { ImageResponse } from 'next/og';
import { loadOgFonts, OG_SIZE, OG_COLORS } from '@/lib/og-fonts';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings';

export default async function OgImage() {
  const fonts = await loadOgFonts();
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
          padding: '72px 80px',
          fontFamily: 'Manrope',
          color: OG_COLORS.ink,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <CubeMark />
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px solid ${OG_COLORS.rule}`,
            paddingTop: 24,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 18,
              letterSpacing: 1,
              color: OG_COLORS.muted,
            }}
          >
            speedcuberatings.com
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
            based on WCA results
          </span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

function CubeMark() {
  const tiles: Array<{ x: number; y: number; fill: string }> = [];
  const colors = ['#f5f5f0', '#ffd73a', '#c03028', '#ff8c1a', '#1a5fd8', '#1fae4d'];
  let i = 0;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      tiles.push({
        x,
        y,
        fill: colors[(i * 2 + y) % colors.length]!,
      });
      i += 1;
    }
  }
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
          {[0, 1, 2].map((col) => {
            const t = tiles[row * 3 + col]!;
            return (
              <div
                key={col}
                style={{
                  width: 16,
                  height: 16,
                  backgroundColor: t.fill,
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
