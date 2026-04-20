'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary text shown right-aligned on the row (e.g. continent). */
  hint?: string;
}

export interface SearchableSelectProps {
  label: string;
  /** Current value, or null when no selection. */
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Text shown in the trigger when value is null. */
  emptyLabel?: string;
  /** Width of both the trigger and the popover. */
  width?: number;
}

/**
 * Editorial searchable dropdown. Plain-React combobox — no UI library —
 * with keyboard navigation (↑/↓/Enter/Escape), type-to-filter, and
 * click-outside-to-close. Styled to match the paper/ink palette.
 */
export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Type to filter…',
  emptyLabel = 'Select…',
  width = 240,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const labelId = useId();
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint && o.hint.toLowerCase().includes(q)),
    );
  }, [query, options]);

  // Keep cursor in range when filter narrows.
  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1));
  }, [filtered.length, cursor]);

  // When opened, focus the search input and reset query.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    // Start cursor at the currently-selected option if any.
    const idx = options.findIndex((o) => o.value === value);
    setCursor(Math.max(0, idx));
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, options, value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Ensure the highlighted row scrolls into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[cursor] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const commit = useCallback(
    (opt: SearchableSelectOption | undefined) => {
      if (!opt) return;
      onChange(opt.value);
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(filtered[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(Math.max(0, filtered.length - 1));
    }
  };

  const triggerLabel = selected ? selected.label : emptyLabel;

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      style={{ width }}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        onClick={() => setOpen((o) => !o)}
        className={[
          'w-full flex items-center justify-between gap-3 px-3 py-2',
          'border rule rounded-[2px] bg-transparent',
          'font-body text-[13px] text-[var(--color-ink)]',
          'hover:bg-[var(--color-paper-2)] transition-colors',
          'focus:outline-none focus:border-[var(--color-accent)]',
          open ? 'border-[var(--color-accent)]' : '',
        ].join(' ')}
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 bg-[var(--color-paper)]
                     border rule rounded-[2px] shadow-[0_8px_24px_rgba(24,23,28,0.08)]
                     overflow-hidden"
          style={{ width }}
        >
          <div className="border-b rule px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label={`Filter ${label}`}
              aria-controls={listId}
              aria-activedescendant={`${listId}-${cursor}`}
              className="w-full bg-transparent outline-none
                         font-body text-[13px] text-[var(--color-ink)]
                         placeholder:text-[var(--color-mute-2)]"
            />
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-[260px] overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-[var(--color-mute-2)]">
                No matches
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const active = idx === cursor;
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    id={`${listId}-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setCursor(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(opt);
                    }}
                    className={[
                      'flex items-baseline justify-between gap-4 px-3 py-1.5 cursor-pointer',
                      'font-body text-[13px]',
                      active
                        ? 'bg-[var(--color-paper-2)] text-[var(--color-ink)]'
                        : 'text-[var(--color-ink)]',
                      isSelected ? 'font-semibold' : '',
                    ].join(' ')}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[11px] text-[var(--color-mute-2)] shrink-0">
                        {opt.hint}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        transition: 'transform 180ms ease',
        transform: open ? 'rotate(180deg)' : 'none',
        color: 'var(--color-muted)',
      }}
    >
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
