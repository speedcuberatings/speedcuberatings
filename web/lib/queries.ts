import { sql } from './db';

export interface Event {
  id: string;
  name: string;
  format: string;
  rank: number;
  rateable: boolean;
}

export interface LeaderboardRow {
  rank: number;
  wca_id: string;
  name: string;
  country_id: string;
  country_iso2: string | null;
  rating: number;
  raw_rating: number;
  result_count: number;
  last_competed_at: string;
  previous_rank: number | null;
  delta: number | null; // previous_rank - rank (positive = climbed)
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

/** All events, rateable first then discontinued, ordered by WCA rank. */
export async function getEvents(): Promise<Event[]> {
  const rows = (await sql()`
    SELECT id, name, format, rank, rateable
    FROM app.events
    ORDER BY rateable DESC, rank ASC
  `) as Event[];
  return rows;
}

export async function getEvent(id: string): Promise<Event | null> {
  const rows = (await sql()`
    SELECT id, name, format, rank, rateable
    FROM app.events WHERE id = ${id}
  `) as Event[];
  return rows[0] ?? null;
}

/**
 * Top-N leaderboard for a given event, joined with latest history snapshot
 * for month-over-month delta. `previous_rank` will be null for competitors
 * not present in the prior snapshot.
 */
export async function getLeaderboard(
  eventId: string,
  limit: number = 100,
): Promise<LeaderboardRow[]> {
  const rows = (await sql()`
    WITH prev AS (
      SELECT DISTINCT ON (competitor_id, event_id)
             competitor_id, event_id, rank
      FROM scr.rating_history
      WHERE event_id = ${eventId}
        AND snapshot_date < date_trunc('month', current_date)
      ORDER BY competitor_id, event_id, snapshot_date DESC
    )
    SELECT cr.rank,
           cr.competitor_id AS wca_id,
           c.name,
           c.country_id,
           c.country_iso2,
           cr.rating::float8 AS rating,
           cr.raw_rating::float8 AS raw_rating,
           cr.result_count,
           cr.last_competed_at,
           prev.rank AS previous_rank,
           CASE WHEN prev.rank IS NULL THEN NULL
                ELSE (prev.rank - cr.rank)::int
           END AS delta
      FROM app.current_ratings cr
      JOIN app.competitors c ON c.wca_id = cr.competitor_id
      LEFT JOIN prev ON prev.competitor_id = cr.competitor_id
                    AND prev.event_id    = cr.event_id
     WHERE cr.event_id = ${eventId}
     ORDER BY cr.rank ASC, c.name ASC
     LIMIT ${limit}
  `) as LeaderboardRow[];
  return rows;
}

export async function getLeaderboardSize(eventId: string): Promise<number> {
  const rows = (await sql()`
    SELECT count(*)::int AS n FROM app.current_ratings WHERE event_id = ${eventId}
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
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
           cr.rating::float8 AS rating,
           cr.raw_rating::float8 AS raw_rating,
           cr.rank,
           cr.result_count,
           cr.last_competed_at
      FROM app.current_ratings cr
      JOIN app.events e ON e.id = cr.event_id
     WHERE cr.competitor_id = ${wcaId}
     ORDER BY cr.rating DESC
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
): Promise<RatingHistoryPoint[]> {
  const rows = (await sql()`
    SELECT snapshot_date::text AS snapshot_date,
           rating::float8 AS rating,
           rank
      FROM scr.rating_history
     WHERE competitor_id = ${wcaId} AND event_id = ${eventId}
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
