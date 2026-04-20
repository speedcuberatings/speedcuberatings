'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Continent, Country } from '@/lib/queries';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

/**
 * Region picker: a searchable Region dropdown (All / continent) plus,
 * once a continent is selected, a second searchable Country dropdown
 * scoped to that continent. URL-driven via `?region=...`.
 *
 * `region` encoding in the URL:
 *   - null              → All regions
 *   - `_Continent`      → a continent (e.g. `_Europe`)
 *   - `Country Name`    → a single country (the WCA country id)
 *
 * Navigations are wrapped in useTransition so the UI stays interactive
 * while the new leaderboard is being fetched, and the visible selection
 * updates optimistically the moment a value is picked instead of waiting
 * for the URL to change.
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
  const [, startTransition] = useTransition();
  // `null` here means "no override" — display the URL-derived region.
  // `''` means optimistic All regions, anything else is the optimistic
  // selection waiting for the URL to catch up.
  const [pendingRegion, setPendingRegion] = useState<string | null | undefined>(
    undefined,
  );
  const effectiveRegion = pendingRegion === undefined ? region : pendingRegion;

  // Drop the optimistic override once the URL catches up.
  useEffect(() => {
    if (pendingRegion !== undefined && pendingRegion === region) {
      setPendingRegion(undefined);
    }
  }, [pendingRegion, region]);

  // Resolve the current continent selection. If region is a country, we
  // infer the continent from the country's `continent_id`.
  let selectedContinent: string = 'all';
  let selectedCountry: string | null = null;
  if (effectiveRegion) {
    if (effectiveRegion.startsWith('_')) {
      selectedContinent = effectiveRegion;
    } else {
      const country = countries.find((c) => c.id === effectiveRegion);
      if (country) {
        selectedCountry = effectiveRegion;
        selectedContinent = country.continent_id ?? 'all';
      }
    }
  }

  const goRegion = (next: string | null) => {
    setPendingRegion(next);
    const sp = new URLSearchParams(params.toString());
    if (!next || next === 'all') sp.delete('region');
    else sp.set('region', next);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const shortContinent = (name: string) =>
    name
      .replace('North America', 'N. America')
      .replace('South America', 'S. America');

  const regionOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'All regions' },
      ...continents.map((c) => ({
        value: c.id,
        label: shortContinent(c.name),
      })),
    ],
    [continents],
  );

  const countryOptions: SearchableSelectOption[] = useMemo(() => {
    if (selectedContinent === 'all') return [];
    const inContinent = countries.filter(
      (c) => c.continent_id === selectedContinent,
    );
    const continentName = continents.find((c) => c.id === selectedContinent)?.name;
    const head: SearchableSelectOption = {
      value: '__all__',
      label: `All of ${continentName ? shortContinent(continentName) : 'continent'}`,
    };
    return [
      head,
      ...inContinent.map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.iso2 ?? undefined,
      })),
    ];
  }, [countries, continents, selectedContinent]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchableSelect
        label="Region"
        value={selectedContinent === 'all' ? null : selectedContinent}
        emptyLabel="All regions"
        placeholder="Type a region…"
        options={regionOptions}
        onChange={(v) => goRegion(v === 'all' ? null : v)}
        width={220}
      />
      {selectedContinent !== 'all' && countryOptions.length > 0 && (
        <SearchableSelect
          label="Country"
          value={selectedCountry}
          emptyLabel={countryOptions[0]?.label ?? 'Country'}
          placeholder="Type a country…"
          options={countryOptions}
          onChange={(v) => goRegion(v === '__all__' ? selectedContinent : v)}
          width={240}
        />
      )}
    </div>
  );
}
