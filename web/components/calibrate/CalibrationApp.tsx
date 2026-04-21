'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventPicker, type EventPickerItem } from '@/components/EventPicker';
import { MetricToggle } from '@/components/MetricToggle';
import { CalibrationForm } from './CalibrationForm';
import { EventOverridesPanel } from './EventOverridesPanel';
import { CalibrationLeaderboard } from './CalibrationLeaderboard';
import { StatusBar } from './StatusBar';
import { JsonPortControls } from './JsonPortControls';
import { computeLeaderboard, engineParity } from '@/lib/rating-engine/compute';
import {
  configFromJson,
  configFromUrlParam,
  configToJson,
  configToUrlParam,
  isDefaultConfig,
} from '@/lib/rating-engine/codec';
import { freshDefault } from '@/lib/rating-engine/defaults';
import type { CandidatePool, Metric, RatingConfig } from '@/lib/rating-engine/types';

/**
 * Top-level client component for the calibration page.
 *
 * Responsibilities:
 *  - Fetch the candidate pool for the current (event, metric).
 *  - Hold the working `RatingConfig` in React state.
 *  - Sync the config to the URL (as a short base64 diff) on debounce.
 *  - Pipe config + pool through `computeLeaderboard` via useMemo so every
 *    knob turn re-ranks instantly.
 *  - Wire the event picker / metric toggle / import-export controls.
 *
 * Config changes don't cause a server round-trip — the pool is static
 * per (event, metric) for up to an hour; we only refetch when the user
 * navigates to a different event or switches metrics.
 */
export function CalibrationApp({
  eventId,
  eventName,
  metric,
  defaultMetric,
  hasSingle,
  hasAverage,
  events,
}: {
  eventId: string;
  eventName: string;
  metric: Metric;
  defaultMetric: Metric;
  hasSingle: boolean;
  hasAverage: boolean;
  events: EventPickerItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialConfigParam = searchParams.get('c') ?? '';

  // Decode config from URL once on mount; subsequent URL pushes come from us.
  const [config, setConfig] = useState<RatingConfig>(() =>
    initialConfigParam ? configFromUrlParam(initialConfigParam) : freshDefault(),
  );

  const [pool, setPool] = useState<CandidatePool | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);

  // Fetch the candidate pool whenever (event, metric) changes. The server
  // route sets its own Cache-Control (s-maxage=3600, SWR=7200) so the
  // CDN does the right thing without us forcing anything on the client.
  // Explicitly *not* using `cache: 'force-cache'` because that would
  // happily serve a cached 500 from a prior failed request, which bit
  // us during dev iteration.
  useEffect(() => {
    let cancelled = false;
    setPoolLoading(true);
    setPoolError(null);
    fetch(`/api/calibrate/pool?event=${encodeURIComponent(eventId)}&metric=${metric}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as CandidatePool;
      })
      .then((data) => {
        if (cancelled) return;
        setPool(data);
        setPoolLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPoolError(String(err?.message ?? err));
        setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, metric]);

  // Re-rank on every config or pool change. Pure function; cheap.
  const rows = useMemo(() => {
    if (!pool) return [];
    return computeLeaderboard(pool, config);
  }, [pool, config]);

  const parity = useMemo(() => engineParity(rows), [rows]);
  const atDefault = useMemo(() => isDefaultConfig(config), [config]);

  // Sync config → URL (`?c=<base64 diff>`), debounced. Keeping URL
  // up-to-date lets people copy/share their current state.
  const lastUrlParamRef = useRef<string>(initialConfigParam);
  useEffect(() => {
    const param = configToUrlParam(config);
    if (param === lastUrlParamRef.current) return;
    lastUrlParamRef.current = param;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (param) sp.set('c', param);
      else sp.delete('c');
      const qs = sp.toString();
      const url = qs ? `?${qs}` : window.location.pathname;
      // shallow + scroll-preserve so slider tweaking doesn't jump.
      router.replace(url, { scroll: false });
    }, 120);
    return () => clearTimeout(t);
  }, [config, router, searchParams]);

  const handleReset = useCallback(() => {
    setConfig(freshDefault());
  }, []);

  const handleExport = useCallback(() => {
    const json = configToJson(config);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tag = atDefault ? 'default' : 'custom';
    a.download = `scr-calibration-${tag}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [config, atDefault]);

  const handleImport = useCallback((json: string) => {
    try {
      const next = configFromJson(json);
      setConfig(next);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String((err as Error)?.message ?? err) };
    }
  }, []);

  const handleCopyUrl = useCallback(async () => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String((err as Error)?.message ?? err) };
    }
  }, []);

  return (
    <>
      <EventPicker
        items={events}
        activeEventId={eventId}
        basePath="/calibrate"
        preserveQuery
      />
      <section className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <header className="pt-12 pb-8">
          <p className="eyebrow mb-3">Calibration · experimental</p>
          <h1
            className="font-display leading-[0.95] text-[var(--color-ink)]
                       text-[clamp(3rem,8vw,5.75rem)]"
            style={{
              fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
              letterSpacing: '-0.035em',
            }}
          >
            {eventName}{' '}
            <span className="italic text-[var(--color-accent)]">sandbox</span>.
          </h1>
          <p className="mt-4 max-w-[64ch] text-[15px] leading-[1.7] text-[var(--color-ink-soft)]">
            Tune every knob of the rating formula and watch the top of the
            {' '}leaderboard re-rank instantly. Computes entirely in your
            browser; nothing you change here affects the live site.
            {' '}<span className="eyebrow !tracking-[0.12em]">copy URL to share</span>.
          </p>
        </header>

        {/* Status + controls bar */}
        <div
          className="border-y rule py-3 flex flex-col gap-3
                     sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-4 gap-y-2">
            <MetricToggle
              current={metric}
              show={{ single: hasSingle, average: hasAverage }}
            />
            <StatusBar
              config={config}
              atDefault={atDefault}
              parity={parity}
              poolSize={pool?.candidates.length ?? 0}
            />
          </div>
          <JsonPortControls
            onReset={handleReset}
            onExport={handleExport}
            onImport={handleImport}
            onCopyUrl={handleCopyUrl}
          />
        </div>

        {/* Main content */}
        <div
          className="grid gap-x-10 gap-y-8 py-10
                     grid-cols-1
                     lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]"
        >
          {/* Config rail */}
          <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-24px)] lg:overflow-y-auto lg:pr-2">
            <CalibrationForm config={config} onChange={setConfig} />
            <div className="mt-8">
              <EventOverridesPanel
                config={config}
                onChange={setConfig}
                events={events}
                activeEventId={eventId}
              />
            </div>
          </aside>

          {/* Leaderboard */}
          <div>
            <div className="flex items-baseline justify-between gap-6 pb-3 mb-2 border-b rule">
              <h2
                className="font-display text-[1.5rem] text-[var(--color-ink)] leading-none"
                style={{
                  fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 500',
                  letterSpacing: '-0.015em',
                }}
              >
                Custom leaderboard
              </h2>
              <span className="eyebrow !tracking-[0.14em]">
                top {Math.min(10, rows.filter((r) => r.rank != null).length)} of{' '}
                {pool?.candidates.length ?? 0} candidates
              </span>
            </div>
            {poolLoading && (
              <p className="eyebrow py-16 text-center">loading candidate pool…</p>
            )}
            {poolError && (
              <p className="eyebrow py-16 text-center text-[var(--color-accent)]">
                failed to load pool — {poolError}
              </p>
            )}
            {!poolLoading && !poolError && pool && (
              <CalibrationLeaderboard
                rows={rows.filter((r) => r.rank != null).slice(0, 10)}
                allRows={rows}
                metric={metric}
                eventFormat={pool.event.format}
              />
            )}
          </div>
        </div>

        <p className="eyebrow mt-12 mb-4 text-[var(--color-mute-2)]">
          candidate pool is the top {pool?.candidates.length ?? 50} production
          competitors for this event × metric · a radical config change that
          would promote competitors outside this pool won&rsquo;t be
          reflected here
        </p>
      </section>
    </>
  );
}
