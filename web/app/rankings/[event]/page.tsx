import { notFound } from 'next/navigation';
import { EventPicker } from '@/components/EventPicker';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { LastUpdated } from '@/components/LastUpdated';
import { MetricToggle } from '@/components/MetricToggle';
import { RegionPicker } from '@/components/RegionPicker';
import {
  getEvent,
  getEvents,
  getLeaderboard,
  getLeaderboardSize,
  getMetadata,
  getContinents,
  getCountries,
  defaultMetricFor,
  coerceMetric,
} from '@/lib/queries';
import { eventLabel } from '@/lib/format';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ limit?: string; metric?: string; region?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { event } = await params;
  const e = await getEvent(event);
  if (!e) return {};
  return {
    title: `${eventLabel(e.id, e.name)} rankings`,
    description: `Performance-rated leaderboard for ${eventLabel(e.id, e.name)}, derived from WCA results over the last 2 years.`,
  };
}

export default async function RankingsPage({ params, searchParams }: PageProps) {
  const { event: eventId } = await params;
  const { limit: limitParam, metric: metricParam, region: regionParam } =
    await searchParams;
  const limit = clampLimit(limitParam);
  const region = regionParam?.length ? regionParam : null;

  const [event, events, meta, continents, countries] = await Promise.all([
    getEvent(eventId),
    getEvents(),
    getMetadata(),
    getContinents(),
    getCountries(),
  ]);
  if (!event || !event.rateable) notFound();

  const defaultMetric = defaultMetricFor(event);
  const metric = coerceMetric(metricParam, defaultMetric);
  // If the requested metric doesn't exist for this event, fall back to the default.
  const metricExists =
    metric === 'single' ? event.has_single : event.has_average;
  const effectiveMetric = metricExists ? metric : defaultMetric;

  const [rows, total] = await Promise.all([
    getLeaderboard(eventId, { metric: effectiveMetric, region, limit }),
    getLeaderboardSize(eventId, { metric: effectiveMetric, region }),
  ]);

  // Readable label for the region in the headline.
  const regionLabel = region
    ? region.startsWith('_')
      ? continents.find((c) => c.id === region)?.name ?? null
      : countries.find((c) => c.id === region)?.name ?? null
    : null;

  return (
    <>
      <EventPicker items={events} activeEventId={eventId} />
      <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <header className="pt-12 pb-8">
          <h1
            className="font-display leading-[0.95] text-[var(--color-ink)]
                       text-[clamp(3rem,8vw,5.75rem)]"
            style={{
              fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
              letterSpacing: '-0.035em',
            }}
          >
            {regionLabel ? `${regionLabel} ` : ''}
            {eventLabel(event.id, event.name)}{' '}
            <span className="italic text-[var(--color-accent)]">rankings</span>
          </h1>
          <div className="mt-4 max-w-[72ch]">
            <LastUpdated
              lastImportFinished={meta.lastImportFinished}
              lastExportDate={meta.lastExportDate}
            />
          </div>
        </header>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 pb-6 border-b rule">
          <RegionPicker
            continents={continents}
            countries={countries}
            region={region}
          />
          <div className="flex items-center gap-4 self-start lg:self-auto">
            <MetricToggle
              current={effectiveMetric}
              show={{ single: event.has_single, average: event.has_average }}
            />
            <span className="font-mono tnum text-[11px] text-[var(--color-mute-2)] whitespace-nowrap">
              {total.toLocaleString()} rated · top {Math.min(limit, total)}
            </span>
          </div>
        </div>

        <LeaderboardTable rows={rows} />

        {limit < total && (
          <div className="flex items-center justify-center mt-10 mb-8">
            <a
              href={paramAppend('limit', String(Math.min(total, limit + 200)), {
                metric: metricParam,
                region,
              })}
              className="eyebrow !tracking-[0.2em] border rule px-6 py-3
                         hover:bg-[var(--color-paper-2)] transition-colors"
            >
              Load next 200 →
            </a>
          </div>
        )}
      </section>
    </>
  );
}

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 100;
  return Math.max(10, Math.min(2000, n));
}

function paramAppend(
  key: string,
  value: string,
  keep: Record<string, string | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(keep)) if (v) sp.set(k, v);
  sp.set(key, value);
  return `?${sp.toString()}`;
}
