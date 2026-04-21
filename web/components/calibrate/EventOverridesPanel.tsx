'use client';

import { useMemo, useState } from 'react';
import type { EventPickerItem } from '@/components/EventPicker';
import type {
  EventOverride,
  RatingConfig,
} from '@/lib/rating-engine/types';
import { eventLabel } from '@/lib/format';
import { NumberKnob, Toggle } from './CalibrationForm';

/**
 * Per-event overrides panel. For every event the user can:
 *  - Override any global parameter at the event level (field-granular).
 *  - "Inherit from default" — deleting the override field restores the
 *    global config's value.
 *
 * The UI intentionally mirrors the global form's section structure but
 * with an "Override this field?" pattern per row: uncheck the override
 * checkbox and the field drops out of `eventOverrides[eventId]`.
 *
 * Active overrides are listed at the top of the panel so it's obvious
 * when an event has been customised — important for a non-technical
 * user comparing scenarios.
 */
export function EventOverridesPanel({
  config,
  onChange,
  events,
  activeEventId,
}: {
  config: RatingConfig;
  onChange: (next: RatingConfig) => void;
  events: EventPickerItem[];
  activeEventId: string;
}) {
  const [selected, setSelected] = useState<string>(activeEventId);
  const override: EventOverride = config.eventOverrides[selected] ?? {};

  // keys in eventOverrides whose value is truthy (non-empty object)
  const overriddenEvents = useMemo(() => {
    return Object.entries(config.eventOverrides)
      .filter(([, v]) => v && Object.keys(v).length > 0)
      .map(([id]) => id);
  }, [config.eventOverrides]);

  const setOverride = (patch: (prev: EventOverride) => EventOverride) => {
    const next = patch(override);
    const isEmpty =
      !next.placement &&
      !next.record &&
      !next.extras &&
      next.graceDays === undefined &&
      next.windowYears === undefined &&
      next.minResults === undefined &&
      next.weightBase === undefined &&
      next.inactivityBase === undefined &&
      next.bonusModifier === undefined &&
      next.kinchScale === undefined;
    const updated = { ...config.eventOverrides };
    if (isEmpty) delete updated[selected];
    else updated[selected] = next;
    onChange({ ...config, eventOverrides: updated });
  };

  const clearEvent = () => {
    const updated = { ...config.eventOverrides };
    delete updated[selected];
    onChange({ ...config, eventOverrides: updated });
  };

  return (
    <section>
      <p className="eyebrow mb-3">Per-event overrides</p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-transparent border rule rounded-[2px] px-2 py-1.5
                     text-[13px] font-body text-[var(--color-ink)]
                     focus:outline-none focus:border-[var(--color-accent)]"
        >
          {events.map((e) => {
            const has = !!config.eventOverrides[e.id] &&
              Object.keys(config.eventOverrides[e.id]!).length > 0;
            return (
              <option key={e.id} value={e.id}>
                {eventLabel(e.id, e.name)} {has ? '·' : ''}
              </option>
            );
          })}
        </select>
        {Object.keys(override).length > 0 && (
          <button
            type="button"
            onClick={clearEvent}
            className="text-[11px] text-[var(--color-mute-2)] hover:text-[var(--color-accent)]
                       transition-colors cursor-pointer"
          >
            reset {eventLabel(selected)}
          </button>
        )}
      </div>

      {overriddenEvents.length > 0 && (
        <p className="text-[11px] text-[var(--color-mute-2)] mb-3 leading-snug">
          overrides active in{' '}
          {overriddenEvents
            .map((id) => eventLabel(id))
            .join(', ')}
          .
        </p>
      )}

      <OverrideKnob
        label="Window years"
        globalValue={config.windowYears}
        overrideValue={override.windowYears}
        min={0.25}
        max={2}
        step={0.25}
        onChange={(v) => setOverride((p) => ({ ...p, windowYears: v }))}
      />
      <OverrideKnob
        label="Minimum results"
        globalValue={config.minResults}
        overrideValue={override.minResults}
        min={1}
        max={10}
        step={1}
        round
        onChange={(v) => setOverride((p) => ({ ...p, minResults: v }))}
      />
      <OverrideKnob
        label="Grace days"
        globalValue={
          config.graceDaysByEvent[selected] ?? config.defaultGraceDays
        }
        overrideValue={override.graceDays}
        min={0}
        max={730}
        step={5}
        round
        onChange={(v) => setOverride((p) => ({ ...p, graceDays: v }))}
      />
      <OverrideKnob
        label="Weight base"
        globalValue={config.weightBase}
        overrideValue={override.weightBase}
        min={0.9}
        max={1}
        step={0.001}
        precision={4}
        onChange={(v) => setOverride((p) => ({ ...p, weightBase: v }))}
      />
      <OverrideKnob
        label="Inactivity base"
        globalValue={config.inactivityBase}
        overrideValue={override.inactivityBase}
        min={0.99}
        max={1}
        step={0.0001}
        precision={5}
        onChange={(v) => setOverride((p) => ({ ...p, inactivityBase: v }))}
      />
      <OverrideKnob
        label="Bonus modifier"
        globalValue={config.bonusModifier}
        overrideValue={override.bonusModifier}
        min={0}
        max={0.05}
        step={0.001}
        precision={4}
        onChange={(v) => setOverride((p) => ({ ...p, bonusModifier: v }))}
      />

      <div className="mt-4 border-t rule pt-3">
        <p className="eyebrow mb-2 !tracking-[0.12em]">Extras (per-event)</p>
        <Toggle
          label="DNF penalty on for this event"
          value={
            override.extras?.dnfPenalty?.enabled ??
            config.extras.dnfPenalty.enabled
          }
          onChange={(v) =>
            setOverride((p) => ({
              ...p,
              extras: {
                ...p.extras,
                dnfPenalty: { ...p.extras?.dnfPenalty, enabled: v },
              },
            }))
          }
        />
        {override.extras?.dnfPenalty?.enabled !== undefined && (
          <button
            type="button"
            onClick={() =>
              setOverride((p) => {
                const next = { ...p };
                if (!next.extras) return next;
                const dnfp = { ...next.extras.dnfPenalty };
                delete dnfp.enabled;
                const newExtras = { ...next.extras, dnfPenalty: dnfp };
                // drop `extras` altogether if empty
                if (
                  Object.keys(dnfp).length === 0 &&
                  !newExtras.formatWeights &&
                  !newExtras.roundTypeFilter
                ) {
                  delete (next as EventOverride).extras;
                } else {
                  (next as EventOverride).extras = newExtras;
                }
                return next;
              })
            }
            className="text-[11px] text-[var(--color-mute-2)] hover:text-[var(--color-accent)] transition-colors cursor-pointer mt-1"
          >
            inherit DNF penalty state from global
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Row with an "override this field?" toggle. When toggled off, the field
 * inherits from the global config; when toggled on, the user sees a slider
 * pre-populated with the global value and can nudge it. Uses NumberKnob
 * under the hood for consistent styling with the global form.
 */
function OverrideKnob({
  label,
  globalValue,
  overrideValue,
  min,
  max,
  step,
  precision,
  round,
  onChange,
}: {
  label: string;
  globalValue: number;
  overrideValue: number | undefined;
  min: number;
  max: number;
  step: number;
  precision?: number;
  round?: boolean;
  onChange: (next: number | undefined) => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effective = overrideValue ?? globalValue;

  return (
    <div className="py-2 border-t rule first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="text-[12px] font-body text-[var(--color-ink)] leading-tight">
          {label}
          {isOverridden && (
            <span
              aria-label="Overridden"
              className="ml-2 inline-block w-[6px] h-[6px] rounded-full bg-[var(--color-accent)] align-middle"
            />
          )}
        </label>
        <button
          type="button"
          onClick={() =>
            isOverridden ? onChange(undefined) : onChange(globalValue)
          }
          className="text-[11px] text-[var(--color-mute-2)] hover:text-[var(--color-accent)]
                     transition-colors cursor-pointer whitespace-nowrap"
        >
          {isOverridden ? 'inherit' : 'override'}
        </button>
      </div>
      {isOverridden && (
        <NumberKnob
          label=""
          min={min}
          max={max}
          step={step}
          value={effective}
          defaultValue={globalValue}
          precision={precision}
          onChange={(v) => onChange(round ? Math.round(v) : v)}
        />
      )}
    </div>
  );
}
