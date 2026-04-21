import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getEvent,
  getEvents,
  defaultMetricFor,
  coerceMetric,
  type Metric,
} from '@/lib/queries';
import { eventLabel } from '@/lib/format';
import { CalibrationApp } from '@/components/calibrate/CalibrationApp';

/**
 * `/calibrate/[event]` — hidden calibration sandbox for the rating formula.
 *
 * This route is intentionally unlinked from the header, footer, and every
 * other page on the site: access-by-obscurity. We also ship
 * `robots: { index: false }` so search engines won't surface it.
 *
 * The page itself is mostly a client-side app (see CalibrationApp): a
 * full port of the rating formula runs in the browser over a
 * pre-fetched candidate pool, so every slider move re-ranks the
 * leaderboard instantly.
 */
export const metadata: Metadata = {
  title: 'Calibrate',
};

interface PageProps {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ metric?: string; c?: string }>;
}

export default async function CalibratePage({ params, searchParams }: PageProps) {
  const { event: eventId } = await params;
  const { metric: metricParam } = await searchParams;

  const [event, events] = await Promise.all([getEvent(eventId), getEvents()]);
  if (!event || !event.rateable) notFound();

  const defaultMetric = defaultMetricFor(event);
  const requestedMetric = coerceMetric(metricParam, defaultMetric);
  const metricExists =
    requestedMetric === 'single' ? event.has_single : event.has_average;
  const effectiveMetric: Metric = metricExists ? requestedMetric : defaultMetric;

  // The rateable events list is shared with the ranking-page EventPicker
  // so the two pages feel like different views of the same app.
  const rateableEvents = events
    .filter((e) => e.rateable)
    .map((e) => ({ id: e.id, name: e.name, rateable: true }));

  return (
    <CalibrationApp
      eventId={event.id}
      eventName={eventLabel(event.id, event.name)}
      metric={effectiveMetric}
      defaultMetric={defaultMetric}
      hasSingle={event.has_single}
      hasAverage={event.has_average}
      events={rateableEvents}
    />
  );
}
