'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { eventLabel } from '@/lib/format';

export interface EventPickerItem {
  id: string;
  name: string;
  rateable: boolean;
}

/**
 * Horizontal ribbon of WCA event icons, sourced from the `@cubing/icons`
 * webfont. Each icon is an `<i class="cubing-icon event-{id}">` which maps
 * to a glyph in the font. The accessible label is the event name; a tooltip
 * shows on hover.
 *
 * The active event is indicated by an accent underline under its icon.
 *
 * `basePath` defaults to `/rankings` for the main leaderboard; the
 * calibration page passes `/calibrate` so clicking an event stays within
 * the sandbox instead of jumping back to the public rankings.
 *
 * `preserveQuery` carries the current URL's search params across event
 * switches. Ranking pages leave this off (switching to a different event
 * resets filters); the calibration page turns it on so the `?c=` config
 * diff survives navigation between events.
 */
export function EventPicker({
  items,
  activeEventId,
  basePath = '/rankings',
  preserveQuery = false,
}: {
  items: EventPickerItem[];
  activeEventId?: string;
  basePath?: string;
  preserveQuery?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = preserveQuery ? searchParams.toString() : '';
  const rateable = items.filter((e) => e.rateable);

  return (
    <nav
      aria-label="Event"
      className="border-y rule overflow-x-auto overscroll-contain w-full max-w-full"
    >
      <ul className="mx-auto flex items-center gap-1 sm:gap-2 px-4 sm:px-8 py-2 w-max max-w-[1200px]">
        {rateable.map((e) => {
          const href = `${basePath}/${e.id}${qs ? `?${qs}` : ''}`;
          const active = activeEventId === e.id || pathname === `${basePath}/${e.id}`;
          const label = eventLabel(e.id, e.name);
          return (
            <li key={e.id}>
              <Link
                href={href}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative inline-flex items-center justify-center',
                  'h-11 w-11 rounded-sm',
                  'transition-colors duration-200',
                  active
                    ? 'text-[var(--color-ink)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]',
                ].join(' ')}
              >
                <i
                  className={`cubing-icon event-${e.id}`}
                  style={{ fontSize: 22, lineHeight: 1 }}
                  aria-hidden="true"
                />
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-2 right-2 -bottom-[9px] h-[2px] bg-[var(--color-accent)]"
                  />
                )}
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
