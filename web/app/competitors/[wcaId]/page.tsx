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
  type CompetitorEventRating,
  type Metric,
} from '@/lib/queries';
import {
  eventLabel,
  formatResult,
  formatRating,
  formatDate,
  roundLabel,
} from '@/lib/format';

export const revalidate = 600;

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

interface EventGroup {
  eventId: string;
  eventName: string;
  eventRank: number;
  primary: CompetitorEventRating;
  secondary: CompetitorEventRating | null;
}

export default async function CompetitorPage({ params }: PageProps) {
  const { wcaId } = await params;

  const [competitor, allRatings, recent, events] = await Promise.all([
    getCompetitor(wcaId),
    getCompetitorRatings(wcaId),
    getCompetitorRecentResults(wcaId, 24),
    getEvents(),
  ]);
  if (!competitor) notFound();

  const groups = groupRatingsByEvent(allRatings);

  // Fetch history for the primary metric of each event the competitor is rated in.
  const histories = await Promise.all(
    groups.map(async (g) => ({
      key: `${g.eventId}:${g.primary.metric}`,
      history: await getRatingHistory(wcaId, g.eventId, g.primary.metric),
    })),
  );
  const historyByKey = new Map(histories.map((h) => [h.key, h.history]));

  const eventNameById = new Map(events.map((e) => [e.id, e.name] as const));
  const eventFormatById = new Map(events.map((e) => [e.id, e.format] as const));

  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
      {/* Hero */}
      <header className="pt-12 pb-10 border-b rule">
        <p className="eyebrow mb-3">
          WCA ID ·{' '}
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
          {groups.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Rated in{' '}
                <span className="text-[var(--color-ink)] font-medium">
                  {groups.length}
                </span>{' '}
                {groups.length === 1 ? 'event' : 'events'}
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
      {groups.length === 0 ? (
        <p className="py-24 text-center eyebrow">
          no ratings — not enough recent competition data
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 py-12">
          {groups.map((g, idx) => {
            const history = historyByKey.get(`${g.eventId}:${g.primary.metric}`) ?? [];
            const primary = g.primary;
            const secondary = g.secondary;
            const primaryDecayed = primary.rating < primary.raw_rating - 0.5;

            return (
              <article
                key={g.eventId}
                className="reveal border-t rule pt-6"
                style={{ '--i': idx } as React.CSSProperties}
              >
                <div className="flex items-baseline justify-between gap-6">
                  <div>
                    <p className="eyebrow mb-1 flex items-baseline gap-2">
                      <i
                        className={`cubing-icon event-${g.eventId}`}
                        style={{ fontSize: 16, lineHeight: 1 }}
                        aria-hidden="true"
                      />
                      <span>{eventLabel(g.eventId, g.eventName)}</span>
                      <span className="text-[var(--color-mute-2)] !tracking-[0.1em]">
                        · {metricLabel(primary.metric)}
                      </span>
                    </p>
                    <p
                      className="font-display text-[2.25rem] leading-none text-[var(--color-ink)]"
                      style={{
                        fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 420',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      #{primary.rank.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className="font-mono tnum text-[2.25rem] leading-none text-[var(--color-ink)]"
                    >
                      {formatRating(primary.rating)}
                    </p>
                    {primaryDecayed && (
                      <p
                        className="mt-1 font-mono tnum text-[11px] text-[var(--color-mute-2)]"
                        title="Raw rating before inactivity decay"
                      >
                        raw {formatRating(primary.raw_rating)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-mono tnum text-[11px] text-[var(--color-muted)]">
                      {primary.result_count} results · last {formatDate(primary.last_competed_at)}
                    </p>
                    {secondary && (
                      <p className="font-mono tnum text-[11px] text-[var(--color-mute-2)]">
                        {metricLabel(secondary.metric)}:{' '}
                        <span className="text-[var(--color-muted)]">
                          {formatRating(secondary.rating)}
                        </span>{' '}
                        · #{secondary.rank.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <RatingHistoryChart data={history} width={160} height={40} />
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
                      <i
                        className={`cubing-icon event-${r.event_id}`}
                        style={{ fontSize: 14, lineHeight: 1, marginRight: 6 }}
                        aria-hidden="true"
                      />
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

function metricLabel(m: Metric): string {
  return m === 'average' ? 'Average' : 'Single';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Collapse the raw per-(event, metric) rows into one card per event,
 * picking the "natural" primary metric for that event (averages for
 * Ao5/Mo3 events, single for BLD/FMC/multi).
 */
function groupRatingsByEvent(rows: CompetitorEventRating[]): EventGroup[] {
  const SINGLE_EVENTS = new Set(['333bf', '444bf', '555bf', '333mbf', '333fm']);
  const byEvent = new Map<string, CompetitorEventRating[]>();
  for (const r of rows) {
    const list = byEvent.get(r.event_id) ?? [];
    list.push(r);
    byEvent.set(r.event_id, list);
  }
  const groups: EventGroup[] = [];
  for (const [eventId, list] of byEvent) {
    const single = list.find((r) => r.metric === 'single') ?? null;
    const average = list.find((r) => r.metric === 'average') ?? null;
    const primaryMetric: Metric = SINGLE_EVENTS.has(eventId) ? 'single' : 'average';
    const primary =
      (primaryMetric === 'single' ? single : average) ?? single ?? average!;
    const secondary = primary === single ? average : single;
    groups.push({
      eventId,
      eventName: primary.event_name,
      eventRank: primary.event_rank,
      primary,
      secondary,
    });
  }
  return groups.sort((a, b) => a.eventRank - b.eventRank);
}
