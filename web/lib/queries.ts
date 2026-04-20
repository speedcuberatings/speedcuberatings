import { sql } from './db';

export type Metric = 'single' | 'average';

export interface Event {
  id: string;
  name: string;
  format: string;
  rank: number;
  rateable: boolean;
  has_single: boolean;
  has_average: boolean;
}

export interface LeaderboardRow {
  rank: number;
  wca_id: string;
  name: string;
  country_id: string;
  country_iso2: string | null;
  continent_name: string | null;
  rating: number;
  raw_rating: number;
  result_count: number;
  last_competed_at: string;
  last_competition_id: string | null;
  last_competition_name: string | null;
  last_competition_city: string | null;
  previous_rank: number | null;
  delta: number | null;
}

export interface CompetitorProfile {
  wca_id: string;
  name: string;
  country_id: string;
  country_iso2: string | null;
  gender: string | null;
}

export interface CompetitorEventRating {
  event_id: string;
  event_name: string;
  event_rank: number;
  metric: Metric;
  rating: number;
  raw_rating: number;
  rank: number;
  result_count: number;
  last_competed_at: string;
}

export interface CompetitorRecentResult {
  competition_id: string;
  event_id: string;
  event_name: string;
  competition_date: string;
  round_type_id: string;
  is_final: boolean;
  position: number;
  best: number;
  average: number;
  metric_value: number;
  championship_scope: string | null;
}

export interface RatingHistoryPoint {
  snapshot_date: string;
  rating: number;
  rank: number;
}

export interface Continent {
  id: string;
  name: string;
}

export interface Country {
  id: string;
  iso2: string | null;
  name: string;
  continent_id: string | null;
  continent_name: string | null;
}

/** Events list, enriched with which metrics exist per event. */
export async function getEvents(): Promise<Event[]> {
  const rows = (await sql()`
    SELECT e.id, e.name, e.format, e.rank, e.rateable,
           EXISTS (SELECT 1 FROM app.current_ratings r WHERE r.event_id = e.id AND r.metric='single')  AS has_single,
           EXISTS (SELECT 1 FROM app.current_ratings r WHERE r.event_id = e.id AND r.metric='average') AS has_average
    FROM app.events e
    ORDER BY e.rateable DESC, e.rank ASC
  `) as Event[];
  return rows;
}

export async function getEvent(id: string): Promise<Event | null> {
  const rows = (await sql()`
    SELECT e.id, e.name, e.format, e.rank, e.rateable,
           EXISTS (SELECT 1 FROM app.current_ratings r WHERE r.event_id = e.id AND r.metric='single')  AS has_single,
           EXISTS (SELECT 1 FROM app.current_ratings r WHERE r.event_id = e.id AND r.metric='average') AS has_average
    FROM app.events e WHERE e.id = ${id}
  `) as Event[];
  return rows[0] ?? null;
}

export function defaultMetricFor(event: Event): Metric {
  return event.has_average ? 'average' : 'single';
}

export interface LeaderboardOptions {
  metric: Metric;
  region?: string | null;   // country_id (e.g. 'United States') or continent_id (e.g. '_Europe') or null
  limit?: number;
}

export async function getLeaderboard(
  eventId: string,
  { metric, region = null, limit = 100 }: LeaderboardOptions,
): Promise<LeaderboardRow[]> {
  // region filter: null => all; '_Continent' => continent_id match; otherwise treat as country_id.
  const isContinent = region != null && region.startsWith('_');
  const rows = (await sql()`
    WITH prev AS (
      SELECT DISTINCT ON (competitor_id, event_id, metric)
             competitor_id, event_id, metric, rank
      FROM scr.rating_history
      WHERE event_id = ${eventId} AND metric = ${metric}
        AND snapshot_date < date_trunc('month', current_date)
      ORDER BY competitor_id, event_id, metric, snapshot_date DESC
    )
    SELECT cr.rank,
           cr.competitor_id AS wca_id,
           c.name,
           c.country_id,
           c.country_iso2,
           co.continent_name,
           cr.rating::float8 AS rating,
           cr.raw_rating::float8 AS raw_rating,
           cr.result_count,
           cr.last_competed_at,
           cr.last_competition_id,
           comp.name AS last_competition_name,
           comp.city AS last_competition_city,
           prev.rank AS previous_rank,
           CASE WHEN prev.rank IS NULL THEN NULL
                ELSE (prev.rank - cr.rank)::int
           END AS delta
      FROM app.current_ratings cr
      JOIN app.competitors c ON c.wca_id = cr.competitor_id
      LEFT JOIN app.countries co ON co.id = c.country_id
      LEFT JOIN app.competitions comp ON comp.id = cr.last_competition_id
      LEFT JOIN prev ON prev.competitor_id = cr.competitor_id
                    AND prev.event_id    = cr.event_id
                    AND prev.metric      = cr.metric
     WHERE cr.event_id = ${eventId}
       AND cr.metric = ${metric}
       AND (${region}::text IS NULL
            OR (${isContinent} AND co.continent_id = ${region})
            OR (NOT ${isContinent} AND c.country_id = ${region}))
     ORDER BY cr.rank ASC, c.name ASC
     LIMIT ${limit}
  `) as LeaderboardRow[];
  return rows;
}

export async function getLeaderboardSize(
  eventId: string,
  { metric, region = null }: { metric: Metric; region?: string | null },
): Promise<number> {
  const isContinent = region != null && region.startsWith('_');
  const rows = (await sql()`
    SELECT count(*)::int AS n
      FROM app.current_ratings cr
      JOIN app.competitors c ON c.wca_id = cr.competitor_id
      LEFT JOIN app.countries co ON co.id = c.country_id
     WHERE cr.event_id = ${eventId}
       AND cr.metric = ${metric}
       AND (${region}::text IS NULL
            OR (${isContinent} AND co.continent_id = ${region})
            OR (NOT ${isContinent} AND c.country_id = ${region}))
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function getContinents(): Promise<Continent[]> {
  const rows = (await sql()`
    SELECT id, name FROM app.continents
    WHERE name NOT IN ('Multiple Continents')
    ORDER BY name
  `) as Continent[];
  return rows;
}

export async function getCountries(): Promise<Country[]> {
  const rows = (await sql()`
    SELECT id, iso2, name, continent_id, continent_name
    FROM app.countries
    WHERE continent_id IS NOT NULL
    ORDER BY continent_name NULLS LAST, name
  `) as Country[];
  return rows;
}

export async function getCompetitor(wcaId: string): Promise<CompetitorProfile | null> {
  const rows = (await sql()`
    SELECT wca_id, name, country_id, country_iso2, gender
    FROM app.competitors WHERE wca_id = ${wcaId}
  `) as CompetitorProfile[];
  return rows[0] ?? null;
}

export async function getCompetitorRatings(wcaId: string): Promise<CompetitorEventRating[]> {
  const rows = (await sql()`
    SELECT cr.event_id,
           e.name AS event_name,
           e.rank AS event_rank,
           cr.metric,
           cr.rating::float8 AS rating,
           cr.raw_rating::float8 AS raw_rating,
           cr.rank,
           cr.result_count,
           cr.last_competed_at
      FROM app.current_ratings cr
      JOIN app.events e ON e.id = cr.event_id
     WHERE cr.competitor_id = ${wcaId}
     ORDER BY e.rank ASC, cr.metric ASC
  `) as CompetitorEventRating[];
  return rows;
}

export async function getCompetitorRecentResults(
  wcaId: string,
  limit: number = 20,
): Promise<CompetitorRecentResult[]> {
  const rows = (await sql()`
    SELECT r.competition_id,
           r.event_id,
           e.name AS event_name,
           r.competition_date,
           r.round_type_id,
           r.is_final,
           r.position,
           r.best,
           r.average,
           r.metric_value,
           r.championship_scope
      FROM app.official_results r
      JOIN app.events e ON e.id = r.event_id
     WHERE r.competitor_id = ${wcaId}
     ORDER BY r.competition_date DESC, r.event_id ASC
     LIMIT ${limit}
  `) as CompetitorRecentResult[];
  return rows;
}

export async function getRatingHistory(
  wcaId: string,
  eventId: string,
  metric: Metric,
): Promise<RatingHistoryPoint[]> {
  const rows = (await sql()`
    SELECT snapshot_date::text AS snapshot_date,
           rating::float8 AS rating,
           rank
      FROM scr.rating_history
     WHERE competitor_id = ${wcaId}
       AND event_id = ${eventId}
       AND metric = ${metric}
     ORDER BY snapshot_date ASC
  `) as RatingHistoryPoint[];
  return rows;
}

export async function getMetadata(): Promise<{
  lastExportDate: string | null;
  lastImportFinished: string | null;
}> {
  const rows = (await sql()`
    SELECT last_export_date::text AS "lastExportDate",
           last_import_finished::text AS "lastImportFinished"
      FROM scr._meta WHERE id = 1
  `) as { lastExportDate: string | null; lastImportFinished: string | null }[];
  return rows[0] ?? { lastExportDate: null, lastImportFinished: null };
}

/** Validate that a metric value is one of our known options. */
export function coerceMetric(value: unknown, fallback: Metric = 'average'): Metric {
  return value === 'single' || value === 'average' ? value : fallback;
}
