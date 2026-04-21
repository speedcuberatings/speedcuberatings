'use client';

import { useMemo } from 'react';
import { summariseConfigDiff } from '@/lib/rating-engine/diff';
import { engineParity as _ } from '@/lib/rating-engine/compute';
import type { RatingConfig } from '@/lib/rating-engine/types';

/**
 * Small editorial status row next to the metric toggle. Shows:
 *   - an engine-parity pill: "Matches production" when config = default
 *     and engine output matches `app.current_ratings` to < 0.01; warns
 *     when the engine drifts (suggests `ingest/src/derive/ratings.ts`
 *     was changed without updating `web/lib/rating-engine/defaults.ts`).
 *   - a breakdown of touched sections / active extras / per-event overrides.
 */
export function StatusBar({
  config,
  atDefault,
  parity,
  poolSize,
}: {
  config: RatingConfig;
  atDefault: boolean;
  parity: ReturnType<typeof _>;
  poolSize: number;
}) {
  const summary = useMemo(() => summariseConfigDiff(config), [config]);

  const parityBad = atDefault && parity.mae > 0.05;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tnum text-[var(--color-mute-2)]">
      {atDefault ? (
        parityBad ? (
          <span
            className="eyebrow !tracking-[0.12em] text-[var(--color-accent)]"
            title={`Engine drift: MAE vs production ${parity.mae.toFixed(3)}; worst Δ ${parity.worstDelta.toFixed(3)}. Keep rating-engine/defaults.ts in sync with ingest/src/derive/ratings.ts.`}
          >
            ⚠ engine drift
          </span>
        ) : (
          <span
            className="eyebrow !tracking-[0.12em] text-[var(--color-up)]"
            title={`Engine reproduces production to MAE ${parity.mae.toFixed(3)}`}
          >
            ✓ matches production
          </span>
        )
      ) : (
        <span className="eyebrow !tracking-[0.12em] text-[var(--color-accent)]">
          · custom
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>
        {summary.touchedSections.length} section
        {summary.touchedSections.length === 1 ? '' : 's'} touched
      </span>
      {summary.perEventOverrides > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {summary.perEventOverrides} event override
            {summary.perEventOverrides === 1 ? '' : 's'}
          </span>
        </>
      )}
      {summary.extrasEnabled.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-[var(--color-accent-soft)]">
            extras: {summary.extrasEnabled.join(', ')}
          </span>
        </>
      )}
      {poolSize > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span>pool {poolSize}</span>
        </>
      )}
    </div>
  );
}
