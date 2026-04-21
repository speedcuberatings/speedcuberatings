import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { CandidatePool, FormatId, Metric, PoolResult } from '@/lib/rating-engine/types';

/**
 * Candidate-pool endpoint for the `/calibrate` page.
 *
 * Given an event + metric, returns:
 *  - the WR (min of that metric, all-time) used as Kinch denominator,
 *  - the current top-N production leaderboard (for diff/baseline),
 *  - each top-N candidate's in-window results (with format_id, dnf_count).
 *
 * The payload is shaped so `computeLeaderboard()` on the client can
 * recompute ratings from scratch — no extra DB round-trips needed during
 * sliders-and-knobs iteration.
 *
 * Pool size defaults to 50 and can go up to 200 via `?poolSize=`. Bigger
 * pools give better coverage when a custom config would promote
 * dark-horse competitors from deeper in the ranking, at the cost of
 * payload size (~7 KB / candidate uncompressed, well-compressed by gzip).
 *
 * Cached for 1 h at the route level and at the edge.
 */
export const revalidate = 3600;

const ALLOWED_METRICS = new Set<Metric>(['single', 'average']);
const ALLOWED_FORMATS: Set<FormatId> = new Set(['a', 'm', '3', '5', '2', '1']);

interface PoolQueryRow {
  wca_id: string;
  name: string;
  country_id: string;
  country_iso2: string | null;
  production_rating: number;
  production_rank: number;
  result_count: number;
  last_competed_at: string;
}

interface ResultQueryRow {
  competitor_id: string;
  competition_id: string;
  competition_date: string;
  round_type_id: string;
  format_id: string | null;
  is_final: boolean;
  position: number;
  value: number;
  regional_single_record: string | null;
  regional_average_record: string | null;
  dnf_count: number | null;
  is_championship: boolean;
  championship_scope: string | null;
}

interface EventMetaRow {
  id: string;
  name: string;
  format: 'time' | 'number' | 'multi';
  wr_single: number | null;
  wr_average: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event');
  const metricParam = searchParams.get('metric');
  const poolSizeRaw = Number(searchParams.get('poolSize') ?? '50');

  if (!eventId) return bad('missing ?event');
  if (!metricParam || !ALLOWED_METRICS.has(metricParam as Metric)) {
    return bad('invalid ?metric (expected single|average)');
  }
  const metric = metricParam as Metric;
  const poolSize = Math.max(10, Math.min(200, Number.isFinite(poolSizeRaw) ? poolSizeRaw : 50));

  // 1) Event metadata + per-metric all-time WR.
  //    `app.events.wr_single` / `wr_average` are populated by the derive
  //    stage (ingest/src/derive/transform.ts) from raw_wca.results, and
  //    are the same all-time minimums the ingest's rating pass uses as
  //    the Kinch denominator. Reading from here keeps the "web reads
  //    only from app.*/scr.*" invariant intact while still giving the
  //    sandbox the true all-time WR — historically this route computed
  //    min() over `app.official_results`, which is already windowed to
  //    the last 2 years per competitor, so the WR drifted upward when
  //    the record holder retired from the event (e.g. 4bld single).
  const eventMetaRows = (await sql()`
    SELECT e.id,
           e.name,
           e.format,
           e.wr_single,
           e.wr_average
      FROM app.events e
     WHERE e.id = ${eventId}
  `) as EventMetaRow[];
  const meta = eventMetaRows[0];
  if (!meta) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  const wr = metric === 'single' ? meta.wr_single : meta.wr_average;
  if (!wr || wr <= 0) {
    return NextResponse.json(
      { error: `no WR on record for ${eventId} ${metric}` },
      { status: 404 },
    );
  }

  // 2) Top-N competitors for this (event, metric) by current rank.
  const candidateRows = (await sql()`
    SELECT cr.competitor_id       AS wca_id,
           c.name,
           c.country_id,
           c.country_iso2,
           cr.rating::float8      AS production_rating,
           cr.rank                AS production_rank,
           cr.result_count,
           cr.last_competed_at::text AS last_competed_at
      FROM app.current_ratings cr
      JOIN app.competitors c ON c.wca_id = cr.competitor_id
     WHERE cr.event_id = ${eventId}
       AND cr.metric   = ${metric}
     ORDER BY cr.rank ASC, c.name ASC
     LIMIT ${poolSize}
  `) as PoolQueryRow[];

  if (candidateRows.length === 0) {
    return NextResponse.json(
      {
        event: { id: meta.id, name: meta.name, format: meta.format },
        metric,
        wr,
        today: new Date().toISOString().slice(0, 10),
        production: [],
        candidates: [],
      } satisfies CandidatePool,
    );
  }

  // 3) Fetch every relevant result in one query.
  //
  // Neon's tagged template interpolates values only (no identifier
  // interpolation helper like `sql.unsafe`), and the metric value lives
  // in one of two fixed columns — so we pick the column once up front
  // and branch on a tiny enum rather than building dynamic SQL. Both
  // branches are otherwise identical.
  const wcaIds = candidateRows.map((r) => r.wca_id);
  const resultRows = (metric === 'single'
    ? ((await sql()`
        SELECT competitor_id,
               competition_id,
               competition_date::text AS competition_date,
               round_type_id,
               format_id,
               is_final,
               position,
               best AS value,
               regional_single_record,
               regional_average_record,
               dnf_count,
               is_championship,
               championship_scope
          FROM app.official_results
         WHERE event_id = ${eventId}
           AND competitor_id = ANY(${wcaIds}::text[])
           AND best IS NOT NULL
           AND best > 0
         ORDER BY competition_date DESC
      `) as ResultQueryRow[])
    : ((await sql()`
        SELECT competitor_id,
               competition_id,
               competition_date::text AS competition_date,
               round_type_id,
               format_id,
               is_final,
               position,
               average AS value,
               regional_single_record,
               regional_average_record,
               dnf_count,
               is_championship,
               championship_scope
          FROM app.official_results
         WHERE event_id = ${eventId}
           AND competitor_id = ANY(${wcaIds}::text[])
           AND average IS NOT NULL
           AND average > 0
         ORDER BY competition_date DESC
      `) as ResultQueryRow[]));

  // 4) Reshape into CandidatePool.
  const byCompetitor = new Map<string, PoolResult[]>();
  for (const r of resultRows) {
    const list = byCompetitor.get(r.competitor_id) ?? [];
    list.push({
      competitionDate: r.competition_date,
      competitionId: r.competition_id,
      roundTypeId: r.round_type_id,
      formatId: (r.format_id && ALLOWED_FORMATS.has(r.format_id as FormatId)
        ? (r.format_id as FormatId)
        : 'unknown'),
      isFinal: r.is_final,
      position: r.position,
      value: Number(r.value),
      regionalSingleRecord: r.regional_single_record,
      regionalAverageRecord: r.regional_average_record,
      dnfCount: r.dnf_count ?? 0,
      isChampionship: r.is_championship,
      championshipScope: (r.championship_scope === 'world'
        || r.championship_scope === 'continental'
        || r.championship_scope === 'national')
        ? r.championship_scope
        : 'none',
    });
    byCompetitor.set(r.competitor_id, list);
  }

  const payload: CandidatePool = {
    event: { id: meta.id, name: meta.name, format: meta.format },
    metric,
    wr: Number(wr),
    today: new Date().toISOString().slice(0, 10),
    production: candidateRows.map((c) => ({
      wcaId: c.wca_id,
      name: c.name,
      countryId: c.country_id,
      countryIso2: c.country_iso2,
      rating: c.production_rating,
      rank: c.production_rank,
      resultCount: c.result_count,
      lastCompetedAt: c.last_competed_at,
    })),
    candidates: candidateRows.map((c) => ({
      wcaId: c.wca_id,
      name: c.name,
      countryId: c.country_id,
      countryIso2: c.country_iso2,
      results: byCompetitor.get(c.wca_id) ?? [],
    })),
  };

  return NextResponse.json(payload, {
    headers: {
      // Cache at the edge for an hour. Served from the site origin so no
      // CORS concerns; calibration traffic is low-volume so this is
      // plenty of headroom.
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200',
    },
  });
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
