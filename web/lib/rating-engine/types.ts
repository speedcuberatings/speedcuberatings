/**
 * Shared types for the calibration-sandbox rating engine.
 *
 * These are the shapes the `/calibrate` page + its API route exchange.
 * The engine itself (compute.ts) is a pure function of a `CandidatePool`
 * and a `RatingConfig`; there is no I/O inside it.
 *
 * The config is mirrored as exactly as possible from the constants in
 * `ingest/src/derive/ratings.ts`. When defaults match production,
 * `computeLeaderboard(pool, DEFAULT_CONFIG)` reproduces the rows in
 * `app.current_ratings` to within rounding. Keep these two files in sync.
 */
export type Metric = 'single' | 'average';

/** WCA `formats.id` values we care about today. */
export type FormatId = 'a' | 'm' | '3' | '5' | '2' | '1';

/** Championship tiers. Non-championships use the special `'none'` slot. */
export type ChampionshipScope = 'world' | 'continental' | 'national' | 'none';

/** Placement weights for the (R + S + T + U + 0.5) · 0.3 · champ_mult − 0.075 expression. */
export interface PlacementConfig {
  baseOffset: number;      // 0.5    — base term, present for every round
  scale: number;           // 0.3    — outer scaling
  cleanupOffset: number;   // -0.075 — subtracted after scaling
  finalWeight: number;     // 1      — weight for `is_final` bit (R)
  bronzePlusWeight: number;// 1      — weight added when pos <= 3 in final (S)
  silverPlusWeight: number;// 1      — weight added when pos <= 2 in final (T)
  goldWeight: number;      // 2      — weight added when pos == 1 in final (U)
  champMult: Record<ChampionshipScope, number>; // worlds 5.5, cont 3, natl 1, none 0.5
}

/** Record-bonus tiers, de-duped across (regional_single_record, regional_average_record). */
export interface RecordConfig {
  anyRecord: number;        // 2 — NR (or higher) contribution
  continentalOrHigher: number; // 2 — continental (or higher) additive contribution
  worldRecord: number;      // 4 — WR additive contribution on top of the two above
}

/**
 * Optional experimental extensions. Off by default so the default config
 * still reproduces production ratings exactly. Each is a config-driven
 * extra — UI toggles them on and tunes their parameters.
 */
export interface ExtrasConfig {
  /**
   * DNF-rate adjustment. Multiply the raw rating by a piecewise factor:
   *
   *   deficit = dnfRate − baselineRate
   *   if deficit ≥ 0: mult = max(floor, 1 − alpha · deficit)       (penalty)
   *   if deficit <  0: mult = min(ceil,  1 − bonusAlpha · deficit) (reward)
   *
   * The penalty side matches the approach James Macdiarmid suggested
   * for BLD / FMC / multi where DNF rate is meaningful. The reward side
   * (defaults to `bonusAlpha = alpha`, so enabling the extra gives a
   * symmetric two-sided adjustment out of the box) lets calibrators
   * boost competitors whose reliability is better than the baseline.
   * Set `bonusAlpha = 0` for the original penalty-only behaviour.
   */
  dnfPenalty: {
    enabled: boolean;
    alpha: number;           // 1.0 — penalty slope when above baseline
    bonusAlpha: number;      // 1.0 — reward slope when below baseline (set to 0 for penalty-only)
    baselineRate: number;    // 0.1 — expected background rate; adjustment pivots here
    floor: number;           // 0.5 — never cut rating by more than half
    ceil: number;            // 1.5 — never boost rating by more than 50%
  };
  /**
   * Per-format weight. Multiplies each round's Kinch-post-bonus score by
   * the format's weight. Default 1 for every known format so the default
   * config is a no-op. An `unknown` slot covers formats we don't enumerate.
   */
  formatWeights: {
    enabled: boolean;
    weights: Record<FormatId | 'unknown', number>;
  };
  /**
   * Round-type include filter. When enabled, only round_type_ids whose
   * trimmed name matches `include` contribute. Empty `include` means
   * "exclude everything"; UI guards against that.
   */
  roundTypeFilter: {
    enabled: boolean;
    include: string[]; // e.g. ['f', '3', '2', '1', '0', 'c', 'd', 'e', 'g', 'h', 'b']
  };
}

/**
 * Event-specific overrides. Any subset of the full config can be
 * overridden for a single event; everything not present inherits from
 * the global config. The UI's "inherit" toggle controls membership in
 * this object at field granularity.
 */
export type EventOverride = {
  graceDays?: number;
  windowYears?: number;
  minResults?: number;
  weightBase?: number;
  inactivityBase?: number;
  bonusModifier?: number;
  kinchScale?: number;
  placement?: Partial<PlacementConfig> & {
    champMult?: Partial<Record<ChampionshipScope, number>>;
  };
  record?: Partial<RecordConfig>;
  extras?: {
    dnfPenalty?: Partial<ExtrasConfig['dnfPenalty']>;
    formatWeights?: {
      enabled?: boolean;
      weights?: Partial<Record<FormatId | 'unknown', number>>;
    };
    roundTypeFilter?: Partial<ExtrasConfig['roundTypeFilter']>;
  };
};

/**
 * The full rating configuration. Round-trippable to JSON and to a
 * query-string diff (codec.ts). When all fields equal `DEFAULT_CONFIG`,
 * engine output matches production.
 */
export interface RatingConfig {
  /** Bump when the config schema changes; codec.ts uses it for migrations. */
  version: number;

  /** Competitor window */
  windowYears: number;     // 2
  minResults: number;      // 3

  /** Recency weighting */
  weightBase: number;      // 0.99

  /** Inactivity decay */
  inactivityBase: number;  // 0.9995
  /** Per-event inactivity grace days. Keys not present use `defaultGraceDays`. */
  defaultGraceDays: number; // 90
  graceDaysByEvent: Record<string, number>; // { '333': 90, '444': 180, ... }

  /** Bonus outer scale — `1 + bonusModifier * (placement + record)` */
  bonusModifier: number;   // 0.01

  /** Kinch score — `kinchScale * (WR / value)` */
  kinchScale: number;      // 100

  placement: PlacementConfig;
  record: RecordConfig;
  extras: ExtrasConfig;

  /** Field-level overrides per event. */
  eventOverrides: Record<string, EventOverride>;
}

/** The shape returned by `/api/calibrate/pool`. */
export interface CandidatePool {
  event: { id: string; name: string; format: 'time' | 'number' | 'multi' };
  metric: Metric;
  /** All-time minimum of `metric_value` for the event (our Kinch denominator). */
  wr: number;
  /** ISO date used as "today" for days-old calculations (UTC midnight). */
  today: string;
  /** Today's production leaderboard (top-N by `app.current_ratings`). */
  production: Array<{
    wcaId: string;
    name: string;
    countryId: string;
    countryIso2: string | null;
    rating: number;
    rank: number;
    resultCount: number;
    lastCompetedAt: string;
  }>;
  /** One entry per candidate competitor, with their in-window results. */
  candidates: Array<{
    wcaId: string;
    name: string;
    countryId: string;
    countryIso2: string | null;
    results: PoolResult[];
  }>;
}

export interface PoolResult {
  /** ISO date string (UTC). */
  competitionDate: string;
  competitionId: string;
  roundTypeId: string;
  formatId: FormatId | 'unknown';
  isFinal: boolean;
  position: number;
  /** The metric's numeric value (centiseconds for timed events, moves for FMC, encoded for multi). */
  value: number;
  regionalSingleRecord: string | null;
  regionalAverageRecord: string | null;
  dnfCount: number;
  isChampionship: boolean;
  championshipScope: ChampionshipScope;
}

/** Result of running the client-side engine. */
export interface CustomLeaderboardRow {
  wcaId: string;
  name: string;
  countryId: string;
  countryIso2: string | null;
  /** Final rating after inactivity decay and extras. `null` if filtered out. */
  rating: number | null;
  rawRating: number | null;
  rank: number | null;
  resultCount: number;
  /** ISO date of most recent in-window result considered. */
  lastCompetedAt: string | null;
  /** Production rating/rank for this competitor (for diff display). */
  productionRating: number | null;
  productionRank: number | null;
}
