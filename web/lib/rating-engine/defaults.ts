import type { RatingConfig } from './types';

/**
 * Default calibration config — an exact mirror of the constants in
 * `ingest/src/derive/ratings.ts` and `transform.ts`. Running the engine
 * with this config over the candidate pool should reproduce
 * `app.current_ratings` to within rounding.
 *
 * When this file drifts from the server-side implementation, the
 * "engine parity" status pill on the calibration page lights up red.
 * Keep them in sync. The shared `ENGINE_VERSION` constant below is the
 * hard contract — bump it whenever the shape or semantics of the config
 * changes.
 */
export const ENGINE_VERSION = 1;

/**
 * Default per-event inactivity grace days, copied from
 * `INACTIVITY_GRACE_DAYS` in `ingest/src/derive/ratings.ts`.
 */
export const DEFAULT_GRACE_DAYS_BY_EVENT: Record<string, number> = {
  // Standard short-cycle events — default 90 days.
  '333': 90,
  '222': 90,
  '333oh': 90,
  pyram: 90,
  skewb: 90,
  sq1: 90,
  // Bigger cubes, clock, megaminx, 3bld — still popular, but rarely held at the
  // smallest comps. A longer grace avoids penalising competitors in regions
  // with fewer full-event competitions.
  '444': 180,
  '555': 180,
  '666': 180,
  '777': 180,
  clock: 180,
  minx: 180,
  '333bf': 180,
  // Rare events — only scheduled at larger competitions. Allow a full year.
  '444bf': 365,
  '555bf': 365,
  '333fm': 365,
  '333mbf': 365,
};

export const DEFAULT_CONFIG: RatingConfig = {
  version: ENGINE_VERSION,

  windowYears: 2,
  minResults: 3,

  weightBase: 0.99,

  inactivityBase: 0.9995,
  defaultGraceDays: 90,
  graceDaysByEvent: { ...DEFAULT_GRACE_DAYS_BY_EVENT },

  bonusModifier: 0.01,
  kinchScale: 100,

  placement: {
    baseOffset: 0.5,
    scale: 0.3,
    cleanupOffset: -0.075,
    finalWeight: 1,
    bronzePlusWeight: 1,
    silverPlusWeight: 1,
    goldWeight: 2,
    champMult: {
      world: 5.5,
      continental: 3.0,
      national: 1.0,
      none: 0.5,
    },
  },

  record: {
    anyRecord: 2,
    continentalOrHigher: 2,
    worldRecord: 4,
  },

  extras: {
    dnfPenalty: {
      enabled: false,
      alpha: 1.0,
      bonusAlpha: 0,
      baselineRate: 0.1,
      floor: 0.5,
      ceil: 1.5,
    },
    formatWeights: {
      enabled: false,
      weights: {
        a: 1,
        m: 1,
        '5': 1,
        '3': 1,
        '2': 1,
        '1': 1,
        unknown: 1,
      },
    },
    roundTypeFilter: {
      enabled: false,
      include: ['f', 'c', '3', '2', '1', '0', 'g', 'e', 'd', 'h', 'b'],
    },
  },

  eventOverrides: {},
};

/**
 * Deep-clone `DEFAULT_CONFIG` so callers can safely mutate it.
 * `structuredClone` avoids accidental sharing of nested objects and is
 * well-supported in modern browsers + Node.
 */
export function freshDefault(): RatingConfig {
  return structuredClone(DEFAULT_CONFIG);
}
