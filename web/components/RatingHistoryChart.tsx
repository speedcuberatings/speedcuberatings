import type { RatingHistoryPoint } from '@/lib/queries';

/**
 * Minimal editorial sparkline for per-event rating history. Hand-rolled SVG
 * to avoid a chart library and its bundle cost. No axes, no legend: this is
 * a decorative trend glyph alongside the numeric summary on profile pages.
 *
 * Falls back to an em-dash when we only have one data point (which is the
 * case during early operation, before we accumulate multiple monthly
 * snapshots).
 */
export function RatingHistoryChart({
  data,
  width = 260,
  height = 64,
}: {
  data: RatingHistoryPoint[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center font-mono text-[11px] text-[var(--color-mute-2)]"
        style={{ width, height }}
      >
        history begins next snapshot
      </div>
    );
  }

  const pad = 4;
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.rating);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const ySpan = Math.max(1e-6, yMax - yMin);

  const toX = (i: number) =>
    pad + ((width - 2 * pad) * i) / Math.max(1, xs.length - 1);
  const toY = (v: number) =>
    pad + (height - 2 * pad) * (1 - (v - yMin) / ySpan);

  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(d.rating).toFixed(2)}`)
    .join(' ');

  const last = data[data.length - 1]!;
  const first = data[0]!;
  const trendUp = last.rating >= first.rating;
  const color = trendUp ? 'var(--color-up)' : 'var(--color-down)';

  return (
    <svg
      role="img"
      aria-label={`Rating trend from ${first.rating.toFixed(2)} to ${last.rating.toFixed(2)}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      {/* Trend area */}
      <path
        d={`${path} L ${toX(data.length - 1)} ${height - pad} L ${toX(0)} ${height - pad} Z`}
        fill={color}
        opacity={0.1}
      />
      {/* Baseline rule */}
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke="var(--color-rule)"
        strokeWidth={1}
      />
      {/* Trend line */}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* End dot */}
      <circle
        cx={toX(data.length - 1)}
        cy={toY(last.rating)}
        r={3}
        fill="var(--color-paper)"
        stroke={color}
        strokeWidth={1.5}
      />
    </svg>
  );
}
