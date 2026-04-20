'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Metric } from '@/lib/queries';

/**
 * Two-option toggle for Single vs. Average. Only rendered when both metrics
 * exist for the current event.
 *
 * Implemented as <button onClick={router.push}> rather than <Link> so the
 * tap fires synchronously on mobile. With <Link>, soft-nav into a
 * Suspense boundary that renders a skeleton occasionally requires a
 * second tap on iOS — the first tap's click event gets cancelled by the
 * intervening paint. router.push side-steps the issue.
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

  if (!show.single || !show.average) return null;

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
        const active = current === m;
        return (
          <button
            key={m}
            type="button"
            aria-current={active ? 'true' : undefined}
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              router.push(hrefFor(m), { scroll: false });
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
