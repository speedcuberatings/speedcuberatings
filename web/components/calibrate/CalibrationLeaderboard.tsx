'use client';

import Link from 'next/link';
import { Flag } from '@/components/Flag';
import type { CustomLeaderboardRow, Metric } from '@/lib/rating-engine/types';
import { formatRating } from '@/lib/format';

/**
 * Custom leaderboard rendering. Layout mirrors `LeaderboardTable` but
 * with an extra column of rank-delta vs production and a small production
 * rating shown underneath for reference.
 */
export function CalibrationLeaderboard({
  rows,
  allRows,
  metric,
  eventFormat,
}: {
  rows: CustomLeaderboardRow[];
  /** Full set, used to compute rank-change statistics below. */
  allRows: CustomLeaderboardRow[];
  metric: Metric;
  eventFormat: 'time' | 'number' | 'multi';
}) {
  if (rows.length === 0) {
    return (
      <p className="eyebrow py-16 text-center">
        no competitors rank under this config
      </p>
    );
  }

  const stats = rankStats(allRows);

  return (
    <>
      <ol>
        {rows.map((r, idx) => {
          const top = (r.rank ?? 0) <= 3;
          const deltaRank =
            r.productionRank != null && r.rank != null
              ? r.productionRank - r.rank // positive = moved up
              : null;
          const deltaRating =
            r.productionRating != null && r.rating != null
              ? r.rating - r.productionRating
              : null;
          return (
            <li
              key={r.wcaId}
              className="group reveal border-b rule"
              style={{ '--i': idx } as React.CSSProperties}
            >
              <Link
                href={`/competitors/${r.wcaId}?metric=${metric}`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid items-center gap-x-3 md:gap-x-6 px-2 sm:px-4 py-4
                           grid-cols-[2.75rem_1fr_5.75rem_4.5rem]
                           transition-colors duration-200 hover:bg-[var(--color-paper-2)]"
                title="Open competitor profile in new tab"
              >
                {/* Rank */}
                <span
                  className={[
                    'font-display leading-none select-none',
                    top
                      ? 'text-[var(--color-accent)] italic'
                      : 'text-[var(--color-ink-soft)]',
                  ].join(' ')}
                  style={{
                    fontSize: top ? 'clamp(2rem, 4vw, 2.75rem)' : 'clamp(1.5rem, 3vw, 2rem)',
                    fontVariationSettings: top
                      ? '"opsz" 144, "SOFT" 30, "wght" 500'
                      : '"opsz" 120, "SOFT" 10, "wght" 420',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {r.rank}
                </span>

                {/* Name + country + production rank footnote */}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span
                      className="font-display text-[1.1rem] md:text-[1.25rem] leading-tight
                                 truncate text-[var(--color-ink)]"
                      style={{
                        fontVariationSettings: '"opsz" 48, "SOFT" 30, "wght" 520',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {r.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[var(--color-muted)]">
                    <span className="inline-flex items-center gap-2">
                      <Flag iso2={r.countryIso2} name={r.countryId} size={12} />
                      <span className="eyebrow !tracking-[0.12em] text-[10px]">
                        {r.countryId}
                      </span>
                    </span>
                    <span className="text-[10px] text-[var(--color-rule-strong)]">·</span>
                    <span className="font-mono tnum text-[10px] text-[var(--color-mute-2)]">
                      {r.resultCount} results
                    </span>
                    {r.productionRank != null && (
                      <>
                        <span className="text-[10px] text-[var(--color-rule-strong)]">·</span>
                        <span className="font-mono tnum text-[10px] text-[var(--color-mute-2)]">
                          prod #{r.productionRank}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Custom rating + production rating below */}
                <div className="text-right">
                  <div
                    className="font-mono tnum text-[var(--color-ink)]
                               text-[1.2rem] md:text-[1.45rem] leading-none"
                  >
                    {r.rating != null ? formatRating(r.rating) : '—'}
                  </div>
                  {r.productionRating != null && (
                    <div
                      className="font-mono tnum text-[10px] text-[var(--color-mute-2)] mt-1"
                      title="Production rating"
                    >
                      prod {formatRating(r.productionRating)}
                      {deltaRating != null && (
                        <span
                          className={[
                            'ml-1',
                            Math.abs(deltaRating) < 0.01
                              ? ''
                              : deltaRating > 0
                              ? 'text-[var(--color-up)]'
                              : 'text-[var(--color-down)]',
                          ].join(' ')}
                        >
                          {deltaRating > 0 ? '+' : ''}
                          {deltaRating.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Rank delta */}
                <div className="text-right">
                  <RankDelta delta={deltaRank} />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      {/* summary line */}
      <p className="mt-4 font-mono tnum text-[11px] text-[var(--color-mute-2)] text-right">
        {stats.movers} rankings changed
        {stats.worstShift !== 0 ? (
          <>
            {' '}· biggest shift{' '}
            <span className="text-[var(--color-ink-soft)]">
              {stats.worstShift > 0 ? '+' : ''}
              {stats.worstShift}
            </span>
            {' '}· MAE Δrating {stats.maeRating.toFixed(2)}
          </>
        ) : null}
        {eventFormat ? '' : null /* reserved for future format-sensitive notes */}
      </p>
    </>
  );
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span className="font-mono tnum text-[11px] text-[var(--color-mute-2)]">—</span>
    );
  }
  if (delta === 0) {
    return (
      <span className="font-mono tnum text-[11px] text-[var(--color-mute-2)]">•</span>
    );
  }
  const up = delta > 0;
  const abs = Math.abs(delta);
  return (
    <span
      className={[
        'font-mono tnum text-[12px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px]',
        up
          ? 'text-[var(--color-up)] bg-[color-mix(in_srgb,var(--color-up)_10%,transparent)]'
          : 'text-[var(--color-down)] bg-[color-mix(in_srgb,var(--color-down)_10%,transparent)]',
      ].join(' ')}
      title={up ? `Rose ${abs} places vs production` : `Fell ${abs} places vs production`}
    >
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      {abs}
    </span>
  );
}

function rankStats(rows: CustomLeaderboardRow[]): {
  movers: number;
  worstShift: number;
  maeRating: number;
} {
  let movers = 0;
  let worst = 0;
  let sumRatingAbs = 0;
  let n = 0;
  for (const r of rows) {
    if (r.rank == null || r.productionRank == null) continue;
    const d = r.productionRank - r.rank;
    if (d !== 0) movers += 1;
    if (Math.abs(d) > Math.abs(worst)) worst = d;
    if (r.rating != null && r.productionRating != null) {
      sumRatingAbs += Math.abs(r.rating - r.productionRating);
      n += 1;
    }
  }
  return {
    movers,
    worstShift: worst,
    maeRating: n > 0 ? sumRatingAbs / n : 0,
  };
}
