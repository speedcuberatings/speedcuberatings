'use client';

import { useState } from 'react';
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
  defaultMetric: Metric;
  single: CompetitorEventRating | null;
  average: CompetitorEventRating | null;
  historySingle: RatingHistoryPoint[];
  historyAverage: RatingHistoryPoint[];
  index: number;
}

/**
 * Profile event card with an optional per-card metric toggle.
 *
 * If the competitor is only rated in one metric for this event, the toggle
 * is hidden and we show whichever rating we have. If both exist, the user
 * can flip between them without a page reload.
 */
export function ProfileEventCard({
  eventId,
  eventName,
  defaultMetric,
  single,
  average,
  historySingle,
  historyAverage,
  index,
}: ProfileEventCardProps) {
  // If the default metric has no rating for this competitor, fall back to
  // whichever metric does.
  const initial: Metric =
    (defaultMetric === 'average' ? average : single) ??
    (defaultMetric === 'average' ? single : average)
      ? defaultMetric
      : single
        ? 'single'
        : 'average';

  const [metric, setMetric] = useState<Metric>(initial);
  const hasSingle = !!single;
  const hasAverage = !!average;
  const showToggle = hasSingle && hasAverage;

  const active = metric === 'single' ? single : average;
  if (!active) return null;

  const history = metric === 'single' ? historySingle : historyAverage;
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
        </p>
        {showToggle && (
          <MetricPill current={metric} onChange={setMetric} />
        )}
        {!showToggle && (
          <span className="eyebrow !tracking-[0.12em] text-[var(--color-mute-2)]">
            {metric === 'average' ? 'Average' : 'Single'} only
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

function MetricPill({
  current,
  onChange,
}: {
  current: Metric;
  onChange: (m: Metric) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Rating metric"
      className="inline-flex border rule rounded-[2px] overflow-hidden"
    >
      {(['average', 'single'] as const).map((m) => {
        const active = current === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={[
              'px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase transition-colors font-body',
              active
                ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]',
            ].join(' ')}
          >
            {m === 'average' ? 'Avg' : 'Sin'}
          </button>
        );
      })}
    </div>
  );
}
