import type { RatingConfig } from './types';
import { DEFAULT_CONFIG, ENGINE_VERSION, freshDefault } from './defaults';

/**
 * Config ↔ URL / JSON codecs.
 *
 * URL format: a single `c` query param holding a base64url-encoded JSON
 * "diff" against the default. Diff-only so typical tweaked URLs stay
 * short (under ~1 KB in all realistic cases). Full JSON export/import
 * uses the canonical full config so it's self-describing when shared.
 */

/** Full config ↔ JSON. Validated and version-migrated on import. */
export function configToJson(config: RatingConfig): string {
  return JSON.stringify(config, null, 2);
}

export function configFromJson(raw: string): RatingConfig {
  const parsed = JSON.parse(raw) as unknown;
  return migrateAndMerge(parsed);
}

/** Full config ↔ diff against DEFAULT_CONFIG. */
export function diffAgainstDefault(config: RatingConfig): object {
  const diff = computeDiff(DEFAULT_CONFIG as unknown as Record<string, unknown>, config as unknown as Record<string, unknown>);
  return (diff ?? {}) as object;
}

/** Diff ↔ URL-safe base64 string. */
export function diffToUrlParam(diff: object): string {
  if (!diff || Object.keys(diff).length === 0) return '';
  const json = JSON.stringify(diff);
  // btoa can't handle > 8-bit chars; `name`s can have unicode so encode first.
  const b64 = btoa(encodeURIComponent(json));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function urlParamToDiff(param: string): object | null {
  if (!param) return null;
  try {
    const pad = '='.repeat((4 - (param.length % 4)) % 4);
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const json = decodeURIComponent(atob(b64));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed as object;
    return null;
  } catch {
    return null;
  }
}

/** Convenience: full URL round-trip. */
export function configToUrlParam(config: RatingConfig): string {
  return diffToUrlParam(diffAgainstDefault(config));
}
export function configFromUrlParam(param: string): RatingConfig {
  const diff = urlParamToDiff(param);
  if (!diff) return freshDefault();
  return migrateAndMerge(deepMerge(freshDefault() as unknown as Record<string, unknown>, diff as Record<string, unknown>));
}

/**
 * Compute a deep, minimal diff of `b` against `a`. Returns `undefined`
 * if they are structurally equal (so callers can omit the field from the
 * parent diff). Uses "replace whole subtree" semantics for arrays since
 * most arrays here (e.g. `roundTypeFilter.include`) are order-sensitive
 * include lists.
 */
function computeDiff(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const av = a?.[k];
    const bv = b?.[k];
    if (isPlainObject(av) && isPlainObject(bv)) {
      const sub = computeDiff(av, bv);
      if (sub !== undefined) out[k] = sub;
    } else if (Array.isArray(av) && Array.isArray(bv)) {
      if (!arraysEqual(av, bv)) out[k] = bv;
    } else if (av !== bv) {
      out[k] = bv;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(override)) {
    const bv = override[k];
    const av = out[k];
    if (isPlainObject(av) && isPlainObject(bv)) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Merge an unknown parsed value with the default config. Tolerant of
 * missing fields; strict on the version number (bumped when the schema
 * changes so we can migrate if needed).
 */
export function migrateAndMerge(raw: unknown): RatingConfig {
  if (!isPlainObject(raw)) return freshDefault();

  // Future migrations land here. Today we only have ENGINE_VERSION=1.
  if (typeof raw.version === 'number' && raw.version !== ENGINE_VERSION) {
    // eslint-disable-next-line no-console
    console.warn(
      `[rating-engine] config version ${raw.version} differs from engine ${ENGINE_VERSION}; merging anyway`,
    );
  }

  const merged = deepMerge(freshDefault() as unknown as Record<string, unknown>, raw);
  (merged as Record<string, unknown>).version = ENGINE_VERSION;
  return merged as unknown as RatingConfig;
}

/**
 * True if `config` is structurally identical to the default (= would
 * produce the production leaderboard). Used by the "Matches production"
 * pill on the UI.
 */
export function isDefaultConfig(config: RatingConfig): boolean {
  const diff = computeDiff(DEFAULT_CONFIG as unknown as Record<string, unknown>, config as unknown as Record<string, unknown>);
  return diff === undefined;
}
