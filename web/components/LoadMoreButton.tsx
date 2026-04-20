'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Load next 200" pagination control. URL-driven (the limit lives in
 * `?limit=...`) but uses router.push inside useTransition so:
 *
 * - The previously-rendered rows stay on screen while the longer list is
 *   being fetched (no flash to skeleton).
 * - The button shows a "Loading…" pending state so it's clear the tap
 *   registered, and double-taps are ignored.
 * - The rest of the page stays interactive during the fetch.
 */
export function LoadMoreButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Track whether we've initiated a navigation; on rerender after the
  // URL settles, we drop back to the regular label.
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    if (!isPending && navigating) setNavigating(false);
  }, [isPending, navigating]);

  return (
    <button
      type="button"
      onClick={() => {
        if (isPending) return;
        setNavigating(true);
        startTransition(() => {
          router.push(href, { scroll: false });
        });
      }}
      aria-busy={isPending}
      disabled={isPending}
      className={[
        'inline-flex items-center justify-center min-h-[44px] px-6 py-3',
        'eyebrow !tracking-[0.2em] border rule',
        '[touch-action:manipulation] [-webkit-tap-highlight-color:transparent]',
        'cursor-pointer select-none transition-colors',
        isPending
          ? 'opacity-60 cursor-wait'
          : 'hover:bg-[var(--color-paper-2)]',
      ].join(' ')}
    >
      {isPending || navigating ? 'Loading…' : label}
    </button>
  );
}
