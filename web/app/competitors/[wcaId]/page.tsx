import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Flag } from '@/components/Flag';
import { RatingHistoryChart } from '@/components/RatingHistoryChart';
import {
  getCompetitor,
  getCompetitorRatings,
  getCompetitorRecentResults,
  getRatingHistory,
  getEvents,
} from '@/lib/queries';
import {
  eventLabel,
  formatResult,
  formatRating,
  formatDate,
  roundLabel,
} from '@/lib/format';

export const revalidate = 600; // 10 minutes

interface PageProps {
  params: Promise<{ wcaId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { wcaId } = await params;
  const c = await getCompetitor(wcaId);
  if (!c) return {};
  return {
    title: c.name,
    description: `Performance ratings for ${c.name} (${c.country_id}) across WCA events.`,
  };
}

export default async function CompetitorPage({ params }: PageProps) {
  const { wcaId } = await params;

  const [competitor, ratings, recent, events] = await Promise.all([
    getCompetitor(wcaId),
    getCompetitorRatings(wcaId),
    getCompetitorRecentResults(wcaId, 24),
    getEvents(),
  ]);
  if (!competitor) notFound();

  // Fetch histories for each rated event in parallel.
  const histories = await Promise.all(
    ratings.map(async (r) => ({
      eventId: r.event_id,
      history: await getRatingHistory(wcaId, r.event_id),
    })),
  );
  const historyByEvent = new Map(histories.map((h) => [h.eventId, h.history]));

  const eventNameById = new Map(events.map((e) => [e.id, e.name] as const));
  const eventFormatById = new Map(events.map((e) => [e.id, e.format] as const));

  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
      {/* Hero */}
      <header className="pt-12 pb-10 border-b rule">
        <p className="eyebrow mb-3">
          Competitor ·{' '}
          <span className="font-mono normal-case tracking-normal text-[11px]">
            {competitor.wca_id}
          </span>
        </p>
        <h1
          className="font-display leading-[0.95] text-[var(--color-ink)]
                     text-[clamp(3rem,9vw,6.75rem)]"
          style={{
            fontVariationSettings: '"opsz" 144, "SOFT" 60, "wght" 400',
            letterSpacing: '-0.035em',
          }}
        >
          {competitor.name}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-[var(--color-muted)]">
          <Flag iso2={competitor.country_iso2} name={competitor.country_id} size={20} />
          <span>{competitor.country_id}</span>
          {ratings.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Rated in{' '}
                <span className="text-[var(--color-ink)] font-medium">
                  {ratings.length}
                </span>{' '}
                {ratings.length === 1 ? 'event' : 'events'}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <a
            href={`https://worldcubeassociation.org/persons/${competitor.wca_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link"
          >
            WCA profile ↗
          </a>
        </div>
      </header>

      {/* Ratings grid */}
      {ratings.length === 0 ? (
        <p className="py-24 text-center eyebrow">
          no ratings — not enough recent competition data
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 py-12">
          {ratings.map((r, idx) => {
            const history = historyByEvent.get(r.event_id) ?? [];
            const decayed = r.rating < r.raw_rating - 0.5;
            return (
              <article
                key={r.event_id}
                className="reveal border-t rule pt-6"
                style={{ '--i': idx } as React.CSSProperties}
              >
                <div className="flex items-baseline justify-between gap-6">
                  <div>
                    <p className="eyebrow mb-1">{eventLabel(r.event_id, r.event_name)}</p>
                    <p
                      className="font-display text-[2.25rem] leading-none text-[var(--color-ink)]"
                      style={{
                        fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 420',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      #{r.rank.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className="font-mono tnum text-[2.25rem] leading-none text-[var(--color-ink)]"
                    >
                      {formatRating(r.rating)}
                    </p>
                    {decayed && (
                      <p
                        className="mt-1 font-mono tnum text-[11px] text-[var(--color-mute-2)]"
                        title="Raw rating before inactivity decay"
                      >
                        raw {formatRating(r.raw_rating)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <p className="font-mono tnum text-[11px] text-[var(--color-muted)]">
                    {r.result_count} results · last {formatDate(r.last_competed_at)}
                  </p>
                  <RatingHistoryChart data={history} width={180} height={44} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Recent results */}
      {recent.length > 0 && (
        <section className="pt-12 pb-16 border-t rule">
          <h2
            className="font-display text-[2rem] text-[var(--color-ink)] leading-none"
            style={{
              fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 450',
              letterSpacing: '-0.02em',
            }}
          >
            Recent results
          </h2>
          <ol className="mt-6">
            {recent.map((r, i) => {
              const fmt = (eventFormatById.get(r.event_id) ?? 'time') as
                | 'time'
                | 'number'
                | 'multi';
              const shown = formatResult(
                r.metric_value,
                fmt,
                r.average > 0 && r.average === r.metric_value,
              );
              return (
                <li
                  key={`${r.competition_id}-${r.event_id}-${r.round_type_id}-${i}`}
                  className="reveal grid items-baseline gap-x-6
                             grid-cols-[auto_1fr_auto] border-b rule py-4"
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className="font-mono tnum text-[12px] text-[var(--color-muted)] w-24">
                    {formatDate(r.competition_date)}
                  </span>
                  <span className="min-w-0">
                    <span className="font-body text-[15px] text-[var(--color-ink)] block truncate">
                      {eventNameById.get(r.event_id) ?? r.event_id}{' '}
                      <span className="text-[var(--color-muted)]">
                        · {roundLabel(r.round_type_id)}
                      </span>
                    </span>
                    <span className="eyebrow !tracking-[0.12em] mt-0.5 block text-[var(--color-mute-2)]">
                      {r.competition_id}
                      {r.championship_scope ? ` · ${r.championship_scope}` : ''}
                      {r.position > 0 ? ` · ${ordinal(r.position)}` : ''}
                    </span>
                  </span>
                  <span className="font-mono tnum text-[15px] text-[var(--color-ink)] text-right">
                    {shown}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="py-12">
        <Link href="/rankings/333" className="ink-link eyebrow !tracking-[0.18em]">
          ← back to rankings
        </Link>
      </div>
    </section>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
