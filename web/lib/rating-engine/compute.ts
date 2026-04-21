import type {
  CandidatePool,
  CustomLeaderboardRow,
  EventOverride,
  ExtrasConfig,
  FormatId,
  PlacementConfig,
  PoolResult,
  RatingConfig,
  RecordConfig,
} from './types';

/**
 * Client-side port of `ingest/src/derive/ratings.ts`. Pure, no I/O. Given
 * a pool of candidates (with all their in-window results) and a rating
 * config, returns a ranked leaderboard.
 *
 * The default config (see defaults.ts) reproduces the server-side output
 * to within rounding. Diverges only when the user tweaks knobs or enables
 * `extras.*`.
 *
 * ~15 μs per competitor on a reasonable laptop (tight per-row math +
 * single Math.pow per weighting), which means recomputing the ~50 pool
 * candidates is essentially free on every slider move — no useMemo
 * thrashing required.
 */
export function computeLeaderboard(
  pool: CandidatePool,
  globalConfig: RatingConfig,
): CustomLeaderboardRow[] {
  // `metric` is carried on the pool for the API/UI; the engine itself is
  // metric-agnostic because the pool has already picked single vs average
  // values into `value`. No branching needed here.
  const { event, wr, today, candidates, production } = pool;
  const today_ms = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );

  // Resolve an effective config for this specific (event, metric) pass.
  const cfg = resolveEventConfig(globalConfig, event.id);

  // Map from wcaId → production rating / rank, for later decoration.
  const productionByWcaId = new Map(production.map((p) => [p.wcaId, p]));

  const rows: CustomLeaderboardRow[] = [];
  for (const candidate of candidates) {
    const row = computeOneCandidate(
      candidate.wcaId,
      candidate.name,
      candidate.countryId,
      candidate.countryIso2,
      candidate.results,
      wr,
      cfg,
      today_ms,
    );
    const prod = productionByWcaId.get(candidate.wcaId);
    row.productionRating = prod ? prod.rating : null;
    row.productionRank = prod ? prod.rank : null;
    rows.push(row);
  }

  // Rank by rating desc (nulls last). Standard RANK() semantics — ties share
  // a rank and next slot skips (5, 5, 7), matching production.
  const ranked = rows
    .filter((r) => r.rating != null)
    .sort((a, b) => (b.rating! - a.rating!) || a.name.localeCompare(b.name));
  let prevRating: number | null = null;
  let prevRank = 0;
  ranked.forEach((r, idx) => {
    const oneBased = idx + 1;
    if (prevRating != null && r.rating === prevRating) {
      r.rank = prevRank;
    } else {
      r.rank = oneBased;
      prevRank = oneBased;
      prevRating = r.rating;
    }
  });
  // unrated rows keep rank = null (already initialised).
  rows.sort((a, b) => {
    // nulls last, then by (rank asc, name asc).
    if (a.rank == null && b.rank == null) return a.name.localeCompare(b.name);
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank || a.name.localeCompare(b.name);
  });
  return rows;
}

interface ResolvedConfig {
  windowYears: number;
  minResults: number;
  weightBase: number;
  inactivityBase: number;
  graceDays: number;
  bonusModifier: number;
  kinchScale: number;
  placement: PlacementConfig;
  record: RecordConfig;
  extras: ExtrasConfig;
}

/**
 * Merge global config + any event-specific overrides into a flat struct
 * we can use hot-path without repeated lookups.
 */
export function resolveEventConfig(
  config: RatingConfig,
  eventId: string,
): ResolvedConfig {
  const ov: EventOverride = config.eventOverrides[eventId] ?? {};

  const placement: PlacementConfig = {
    ...config.placement,
    ...ov.placement,
    champMult: {
      ...config.placement.champMult,
      ...(ov.placement?.champMult ?? {}),
    },
  };

  const record: RecordConfig = {
    ...config.record,
    ...ov.record,
  };

  // Merge extras — each sub-section can have its own partial override.
  const extras: ExtrasConfig = {
    dnfPenalty: {
      ...config.extras.dnfPenalty,
      ...(ov.extras?.dnfPenalty ?? {}),
    },
    formatWeights: {
      enabled:
        ov.extras?.formatWeights?.enabled ??
        config.extras.formatWeights.enabled,
      weights: {
        ...config.extras.formatWeights.weights,
        ...(ov.extras?.formatWeights?.weights ?? {}),
      },
    },
    roundTypeFilter: {
      enabled:
        ov.extras?.roundTypeFilter?.enabled ??
        config.extras.roundTypeFilter.enabled,
      include:
        ov.extras?.roundTypeFilter?.include ??
        config.extras.roundTypeFilter.include,
    },
  };

  const graceDays =
    ov.graceDays ??
    config.graceDaysByEvent[eventId] ??
    config.defaultGraceDays;

  return {
    windowYears: ov.windowYears ?? config.windowYears,
    minResults: ov.minResults ?? config.minResults,
    weightBase: ov.weightBase ?? config.weightBase,
    inactivityBase: ov.inactivityBase ?? config.inactivityBase,
    bonusModifier: ov.bonusModifier ?? config.bonusModifier,
    kinchScale: ov.kinchScale ?? config.kinchScale,
    graceDays,
    placement,
    record,
    extras,
  };
}

function computeOneCandidate(
  wcaId: string,
  name: string,
  countryId: string,
  countryIso2: string | null,
  allResults: PoolResult[],
  wr: number,
  cfg: ResolvedConfig,
  today_ms: number,
): CustomLeaderboardRow {
  const { minResults, windowYears, weightBase, inactivityBase, graceDays, bonusModifier, kinchScale, placement, record, extras } = cfg;

  // 1. Filter by optional round-type filter + optional format filter.
  //    The round-type filter acts as an include list; unlisted ids drop.
  const rtAllowed = extras.roundTypeFilter.enabled
    ? new Set(extras.roundTypeFilter.include)
    : null;
  const prefiltered = rtAllowed
    ? allResults.filter((r) => rtAllowed.has(r.roundTypeId))
    : allResults;

  if (prefiltered.length === 0) {
    return emptyRow(wcaId, name, countryId, countryIso2);
  }

  // 2. Determine anchor date (competitor's most recent result in-pool)
  //    and keep only results within `windowYears` of it. Production
  //    does this anchoring too (see transform.ts's `last_competed_per_event`).
  let anchorMs = -Infinity;
  for (const r of prefiltered) {
    const t = dateStrToMs(r.competitionDate);
    if (t > anchorMs) anchorMs = t;
  }
  if (anchorMs === -Infinity) return emptyRow(wcaId, name, countryId, countryIso2);

  const windowStartMs =
    anchorMs - Math.round(windowYears * 365.25 * 86_400_000);
  const windowResults = prefiltered.filter((r) => {
    const t = dateStrToMs(r.competitionDate);
    return t >= windowStartMs && r.value > 0;
  });

  if (windowResults.length < minResults) {
    return emptyRow(wcaId, name, countryId, countryIso2);
  }

  // 3. For each result: kinch × bonus × format-weight × weight(days).
  let weightedScoreSum = 0;
  let weightSum = 0;
  let dnfCountTotal = 0;
  let attemptCountTotal = 0;
  let lastDateMs = -Infinity;
  let lastCompetedAt: string | null = null;

  for (const r of windowResults) {
    const kinch = kinchScale * (wr / r.value);
    const bonus = bonusMultiplier(r, placement, record, bonusModifier);
    const fw = extras.formatWeights.enabled
      ? (extras.formatWeights.weights[r.formatId] ??
         extras.formatWeights.weights.unknown ??
         1)
      : 1;

    // Day delta: days between the competition and anchor. The server uses
    // `current_date − competition_date`, but anchoring on the in-pool
    // most-recent date is equivalent when the pool covers the same
    // window, because the per-row weight factor is a common ratio across
    // candidates that cancels out in ranking. We use today so absolute
    // values match production.
    const daysOld = Math.max(
      0,
      Math.floor((today_ms - dateStrToMs(r.competitionDate)) / 86_400_000),
    );
    const w = Math.pow(weightBase, daysOld);
    const contrib = kinch * bonus * fw * w;

    weightedScoreSum += contrib;
    weightSum += w;

    // Accumulate DNF stats for optional penalty.
    dnfCountTotal += r.dnfCount;
    attemptCountTotal += expectedAttempts(r.formatId);

    const t = dateStrToMs(r.competitionDate);
    if (t > lastDateMs) {
      lastDateMs = t;
      lastCompetedAt = r.competitionDate;
    }
  }

  if (weightSum === 0) {
    return emptyRow(wcaId, name, countryId, countryIso2);
  }
  let raw = weightedScoreSum / weightSum;

  // 4. Optional DNF-rate adjustment applied to the raw rating, before
  //    inactivity decay. Two-sided: a penalty when DNF rate exceeds the
  //    baseline and (optionally, when `bonusAlpha > 0`) a reward when
  //    the rate is below it. `bonusAlpha` defaults to 0 so enabling the
  //    extra with defaults preserves the original one-sided behaviour.
  if (extras.dnfPenalty.enabled && attemptCountTotal > 0) {
    const rate = dnfCountTotal / attemptCountTotal;
    const deficit = rate - extras.dnfPenalty.baselineRate;
    let mult: number;
    if (deficit >= 0) {
      mult = Math.max(
        extras.dnfPenalty.floor,
        1 - extras.dnfPenalty.alpha * deficit,
      );
    } else {
      // deficit < 0 → (1 - bonusAlpha * deficit) > 1; clamp to `ceil`.
      mult = Math.min(
        extras.dnfPenalty.ceil,
        1 - extras.dnfPenalty.bonusAlpha * deficit,
      );
    }
    raw *= mult;
  }

  // 5. Inactivity decay anchored on today (matches production).
  const daysSince = Math.max(
    0,
    Math.floor((today_ms - lastDateMs) / 86_400_000),
  );
  const decay =
    daysSince > graceDays
      ? Math.pow(inactivityBase, daysSince - graceDays)
      : 1;
  const rating = raw * decay;

  return {
    wcaId,
    name,
    countryId,
    countryIso2,
    rating,
    rawRating: raw,
    rank: null, // filled later
    resultCount: windowResults.length,
    lastCompetedAt,
    productionRating: null,
    productionRank: null,
  };
}

function bonusMultiplier(
  r: PoolResult,
  placement: PlacementConfig,
  record: RecordConfig,
  bonusModifier: number,
): number {
  // Placement score — final + medal + championship (reverse-engineered
  // from James's spreadsheet; see ratings.ts).
  const R = r.isFinal ? placement.finalWeight : 0;
  const S = r.isFinal && r.position <= 3 ? placement.bronzePlusWeight : 0;
  const T = r.isFinal && r.position <= 2 ? placement.silverPlusWeight : 0;
  const U = r.isFinal && r.position === 1 ? placement.goldWeight : 0;
  const mult =
    placement.champMult[r.championshipScope] ?? placement.champMult.none;
  const placementScore =
    (R + S + T + U + placement.baseOffset) * placement.scale * mult +
    placement.cleanupOffset;

  // Record score — de-dupe across (single, average) so hitting WR in
  // both doesn't double-count. Matches ratings.ts exactly.
  let anyRecord = false;
  let anyContinental = false;
  let anyWR = false;
  for (const code of [r.regionalSingleRecord, r.regionalAverageRecord]) {
    if (!code) continue;
    anyRecord = true;
    if (code === 'WR') {
      anyContinental = true;
      anyWR = true;
    } else if (isContinentalCode(code)) {
      anyContinental = true;
    }
  }
  const recordScore =
    (anyRecord ? record.anyRecord : 0) +
    (anyContinental ? record.continentalOrHigher : 0) +
    (anyWR ? record.worldRecord : 0);

  return 1 + bonusModifier * (placementScore + recordScore);
}

const CONTINENTAL_RECORD_CODES = new Set([
  'AfR',
  'AsR',
  'ER',
  'NAR',
  'OcR',
  'SAR',
]);
function isContinentalCode(code: string): boolean {
  return CONTINENTAL_RECORD_CODES.has(code);
}

function expectedAttempts(formatId: FormatId | 'unknown'): number {
  switch (formatId) {
    case 'a':
      return 5;
    case 'm':
    case '3':
      return 3;
    case '5':
      return 5;
    case '2':
      return 2;
    case '1':
      return 1;
    default:
      return 1;
  }
}

function dateStrToMs(d: string): number {
  // Strict ISO date (YYYY-MM-DD) — parse as UTC midnight to avoid TZ jitter.
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10)),
  );
}

function emptyRow(
  wcaId: string,
  name: string,
  countryId: string,
  countryIso2: string | null,
): CustomLeaderboardRow {
  return {
    wcaId,
    name,
    countryId,
    countryIso2,
    rating: null,
    rawRating: null,
    rank: null,
    resultCount: 0,
    lastCompetedAt: null,
    productionRating: null,
    productionRank: null,
  };
}

/**
 * Small helper for the status pill: compare engine output at default
 * config against `production.rating` and report MAE + worst diff.
 */
export function engineParity(rows: CustomLeaderboardRow[]): {
  matched: number;
  worstDelta: number;
  mae: number;
} {
  let matched = 0;
  let worst = 0;
  let sumAbs = 0;
  let n = 0;
  for (const r of rows) {
    if (r.rating == null || r.productionRating == null) continue;
    const d = r.rating - r.productionRating;
    const ad = Math.abs(d);
    if (ad <= 0.005) matched += 1;
    if (ad > Math.abs(worst)) worst = d;
    sumAbs += ad;
    n += 1;
  }
  return {
    matched,
    worstDelta: worst,
    mae: n > 0 ? sumAbs / n : 0,
  };
}
