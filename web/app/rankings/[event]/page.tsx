import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { EventPicker } from '@/components/EventPicker';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { LeaderboardSkeleton } from '@/components/Skeletons';
import { LastUpdated } from '@/components/LastUpdated';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { MetricToggle } from '@/components/MetricToggle';
import { RegionPicker } from '@/components/RegionPicker';
import {
  getEvent,
  getEvents,
  getLeaderboard,
  getMetadata,
  getContinents,
  getCountries,
  defaultMetricFor,
  coerceMetric,
  type Metric,
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

  // Shell data — all cached via unstable_cache, so this resolves instantly
  // from the second render onward regardless of the current filter.
  const [event, events, meta, continents, countries] = await Promise.all([
    getEvent(eventId),
    getEvents(),
    getMetadata(),
    getContinents(),
    getCountries(),
  ]);
  if (!event || !event.rateable) notFound();

  const defaultMetric = defaultMetricFor(event);
  const requestedMetric = coerceMetric(metricParam, defaultMetric);
  const metricExists =
    requestedMetric === 'single' ? event.has_single : event.has_average;
  const effectiveMetric = metricExists ? requestedMetric : defaultMetric;

  const regionLabel = region
    ? region.startsWith('_')
      ? (continents.find((c) => c.id === region)?.name ?? null)
      : (countries.find((c) => c.id === region)?.name ?? null)
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
          <div className="mt-4 max-w-[72ch] flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <LastUpdated
              lastImportFinished={meta.lastImportFinished}
              lastExportDate={meta.lastExportDate}
            />
            <a
              href={shareCardHref(event.id, effectiveMetric, region, defaultMetric)}
              target="_blank"
              rel="noopener noreferrer"
              className="ink-link eyebrow !tracking-[0.16em]"
              title="View the shareable social-card image"
            >
              Share card ↗
            </a>
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
            <Suspense
              key={`stats-${effectiveMetric}-${region ?? 'all'}`}
              fallback={
                <span className="skel h-[12px] w-[170px] rounded-[2px]" />
              }
            >
              <StatsLine
                eventId={event.id}
                metric={effectiveMetric}
                region={region}
                limit={limit}
                regionLabel={regionLabel}
              />
            </Suspense>
          </div>
        </div>

        <Suspense
          key={`rows-${effectiveMetric}-${region ?? 'all'}`}
          fallback={<LeaderboardSkeleton rows={12} />}
        >
          <LeaderboardSection
            eventId={event.id}
            metric={effectiveMetric}
            region={region}
            limit={limit}
            metricParam={metricParam}
          />
        </Suspense>
      </section>
    </>
  );
}

/**
 * The filter-dependent slice. Isolated into its own async component so its
 * container <Suspense> remounts on filter change, showing the skeleton
 * during the brief data fetch.
 */
async function LeaderboardSection({
  eventId,
  metric,
  region,
  limit,
  metricParam,
}: {
  eventId: string;
  metric: Metric;
  region: string | null;
  limit: number;
  metricParam: string | undefined;
}) {
  const rows = await getLeaderboard(eventId, { metric, region, limit });
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <LeaderboardTable rows={rows} />
      {limit < total && (
        <div className="flex items-center justify-center mt-10 mb-8">
          <LoadMoreButton
            href={paramAppend('limit', String(Math.min(total, limit + 200)), {
              metric: metricParam,
              region,
            })}
            label="Load next 200 →"
          />
        </div>
      )}
    </>
  );
}

/**
 * Small N-rated / top-N / global-rank legend. Same query as the leaderboard
 * but gated by its own Suspense so the stats skeleton doesn't look weird
 * next to a fully-loaded table or vice versa.
 */
async function StatsLine({
  eventId,
  metric,
  region,
  limit,
  regionLabel,
}: {
  eventId: string;
  metric: Metric;
  region: string | null;
  limit: number;
  regionLabel: string | null;
}) {
  const rows = await getLeaderboard(eventId, { metric, region, limit });
  const total = rows[0]?.total ?? 0;
  return (
    <span className="font-mono tnum text-[11px] text-[var(--color-mute-2)] whitespace-nowrap">
      {total.toLocaleString()}
      {region ? ` in ${regionLabel ?? 'region'}` : ' rated'} · top{' '}
      {Math.min(limit, total)}
      {region ? ' · global rank' : ''}
    </span>
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

function shareCardHref(
  eventId: string,
  metric: 'single' | 'average',
  region: string | null,
  defaultMetric: 'single' | 'average',
): string {
  const sp = new URLSearchParams();
  if (metric !== defaultMetric) sp.set('metric', metric);
  if (region) sp.set('region', region);
  const s = sp.toString();
  return `/rankings/${eventId}/og${s ? `?${s}` : ''}`;
}
