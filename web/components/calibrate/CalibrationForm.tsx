'use client';

import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_CONFIG } from '@/lib/rating-engine/defaults';
import type {
  ChampionshipScope,
  FormatId,
  RatingConfig,
} from '@/lib/rating-engine/types';

/**
 * Main config form for the calibration page.
 *
 * Every tweakable knob maps to a labelled number input with a matching
 * range slider. Sections collapse so the form stays scannable even with
 * ~30 parameters exposed. Each field has a "reset this" affordance that
 * snaps it back to the default value so exploration can stay iterative.
 *
 * All updates are produced as deep-cloned `RatingConfig` objects via
 * `patchConfig` so React reliably sees new references.
 */
export function CalibrationForm({
  config,
  onChange,
}: {
  config: RatingConfig;
  onChange: (next: RatingConfig) => void;
}) {
  const update = useCallback(
    (patch: (prev: RatingConfig) => RatingConfig) => {
      onChange(patch(config));
    },
    [config, onChange],
  );

  return (
    <div className="font-body">
      <p className="eyebrow mb-4">Global parameters</p>

      <Section title="Window" defaultOpen>
        <NumberKnob
          label="Window years"
          help="Anchored on the competitor's most recent round in the event."
          hint="↑ longer window = more results included, smooths ratings"
          min={0.25}
          max={2}
          step={0.25}
          value={config.windowYears}
          defaultValue={DEFAULT_CONFIG.windowYears}
          onChange={(v) => update((c) => ({ ...c, windowYears: v }))}
        />
        <NumberKnob
          label="Minimum results"
          help="Competitors with fewer rounds in window are excluded."
          hint="↑ higher = fewer competitors qualify for ranking"
          min={1}
          max={10}
          step={1}
          value={config.minResults}
          defaultValue={DEFAULT_CONFIG.minResults}
          onChange={(v) => update((c) => ({ ...c, minResults: Math.round(v) }))}
        />
      </Section>

      <Section title="Recency & inactivity">
        <NumberKnob
          label="Weight base"
          help="Per-day recency decay. 0.99 ^ days_since_competition."
          hint="↓ lower = recent results matter more, old results fade faster"
          min={0.9}
          max={1}
          step={0.001}
          value={config.weightBase}
          defaultValue={DEFAULT_CONFIG.weightBase}
          precision={4}
          onChange={(v) => update((c) => ({ ...c, weightBase: v }))}
        />
        <NumberKnob
          label="Inactivity base"
          help="Per-day decay beyond grace. 0.9995 ^ (days − grace)."
          hint="↓ lower = inactive competitors lose rating faster"
          min={0.99}
          max={1}
          step={0.0001}
          value={config.inactivityBase}
          defaultValue={DEFAULT_CONFIG.inactivityBase}
          precision={5}
          onChange={(v) => update((c) => ({ ...c, inactivityBase: v }))}
        />
        <NumberKnob
          label="Default grace days"
          help="Days of inactivity before decay kicks in (overridable per-event)."
          hint="↑ longer grace = competitors can be inactive longer before penalty"
          min={0}
          max={730}
          step={5}
          value={config.defaultGraceDays}
          defaultValue={DEFAULT_CONFIG.defaultGraceDays}
          onChange={(v) => update((c) => ({ ...c, defaultGraceDays: Math.round(v) }))}
        />
      </Section>

      <Section title="Kinch base">
        <NumberKnob
          label="Kinch scale"
          help="Score = kinchScale × (WR / your_result). Scales the whole leaderboard."
          hint="↑ higher = all ratings scale up proportionally"
          min={10}
          max={1000}
          step={10}
          value={config.kinchScale}
          defaultValue={DEFAULT_CONFIG.kinchScale}
          onChange={(v) => update((c) => ({ ...c, kinchScale: v }))}
        />
      </Section>

      <Section title="Placement bonus">
        <NumberKnob
          label="Base offset"
          help="Flat term (R+S+T+U + baseOffset), applied to every round."
          hint="↑ higher = bigger placement bonus for everyone"
          min={0}
          max={2}
          step={0.1}
          value={config.placement.baseOffset}
          defaultValue={DEFAULT_CONFIG.placement.baseOffset}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, baseOffset: v } }))
          }
        />
        <NumberKnob
          label="Scale"
          help="Multiplier on (R+S+T+U+base) × champMult."
          hint="↑ higher = placement matters more in final rating"
          min={0}
          max={1}
          step={0.01}
          value={config.placement.scale}
          defaultValue={DEFAULT_CONFIG.placement.scale}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, scale: v } }))
          }
        />
        <NumberKnob
          label="Cleanup offset"
          help="Subtracted after scaling. Negative by default."
          hint="↓ more negative = reduces the placement bonus further"
          min={-0.5}
          max={0.5}
          step={0.005}
          value={config.placement.cleanupOffset}
          defaultValue={DEFAULT_CONFIG.placement.cleanupOffset}
          precision={3}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, cleanupOffset: v } }))
          }
        />
        <NumberKnob
          label="R · Final weight"
          hint="↑ higher = competing in finals boosts rating more"
          min={0}
          max={4}
          step={0.25}
          value={config.placement.finalWeight}
          defaultValue={DEFAULT_CONFIG.placement.finalWeight}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, finalWeight: v } }))
          }
        />
        <NumberKnob
          label="S · Bronze+ weight"
          hint="↑ higher = top-3 finishers get a bigger bonus"
          min={0}
          max={4}
          step={0.25}
          value={config.placement.bronzePlusWeight}
          defaultValue={DEFAULT_CONFIG.placement.bronzePlusWeight}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, bronzePlusWeight: v } }))
          }
        />
        <NumberKnob
          label="T · Silver+ weight"
          hint="↑ higher = top-2 finishers get a bigger bonus"
          min={0}
          max={4}
          step={0.25}
          value={config.placement.silverPlusWeight}
          defaultValue={DEFAULT_CONFIG.placement.silverPlusWeight}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, silverPlusWeight: v } }))
          }
        />
        <NumberKnob
          label="U · Gold weight"
          help="Added on top of R+S+T when the competitor wins the final."
          hint="↑ higher = winning the final boosts rating more"
          min={0}
          max={4}
          step={0.25}
          value={config.placement.goldWeight}
          defaultValue={DEFAULT_CONFIG.placement.goldWeight}
          onChange={(v) =>
            update((c) => ({ ...c, placement: { ...c.placement, goldWeight: v } }))
          }
        />

        <div className="mt-3 pt-3 border-t rule">
          <p className="eyebrow mb-2 !tracking-[0.12em]">Championship multipliers</p>
          {(['world', 'continental', 'national', 'none'] as ChampionshipScope[]).map((k) => (
            <NumberKnob
              key={k}
              label={labelForScope(k)}
              hint="↑ higher = results at this tier boost rating more"
              min={0}
              max={10}
              step={0.25}
              value={config.placement.champMult[k]}
              defaultValue={DEFAULT_CONFIG.placement.champMult[k]}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  placement: {
                    ...c.placement,
                    champMult: { ...c.placement.champMult, [k]: v },
                  },
                }))
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Record bonus">
        <NumberKnob
          label="Any record (NR+)"
          help="Added when round set any national-or-better record."
          hint="↑ higher = setting a national record boosts rating more"
          min={0}
          max={10}
          step={0.5}
          value={config.record.anyRecord}
          defaultValue={DEFAULT_CONFIG.record.anyRecord}
          onChange={(v) =>
            update((c) => ({ ...c, record: { ...c.record, anyRecord: v } }))
          }
        />
        <NumberKnob
          label="Continental or higher"
          hint="↑ higher = continental/world records boost rating more"
          min={0}
          max={10}
          step={0.5}
          value={config.record.continentalOrHigher}
          defaultValue={DEFAULT_CONFIG.record.continentalOrHigher}
          onChange={(v) =>
            update((c) => ({
              ...c,
              record: { ...c.record, continentalOrHigher: v },
            }))
          }
        />
        <NumberKnob
          label="World record"
          hint="↑ higher = world records boost rating more"
          min={0}
          max={10}
          step={0.5}
          value={config.record.worldRecord}
          defaultValue={DEFAULT_CONFIG.record.worldRecord}
          onChange={(v) =>
            update((c) => ({ ...c, record: { ...c.record, worldRecord: v } }))
          }
        />
      </Section>

      <Section title="Bonus outer scale">
        <NumberKnob
          label="Bonus modifier"
          help="1 + bonusModifier × (placementScore + recordScore)"
          hint="↑ higher = placement and record bonuses have more impact"
          min={0}
          max={0.05}
          step={0.001}
          value={config.bonusModifier}
          defaultValue={DEFAULT_CONFIG.bonusModifier}
          precision={4}
          onChange={(v) => update((c) => ({ ...c, bonusModifier: v }))}
        />
      </Section>

      <p className="eyebrow mt-8 mb-3 text-[var(--color-accent-soft)]">
        experimental extras
      </p>

      <Section
        title="DNF-rate adjustment"
        subtitle={config.extras.dnfPenalty.enabled ? 'ON' : 'off'}
      >
        <Toggle
          label="Enable DNF adjustment"
          hint="on = penalises competitors with high DNF rates"
          value={config.extras.dnfPenalty.enabled}
          onChange={(v) =>
            update((c) => ({
              ...c,
              extras: {
                ...c.extras,
                dnfPenalty: { ...c.extras.dnfPenalty, enabled: v },
              },
            }))
          }
        />
        {config.extras.dnfPenalty.enabled && (
          <>
            <NumberKnob
              label="α (penalty slope)"
              help="Slope applied when dnfRate > baseline. rating *= max(floor, 1 − α × (dnfRate − baseline))"
              hint="↑ higher = heavier penalty for high-DNF competitors"
              min={0}
              max={5}
              step={0.1}
              value={config.extras.dnfPenalty.alpha}
              defaultValue={DEFAULT_CONFIG.extras.dnfPenalty.alpha}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  extras: {
                    ...c.extras,
                    dnfPenalty: { ...c.extras.dnfPenalty, alpha: v },
                  },
                }))
              }
            />
            <NumberKnob
              label="β (bonus slope)"
              help="Slope applied when dnfRate < baseline — the reward side. Default matches α for symmetric two-sided behaviour. Set to 0 for penalty-only. rating *= min(ceil, 1 + β × (baseline − dnfRate))"
              hint="↑ higher = bigger reward for low-DNF competitors (0 = no reward)"
              min={0}
              max={5}
              step={0.1}
              value={config.extras.dnfPenalty.bonusAlpha}
              defaultValue={DEFAULT_CONFIG.extras.dnfPenalty.bonusAlpha}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  extras: {
                    ...c.extras,
                    dnfPenalty: { ...c.extras.dnfPenalty, bonusAlpha: v },
                  },
                }))
              }
            />
            <NumberKnob
              label="Baseline DNF rate"
              help="Expected background DNF rate. Penalty applies above; bonus applies below (if β > 0)."
              hint="↑ higher = more DNFs tolerated before penalty kicks in"
              min={0}
              max={1}
              step={0.01}
              value={config.extras.dnfPenalty.baselineRate}
              defaultValue={DEFAULT_CONFIG.extras.dnfPenalty.baselineRate}
              precision={3}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  extras: {
                    ...c.extras,
                    dnfPenalty: { ...c.extras.dnfPenalty, baselineRate: v },
                  },
                }))
              }
            />
            <NumberKnob
              label="Floor"
              help="Never multiply rating by less than this."
              hint="↑ higher = limits the maximum penalty (protects high-DNF competitors)"
              min={0.1}
              max={1}
              step={0.05}
              value={config.extras.dnfPenalty.floor}
              defaultValue={DEFAULT_CONFIG.extras.dnfPenalty.floor}
              precision={2}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  extras: {
                    ...c.extras,
                    dnfPenalty: { ...c.extras.dnfPenalty, floor: v },
                  },
                }))
              }
            />
            <NumberKnob
              label="Ceil"
              help="Never multiply rating by more than this (caps the bonus side)."
              hint="↑ higher = allows bigger reward for low-DNF competitors"
              min={1}
              max={2}
              step={0.05}
              value={config.extras.dnfPenalty.ceil}
              defaultValue={DEFAULT_CONFIG.extras.dnfPenalty.ceil}
              precision={2}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  extras: {
                    ...c.extras,
                    dnfPenalty: { ...c.extras.dnfPenalty, ceil: v },
                  },
                }))
              }
            />
          </>
        )}
      </Section>

      <Section
        title="Per-format weights"
        subtitle={config.extras.formatWeights.enabled ? 'ON' : 'off'}
      >
        <Toggle
          label="Enable per-format weights"
          hint="on = weight rounds differently based on format (Ao5, Mo3, etc.)"
          value={config.extras.formatWeights.enabled}
          onChange={(v) =>
            update((c) => ({
              ...c,
              extras: {
                ...c.extras,
                formatWeights: { ...c.extras.formatWeights, enabled: v },
              },
            }))
          }
        />
        {config.extras.formatWeights.enabled && (
          <>
            <p className="text-[11px] text-[var(--color-mute-2)] mt-2 mb-3">
              Multiplies each round&rsquo;s Kinch-post-bonus score by the
              format weight. 1.0 = no change. Set a format to 0 to
              exclude that format type from the rating.
            </p>
            {(['a', 'm', '5', '3', '2', '1', 'unknown'] as const).map((f) => (
              <NumberKnob
                key={f}
                label={labelForFormat(f)}
                hint="↑ higher = this format contributes more to rating (0 = excluded)"
                min={0}
                max={2}
                step={0.05}
                value={config.extras.formatWeights.weights[f] ?? 1}
                defaultValue={DEFAULT_CONFIG.extras.formatWeights.weights[f] ?? 1}
                precision={2}
                onChange={(v) =>
                  update((c) => ({
                    ...c,
                    extras: {
                      ...c.extras,
                      formatWeights: {
                        ...c.extras.formatWeights,
                        weights: {
                          ...c.extras.formatWeights.weights,
                          [f]: v,
                        },
                      },
                    },
                  }))
                }
              />
            ))}
          </>
        )}
      </Section>

      <Section
        title="Round-type filter"
        subtitle={config.extras.roundTypeFilter.enabled ? 'ON' : 'off'}
      >
        <Toggle
          label="Enable round-type filter"
          hint="on = only selected round types count toward rating"
          value={config.extras.roundTypeFilter.enabled}
          onChange={(v) =>
            update((c) => ({
              ...c,
              extras: {
                ...c.extras,
                roundTypeFilter: { ...c.extras.roundTypeFilter, enabled: v },
              },
            }))
          }
        />
        {config.extras.roundTypeFilter.enabled && (
          <>
            <p className="text-[11px] text-[var(--color-mute-2)] mt-2 mb-3">
              Only rounds whose <code>round_type_id</code> appears here
              contribute. Disable this to fall back to "count every round".
            </p>
            <div className="flex flex-wrap gap-2">
              {ROUND_TYPE_CHOICES.map((rt) => {
                const on = config.extras.roundTypeFilter.include.includes(rt.id);
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() =>
                      update((c) => {
                        const list = new Set(c.extras.roundTypeFilter.include);
                        if (on) list.delete(rt.id);
                        else list.add(rt.id);
                        return {
                          ...c,
                          extras: {
                            ...c.extras,
                            roundTypeFilter: {
                              ...c.extras.roundTypeFilter,
                              include: [...list],
                            },
                          },
                        };
                      })
                    }
                    className={[
                      'border rule rounded-[2px] px-2.5 py-1 text-[11px] tracking-[0.06em]',
                      on
                        ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]',
                    ].join(' ')}
                  >
                    {rt.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t rule py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-1
                   text-left hover:text-[var(--color-accent)] transition-colors cursor-pointer"
      >
        <span
          className="font-display text-[1.05rem] leading-none text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30, "wght" 500' }}
        >
          {title}
        </span>
        <span className="flex items-baseline gap-2">
          {subtitle && (
            <span className="eyebrow !tracking-[0.12em] text-[var(--color-mute-2)]">
              {subtitle}
            </span>
          )}
          <Caret open={open} />
        </span>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 12 12"
      style={{
        transition: 'transform 180ms ease',
        transform: open ? 'rotate(180deg)' : 'none',
        color: 'var(--color-muted)',
      }}
    >
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NumberKnob({
  label,
  help,
  hint,
  min,
  max,
  step,
  value,
  defaultValue,
  precision = 3,
  onChange,
}: {
  label: string;
  help?: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  defaultValue?: number;
  precision?: number;
  onChange: (v: number) => void;
}) {
  const isDirty = useMemo(
    () =>
      defaultValue !== undefined &&
      Math.abs(value - defaultValue) > Math.max(step / 2, 1e-9),
    [value, defaultValue, step],
  );
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="text-[12px] font-body text-[var(--color-ink)] leading-tight">
          {label}
          {isDirty && (
            <span
              aria-label="Differs from default"
              className="ml-2 inline-block w-[6px] h-[6px] rounded-full bg-[var(--color-accent)] align-middle"
            />
          )}
        </label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(v, min, max));
          }}
          className="w-[88px] text-right font-mono tnum text-[12px]
                     bg-transparent border rule rounded-[2px] px-2 py-1
                     focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 accent-[var(--color-accent)]"
        />
        {defaultValue !== undefined && isDirty && (
          <button
            type="button"
            title={`Reset to ${defaultValue}`}
            onClick={() => onChange(defaultValue)}
            className="text-[11px] text-[var(--color-mute-2)] hover:text-[var(--color-accent)]
                       transition-colors cursor-pointer whitespace-nowrap"
          >
            reset
          </button>
        )}
      </div>
      {help && (
        <p className="text-[11px] text-[var(--color-mute-2)] mt-1 leading-snug">
          {help}
        </p>
      )}
      {hint && (
        <p className="text-[11px] italic text-[var(--color-muted)] mt-0.5 leading-snug">
          {hint}
        </p>
      )}
      {precision && <span className="sr-only">precision {precision}</span>}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex flex-col gap-0.5 w-full py-1
                 text-[13px] font-body text-[var(--color-ink)] cursor-pointer"
    >
      <span className="flex items-center justify-between gap-3 w-full">
        <span>{label}</span>
      <span
        className={[
          'inline-flex items-center w-[36px] h-[20px] rounded-full p-[2px] transition-colors',
          value
            ? 'bg-[var(--color-accent)]'
            : 'bg-[var(--color-rule-strong)] hover:bg-[var(--color-muted)]',
        ].join(' ')}
      >
        <span
          className="block w-[16px] h-[16px] rounded-full bg-[var(--color-paper)]
                     shadow-sm transition-transform"
          style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
        </span>
      </span>
      {hint && (
        <span className="text-[11px] italic text-[var(--color-muted)] leading-snug text-left">
          {hint}
        </span>
      )}
    </button>
  );
}

function labelForScope(s: ChampionshipScope): string {
  switch (s) {
    case 'world':
      return 'Worlds';
    case 'continental':
      return 'Continental';
    case 'national':
      return 'National';
    case 'none':
      return 'Non-championship';
  }
}

function labelForFormat(f: FormatId | 'unknown'): string {
  switch (f) {
    case 'a':
      return 'Ao5 (a)';
    case 'm':
      return 'Mo3 (m)';
    case '5':
      return 'Bo5 (5)';
    case '3':
      return 'Bo3 (3)';
    case '2':
      return 'Bo2 (2)';
    case '1':
      return 'Bo1 (1)';
    case 'unknown':
      return 'Unknown / other';
  }
}

const ROUND_TYPE_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'f', label: 'Final' },
  { id: 'c', label: 'Combined Final' },
  { id: 'g', label: 'Semi (g)' },
  { id: '3', label: 'Semi (3)' },
  { id: 'e', label: 'R2 (e)' },
  { id: '2', label: 'R2 (2)' },
  { id: 'd', label: 'R1 (d)' },
  { id: '1', label: 'R1 (1)' },
  { id: 'h', label: '1st round (h)' },
  { id: 'b', label: '1st round (b)' },
  { id: '0', label: '1st round (0)' },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
