import type { RatingConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';

/**
 * Shallow summary of which top-level config sections have been modified.
 * Used by the status bar on the calibration page to show "X/Y sections
 * touched · Z per-event overrides" without dumping the full JSON.
 */
export function summariseConfigDiff(config: RatingConfig): {
  touchedSections: string[];
  perEventOverrides: number;
  extrasEnabled: string[];
} {
  const touched: string[] = [];
  for (const key of [
    'windowYears',
    'minResults',
    'weightBase',
    'inactivityBase',
    'defaultGraceDays',
    'bonusModifier',
    'kinchScale',
  ] as const) {
    if (config[key] !== DEFAULT_CONFIG[key]) touched.push(key);
  }
  if (!shallowEqual(config.graceDaysByEvent, DEFAULT_CONFIG.graceDaysByEvent)) {
    touched.push('graceDaysByEvent');
  }
  if (!deepEqual(config.placement, DEFAULT_CONFIG.placement)) touched.push('placement');
  if (!deepEqual(config.record, DEFAULT_CONFIG.record)) touched.push('record');

  const extrasEnabled: string[] = [];
  if (config.extras.dnfPenalty.enabled) extrasEnabled.push('dnfPenalty');
  if (config.extras.formatWeights.enabled) extrasEnabled.push('formatWeights');
  if (config.extras.roundTypeFilter.enabled) extrasEnabled.push('roundTypeFilter');

  return {
    touchedSections: touched,
    perEventOverrides: Object.keys(config.eventOverrides).length,
    extrasEnabled,
  };
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a ?? {});
  const bk = Object.keys(b ?? {});
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
