/**
 * Month-over-month delta indicator. Positive = climbed (higher is better, so
 * rank went down numerically). Negative = descended.
 */
export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span
        aria-label="no prior snapshot"
        className="font-mono tnum text-[11px] tracking-wide text-[var(--color-mute-2)]"
      >
        —
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span
        aria-label="unchanged"
        className="font-mono tnum text-[11px] tracking-wide text-[var(--color-muted)]"
      >
        ·
      </span>
    );
  }
  const up = delta > 0;
  const color = up ? 'text-[var(--color-up)]' : 'text-[var(--color-down)]';
  return (
    <span
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(delta)}`}
      className={`font-mono tnum text-[11px] leading-none tracking-wide ${color} inline-flex items-center gap-1`}
    >
      <span aria-hidden="true" className="text-[9px]">
        {up ? '▲' : '▼'}
      </span>
      {Math.abs(delta)}
    </span>
  );
}
