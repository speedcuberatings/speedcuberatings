'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from '@/components/Flag';
import type { CompetitorSearchResult } from '@/lib/queries';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Global competitor search for the site header. Debounced typeahead
 * against `/api/search`; selecting a result navigates to the
 * competitor's profile. Plain-React combobox in the same style as
 * `SearchableSelect`.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompetitorSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  const q = query.trim();

  useEffect(() => {
    abortRef.current?.abort();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as { results: CompetitorSearchResult[] };
        setResults(data.results);
        setCursor(0);
        setLoading(false);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[cursor] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const commit = useCallback(
    (r: CompetitorSearchResult | undefined) => {
      if (!r) return;
      setOpen(false);
      setQuery('');
      setResults([]);
      router.push(`/competitors/${r.wca_id}`);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(results[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const showPanel = open && q.length >= MIN_QUERY_LENGTH;

  return (
    <div ref={rootRef} className="relative w-full sm:w-[220px]">
      <div
        className={[
          'flex items-center gap-2 px-3 h-[36px]',
          'border rule rounded-[2px] bg-transparent',
          'focus-within:border-[var(--color-accent)] transition-colors',
        ].join(' ')}
      >
        <SearchIcon />
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search competitors…"
          aria-label="Search competitors by name or WCA ID"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={
            showPanel && results.length > 0 ? `${listId}-${cursor}` : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-transparent outline-none
                     font-body text-[16px] sm:text-[13px] text-[var(--color-ink)]
                     placeholder:text-[var(--color-mute-2)]"
        />
      </div>

      {showPanel && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-[var(--color-paper)]
                     border rule rounded-[2px] shadow-[0_8px_24px_rgba(24,23,28,0.08)]
                     overflow-hidden"
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Competitor search results"
            className="max-h-[320px] overflow-y-auto py-1 [overscroll-behavior:contain]"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-[var(--color-mute-2)]">
                {loading ? 'Searching…' : 'No matches'}
              </li>
            ) : (
              results.map((r, idx) => {
                const active = idx === cursor;
                return (
                  <li
                    key={r.wca_id}
                    id={`${listId}-${idx}`}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setCursor(idx)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      commit(r);
                    }}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2.5 sm:py-2 cursor-pointer',
                      'font-body text-[14px] sm:text-[13px] min-h-[44px] sm:min-h-0',
                      '[touch-action:manipulation] [-webkit-tap-highlight-color:transparent]',
                      active ? 'bg-[var(--color-paper-2)]' : '',
                      'text-[var(--color-ink)]',
                    ].join(' ')}
                  >
                    <Flag iso2={r.country_iso2} name={r.country_id} size={14} />
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-[var(--color-mute-2)] shrink-0">
                      {r.wca_id}
                    </span>
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

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 13 13"
      className="shrink-0 text-[var(--color-muted)]"
    >
      <circle
        cx="5.5"
        cy="5.5"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M8.5 8.5L12 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
