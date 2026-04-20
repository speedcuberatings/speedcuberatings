'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Continent, Country } from '@/lib/queries';

/**
 * Two-step region picker, inspired by the WCA rankings page:
 *   [ All · Africa · Asia · Europe · N. America · Oceania · S. America ]
 *   [ Country dropdown narrowed to the selected continent ]
 *
 * Driven entirely by the `?region=` URL param. `region` can be null
 * (everyone), a continent id like `_Europe`, or a country id like
 * `United States`. The component computes both currently-selected values
 * by inspecting `region` against the country list.
 */
export function RegionPicker({
  continents,
  countries,
  region,
}: {
  continents: Continent[];
  countries: Country[];
  region: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  // Determine currently-selected continent:
  //  - if region is an explicit continent id => that
  //  - if region is a country id => that country's continent
  //  - otherwise => 'all'
  let selectedContinent: string = 'all';
  let selectedCountry: string | null = null;
  if (region) {
    if (region.startsWith('_')) {
      selectedContinent = region;
    } else {
      const country = countries.find((c) => c.id === region);
      if (country) {
        selectedCountry = region;
        selectedContinent = country.continent_id ?? 'all';
      }
    }
  }

  const go = (next: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (!next) sp.delete('region');
    else sp.set('region', next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filteredCountries =
    selectedContinent === 'all'
      ? []
      : countries.filter((c) => c.continent_id === selectedContinent);

  const short = (name: string) =>
    name
      .replace('North America', 'N. America')
      .replace('South America', 'S. America');

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      <div
        role="tablist"
        aria-label="Continent"
        className="flex flex-wrap gap-x-5 gap-y-2 items-center text-[12px] tracking-[0.04em]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedContinent === 'all'}
          onClick={() => go(null)}
          className={tabClass(selectedContinent === 'all')}
        >
          All regions
        </button>
        {continents.map((c) => {
          const active = selectedContinent === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(c.id)}
              className={tabClass(active)}
            >
              {short(c.name)}
            </button>
          );
        })}
      </div>

      {selectedContinent !== 'all' && filteredCountries.length > 0 && (
        <div>
          <label className="sr-only" htmlFor="country-select">
            Country
          </label>
          <select
            id="country-select"
            value={selectedCountry ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              go(v || selectedContinent);
            }}
            className="font-body text-[13px] bg-transparent border rule rounded-[2px]
                       px-3 py-2 text-[var(--color-ink)]
                       hover:bg-[var(--color-paper-2)]
                       focus:outline-none focus:border-[var(--color-accent)]"
          >
            <option value="">All countries</option>
            {filteredCountries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function tabClass(active: boolean): string {
  return [
    'relative py-1 transition-colors',
    active
      ? 'text-[var(--color-ink)]'
      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
    active
      ? 'after:absolute after:left-0 after:right-0 after:-bottom-[2px] after:h-[2px] after:bg-[var(--color-accent)]'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
