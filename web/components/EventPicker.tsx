'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { eventLabel } from '@/lib/format';

export interface EventPickerItem {
  id: string;
  name: string;
  rateable: boolean;
}

/**
 * Horizontal typographic ribbon listing the rateable events. Active event
 * is marked with an accent underline. Scrollable on small screens with a
 * soft fade at the edges (implemented in globals.css via mask if needed).
 */
export function EventPicker({
  items,
  activeEventId,
}: {
  items: EventPickerItem[];
  activeEventId?: string;
}) {
  const pathname = usePathname();
  const rateable = items.filter((e) => e.rateable);

  return (
    <nav
      aria-label="Event"
      className="border-y rule overflow-x-auto overscroll-contain w-full max-w-full"
    >
      <ul className="mx-auto flex items-center gap-6 px-4 sm:px-8 py-3 w-max max-w-[1200px]">
        {rateable.map((e) => {
          const href = `/rankings/${e.id}`;
          const active = activeEventId === e.id || pathname === href;
          return (
            <li key={e.id}>
              <Link
                href={href}
                className={[
                  'relative font-body text-[13px] tracking-[0.04em] whitespace-nowrap',
                  'py-1 transition-colors duration-200',
                  active
                    ? 'text-[var(--color-ink)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
                ].join(' ')}
              >
                {eventLabel(e.id, e.name)}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-[13px] h-[2px] bg-[var(--color-accent)]"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
