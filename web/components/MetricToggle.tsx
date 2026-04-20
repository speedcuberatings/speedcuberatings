'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Metric } from '@/lib/queries';

/**
 * Two-option toggle for Single vs. Average. Only rendered when both metrics
 * exist for the current event.
 *
 * - Uses router.push (not <Link>) so the tap fires synchronously.
 * - Wraps the navigation in useTransition so React keeps the UI
 *   interactive during the in-flight data fetch — without it, the
 *   App Router holds the previous render until the new one is ready
 *   and rapid taps feel ignored.
 * - Tracks an optimistic "pending" target so the toggle visually
 *   updates the instant you tap, instead of waiting for the URL to
 *   change after the transition resolves. This is the visual feedback
 *   that confirms the tap registered.
 */
export function MetricToggle({
  current,
  show,
}: {
  current: Metric;
  show: { single: boolean; average: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Metric | null>(null);

  // Once the URL/server state catches up to where we wanted to go,
  // drop the optimistic override.
  useEffect(() => {
    if (pending !== null && pending === current) setPending(null);
  }, [pending, current]);

  if (!show.single || !show.average) return null;

  const displayed: Metric = pending ?? current;

  const hrefFor = (metric: Metric) => {
    const sp = new URLSearchParams(params.toString());
    if (metric === 'average') sp.delete('metric'); // average is the default
    else sp.set('metric', metric);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div
      role="group"
      aria-label="Rating metric"
      className="inline-flex border rule rounded-[2px] overflow-hidden font-body"
    >
      {(['average', 'single'] as const).map((m) => {
        const active = displayed === m;
        return (
          <button
            key={m}
            type="button"
            aria-current={active ? 'true' : undefined}
            aria-pressed={active}
            onClick={() => {
              if (displayed === m) return;
              setPending(m);
              startTransition(() => {
                router.push(hrefFor(m), { scroll: false });
              });
            }}
            className={[
              'inline-flex items-center justify-center min-h-[44px] px-5 py-2',
              'text-[12px] tracking-[0.08em] uppercase transition-colors',
              '[touch-action:manipulation] [-webkit-tap-highlight-color:transparent]',
              'cursor-pointer select-none',
              active
                ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]',
            ].join(' ')}
          >
            {m === 'average' ? 'Average' : 'Single'}
          </button>
        );
      })}
    </div>
  );
}
