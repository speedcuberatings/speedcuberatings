import Link from 'next/link';
import { Flag } from './Flag';
import { DeltaBadge } from './DeltaBadge';
import type { LeaderboardRow } from '@/lib/queries';
import { formatRating } from '@/lib/format';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The centerpiece. A typeset leaderboard, not a dashboard table.
 *
 * Design:
 *  - Rank rendered in display (Fraunces), oversized, italic + accent for top 3.
 *  - Name in display weight-500; flag as tiny colophon; country name
 *    de-emphasised in small caps.
 *  - Rating in tabular mono, right-aligned, large.
 *  - Delta tucked under rating.
 *  - Thin editorial rule between rows.
 */
export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="eyebrow py-16 text-center">no results yet</p>
    );
  }

  return (
    <ol className="mt-2">
      {rows.map((r, idx) => {
        const top = r.rank <= 3;
        return (
          <li
            key={r.wca_id}
            className="group reveal border-b rule"
            style={{ '--i': idx } as React.CSSProperties}
          >
            <Link
              href={`/competitors/${r.wca_id}`}
              className="grid items-center gap-x-3 md:gap-x-8 px-4 sm:px-8 py-5 md:py-6
                         grid-cols-[2.5rem_1fr_5rem] md:grid-cols-[4.5rem_1fr_7.5rem]
                         transition-colors duration-200 hover:bg-[var(--color-paper-2)]"
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
                  fontSize: top ? 'clamp(2.5rem, 5vw, 3.25rem)' : 'clamp(1.9rem, 3.6vw, 2.5rem)',
                  fontVariationSettings: top
                    ? '"opsz" 144, "SOFT" 30, "wght" 500'
                    : '"opsz" 120, "SOFT" 10, "wght" 420',
                  letterSpacing: '-0.03em',
                }}
              >
                {r.rank}
              </span>

              {/* Name + country */}
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span
                    className="font-display text-[1.25rem] md:text-[1.5rem] leading-tight
                               truncate text-[var(--color-ink)]"
                    style={{
                      fontVariationSettings: '"opsz" 48, "SOFT" 30, "wght" 520',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {r.name}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-2">
                    <Flag iso2={r.country_iso2} name={r.country_id} size={14} />
                    <span className="eyebrow !tracking-[0.14em]">{r.country_id}</span>
                  </span>
                  <span aria-hidden="true" className="text-[10px] text-[var(--color-rule-strong)]">·</span>
                  <span className="font-mono tnum text-[11px] text-[var(--color-mute-2)]">
                    {r.result_count} results
                  </span>
                </div>
                {r.last_competition_name && (
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--color-mute-2)] truncate">
                    last at{' '}
                    <span className="text-[var(--color-muted)]">
                      {r.last_competition_name}
                    </span>
                    {r.last_competition_city ? `, ${r.last_competition_city}` : ''}
                    {' · '}
                    {shortDate(r.last_competed_at)}
                  </div>
                )}
              </div>

              {/* Rating + delta */}
              <div className="text-right">
                <div
                  className="font-mono tnum tabular-nums text-[var(--color-ink)]
                             text-[1.45rem] md:text-[1.85rem] leading-none"
                >
                  {formatRating(r.rating)}
                </div>
                <div className="mt-2">
                  <DeltaBadge delta={r.delta} />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
