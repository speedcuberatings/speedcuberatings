import { NextResponse } from 'next/server';
import { searchCompetitors } from '@/lib/queries';

/**
 * Typeahead endpoint for the global competitor search box. Matches
 * competitor names (case-insensitive substring) or an exact WCA ID.
 *
 * `?q=` — search text (min 2 chars after trimming).
 *
 * Responses are cacheable at the edge for a short window since the
 * underlying data only changes on ingest (hourly at most).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchCompetitors(q, 10);
  return NextResponse.json(
    { results },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    },
  );
}
