import { RatingHistoryChart } from './RatingHistoryChart';
import type {
  CompetitorEventRating,
  Metric,
  RatingHistoryPoint,
} from '@/lib/queries';
import { eventLabel, formatRating, formatDate } from '@/lib/format';

export interface ProfileEventCardProps {
  eventId: string;
  eventName: string;
  /** Which metric the user has currently selected at the page level. */
  selectedMetric: Metric;
  single: CompetitorEventRating | null;
  average: CompetitorEventRating | null;
  historySingle: RatingHistoryPoint[];
  historyAverage: RatingHistoryPoint[];
  index: number;
}

/**
 * Display-only profile event card. The chosen metric is driven by the
 * page-level toggle (see GlobalMetricToggle). If the selected metric
 * isn't rated for this competitor / event, we fall back to the other
 * metric and flag it.
 */
export function ProfileEventCard({
  eventId,
  eventName,
  selectedMetric,
  single,
  average,
  historySingle,
  historyAverage,
  index,
}: ProfileEventCardProps) {
  const preferred = selectedMetric === 'single' ? single : average;
  const fallback = selectedMetric === 'single' ? average : single;
  const active = preferred ?? fallback;
  if (!active) return null;

  const isFallback = !preferred && !!fallback;
  const shownMetric: Metric = active === single ? 'single' : 'average';
  const history =
    shownMetric === 'single' ? historySingle : historyAverage;
  const decayed = active.rating < active.raw_rating - 0.5;

  return (
    <article
      className="reveal border-t rule pt-6"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <p className="eyebrow flex items-baseline gap-2">
          <i
            className={`cubing-icon event-${eventId}`}
            style={{ fontSize: 16, lineHeight: 1 }}
            aria-hidden="true"
          />
          <span>{eventLabel(eventId, eventName)}</span>
          <span className="text-[var(--color-mute-2)] !tracking-[0.12em]">
            · {metricLabel(shownMetric)}
          </span>
        </p>
        {isFallback && (
          <span
            className="eyebrow !tracking-[0.12em] text-[var(--color-mute-2)]"
            title={`Not rated in ${metricLabel(selectedMetric)} for this event`}
          >
            {metricLabel(shownMetric)} only
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-6">
        <p
          className="font-display text-[2.25rem] leading-none text-[var(--color-ink)]"
          style={{
            fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 420',
            letterSpacing: '-0.02em',
          }}
        >
          #{active.rank.toLocaleString()}
        </p>
        <div className="text-right">
          <p className="font-mono tnum text-[2.25rem] leading-none text-[var(--color-ink)]">
            {formatRating(active.rating)}
          </p>
          {decayed && (
            <p
              className="mt-1 font-mono tnum text-[11px] text-[var(--color-mute-2)]"
              title="Raw rating before inactivity decay"
            >
              raw {formatRating(active.raw_rating)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="font-mono tnum text-[11px] text-[var(--color-muted)]">
          {active.result_count} results · last {formatDate(active.last_competed_at)}
        </p>
        <RatingHistoryChart data={history} width={160} height={40} />
      </div>
    </article>
  );
}

function metricLabel(m: Metric): string {
  return m === 'average' ? 'Average' : 'Single';
}
