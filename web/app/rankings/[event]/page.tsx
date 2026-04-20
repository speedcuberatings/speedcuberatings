import { notFound } from 'next/navigation';
import { EventPicker } from '@/components/EventPicker';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import {
  getEvent,
  getEvents,
  getLeaderboard,
  getLeaderboardSize,
  getMetadata,
} from '@/lib/queries';
import { eventLabel } from '@/lib/format';

export const revalidate = 300; // 5 minutes

interface PageProps {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ limit?: string }>;
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
  const { limit: limitParam } = await searchParams;
  const limit = clampLimit(limitParam);

  const [event, events, meta] = await Promise.all([
    getEvent(eventId),
    getEvents(),
    getMetadata(),
  ]);
  if (!event || !event.rateable) notFound();

  const [rows, total] = await Promise.all([
    getLeaderboard(eventId, limit),
    getLeaderboardSize(eventId),
  ]);

  const asOf = meta.lastExportDate ? new Date(meta.lastExportDate) : null;

  return (
    <>
      <EventPicker items={events} activeEventId={eventId} />
      <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <header className="pt-12 pb-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <p className="eyebrow mb-3">Event № {event.rank}</p>
            <h1
              className="font-display leading-[0.95] text-[var(--color-ink)]
                         text-[clamp(3rem,8vw,5.75rem)]"
              style={{
                fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
                letterSpacing: '-0.035em',
              }}
            >
              {eventLabel(event.id, event.name)}{' '}
              <span className="italic text-[var(--color-accent)]">rankings</span>
            </h1>
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-4 font-mono text-[12px] leading-tight">
            <Stat label="Rated competitors" value={total.toLocaleString()} />
            <Stat
              label="Source"
              value={asOf ? dateShort(asOf) : '—'}
              helper="Latest WCA export"
            />
            <Stat label="Window" value="24 months" />
            <Stat label="Showing" value={`Top ${rows.length}`} />
          </dl>
        </header>

        <div className="border-t rule">
          <LeaderboardTable rows={rows} />
        </div>

        {limit < total && (
          <div className="flex items-center justify-center mt-10 mb-8">
            <a
              href={`?limit=${Math.min(total, limit + 200)}`}
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

function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div>
      <dt className="eyebrow mb-1.5">{label}</dt>
      <dd className="text-[18px] text-[var(--color-ink)] tabular-nums">{value}</dd>
      {helper && (
        <dd className="text-[10px] uppercase tracking-wider text-[var(--color-mute-2)] mt-0.5">
          {helper}
        </dd>
      )}
    </div>
  );
}

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 100;
  return Math.max(10, Math.min(2000, n));
}

function dateShort(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
