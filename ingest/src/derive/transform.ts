import { makeClient } from '../db.ts';
import { log } from '../log.ts';

/**
 * Currently-active WCA events for which we compute ratings. Discontinued
 * events (333ft, magic, mmagic, 333mbo) are still loaded into `app.events`
 * but flagged `rateable = false` and skipped by the rating pipeline.
 */
export const RATEABLE_EVENTS = [
  '333', '222', '444', '555', '666', '777',
  '333bf', '444bf', '555bf', '333mbf',
  '333oh', '333fm',
  'clock', 'minx', 'pyram', 'skewb', 'sq1',
] as const;

export const RESULTS_WINDOW_YEARS = 2;

/**
 * Populate the derived tables in `app_staging` from `raw_wca`.
 *
 * - `events`: 1:1 with raw_wca.events, plus a `rateable` flag.
 * - `competitors`: 1:1 with raw_wca.persons (sub_id = 1 is the canonical row).
 * - `competitions`: all competitions (unfiltered; ~27k rows).
 * - `official_results`: per (competitor, event), the last N years of results
 *   anchored on that competitor's most recent competition in the event.
 *   Competitors whose most recent round in the event is older than N years
 *   from today are excluded entirely — the rating model treats them as
 *   having dropped out. Per James Macdiarmid (rating spec author), results
 *   should only "roll off the back" when the competitor enters new results.
 *   Invalid values (DNF=-1, DNS=-2, 0=no result) are filtered out; see
 *   DNF handling note in README / TODOs.
 */
export async function transform(): Promise<{
  events: number;
  competitors: number;
  results: number;
  countries: number;
  competitions: number;
}> {
  const client = await makeClient();
  try {
    const rateableList = RATEABLE_EVENTS.map((e) => `'${e}'`).join(',');

    await client.query(`
      INSERT INTO app_staging.events (id, name, format, rank, rateable)
      SELECT id, name, format, rank::int,
             id IN (${rateableList}) AS rateable
      FROM raw_wca.events
    `);

    // Populate per-event all-time world records from raw_wca.results.
    // These are the canonical Kinch denominators for the rating model —
    // the same all-time minimums the ingest's rating pass uses and the
    // calibration sandbox's pool endpoint serves. Reading from this one
    // source means the "web only reads from app.*/scr.*" invariant holds
    // while still giving the sandbox the true all-time WR (rather than
    // the windowed min of `app.official_results`, which drifts when the
    // WR holder hasn't competed in the last 2 years — see 4bld).
    await client.query(`
      WITH wr AS (
        SELECT event_id,
               MIN(best::int)    FILTER (WHERE best::int > 0)    AS wr_single,
               MIN(average::int) FILTER (WHERE average::int > 0) AS wr_average
          FROM raw_wca.results
         GROUP BY event_id
      )
      UPDATE app_staging.events e
         SET wr_single  = wr.wr_single,
             wr_average = wr.wr_average
        FROM wr
       WHERE wr.event_id = e.id
    `);

    await client.query(`
      INSERT INTO app_staging.continents (id, name, record_name)
      SELECT id, name, NULLIF(record_name, '')
      FROM raw_wca.continents
    `);

    // Countries: map WCA's country id (usually the English name) to its
    // continent and an ISO2 code. `raw_wca.countries` is the source.
    await client.query(`
      INSERT INTO app_staging.countries (id, iso2, name, continent_id, continent_name)
      SELECT c.id,
             NULLIF(c.iso2, '')       AS iso2,
             c.name,
             c.continent_id,
             cont.name                AS continent_name
      FROM raw_wca.countries c
      LEFT JOIN raw_wca.continents cont ON cont.id = c.continent_id
    `);

    await client.query(`
      INSERT INTO app_staging.competitors (wca_id, name, country_id, country_iso2, gender)
      SELECT p.wca_id,
             p.name,
             p.country_id,
             NULLIF(co.iso2, '') AS country_iso2,
             NULLIF(p.gender, '')
      FROM raw_wca.persons p
      LEFT JOIN raw_wca.countries co ON co.id = p.country_id
      WHERE p.sub_id = '1'
    `);

    // Competition metadata for the last N years. We rely on the same
    // comp_date temp table built below for the date filter, so populate
    // that first.
    await client.query(`DROP TABLE IF EXISTS comp_date`);
    await client.query(`
      CREATE TEMP TABLE comp_date AS
      SELECT id AS competition_id,
             make_date(
               coalesce(NULLIF(year, ''), '1970')::int,
               coalesce(NULLIF(month, ''), '1')::int,
               coalesce(NULLIF(day, ''), '1')::int
             ) AS start_date,
             make_date(
               coalesce(NULLIF(end_year, ''), year)::int,
               coalesce(NULLIF(end_month, ''), month)::int,
               coalesce(NULLIF(end_day, ''), day)::int
             ) AS end_date
      FROM raw_wca.competitions
    `);

    const cutoff = `current_date - INTERVAL '${RESULTS_WINDOW_YEARS} years'`;

    await client.query(`
      INSERT INTO app_staging.competitions (id, name, city, country_id, start_date, end_date)
      SELECT c.id, c.name, NULLIF(c.city_name, ''), c.country_id, cd.start_date, cd.end_date
        FROM raw_wca.competitions c
        JOIN comp_date cd ON cd.competition_id = c.id
    `);

    // Build a competition -> championship_scope map. A single competition can
    // hold multiple championship types (e.g. Euro + a national); we pick the
    // highest-ranking scope.
    //
    // Neon's pooler can reuse backends between sessions, so temp tables from
    // prior runs occasionally linger. Drop first to be safe.
    await client.query(`DROP TABLE IF EXISTS comp_championship`);
    await client.query(`
      CREATE TEMP TABLE comp_championship AS
      SELECT competition_id,
             MAX(CASE
               WHEN championship_type = 'world' THEN 3
               WHEN championship_type LIKE '\\_%' THEN 2
               WHEN championship_type = 'greater_china' THEN 2
               ELSE 1
             END) AS scope_rank
      FROM raw_wca.championships
      GROUP BY competition_id
    `);

    // Per-(competitor, event) most-recent competition date — the anchor
    // for the rolling window. Computed once so we can both (a) exclude
    // competitors whose last round in the event is older than the cutoff
    // and (b) keep all of their results within N years of that anchor.
    await client.query(`DROP TABLE IF EXISTS last_competed_per_event`);
    await client.query(`
      CREATE TEMP TABLE last_competed_per_event AS
      SELECT r.person_id,
             r.event_id,
             MAX(cd.end_date) AS last_date
        FROM raw_wca.results r
        JOIN comp_date cd ON cd.competition_id = r.competition_id
       WHERE r.best::int > 0
       GROUP BY r.person_id, r.event_id
      HAVING MAX(cd.end_date) >= ${cutoff}
    `);
    await client.query(
      `CREATE INDEX ON last_competed_per_event (person_id, event_id)`,
    );

    // `format_id` and `dnf_count` feed the calibration sandbox on the web
    // side. The production rating path ignores them; `best`/`average`
    // drive the main pipeline as before.
    //
    // We include **all** rounds in the 2-year window here, not just the
    // ones with a positive `best`. All-DNF rounds (`best = -1`) carry
    // essential DNF-rate signal for blind / FMC / multi events — without
    // them, a competitor who fails every BLD round in the window looks
    // identical to one with zero attempts. The prod rating query in
    // ratings.ts filters `${col} > 0` itself, so these rows don't reach
    // rating math; they only feed DNF accounting and profile display
    // (see getCompetitorRecentResults, which preserves old behaviour by
    // filtering best>0 at the query level).
    //
    // `dnf_count` note: the WCA TSV export doesn't include per-attempt
    // values (value1..value5) — those live in the `result_attempts`
    // table, which we intentionally skip (see INCLUDED_TABLES in
    // wca/import.ts). So we can only derive a lower bound from the
    // aggregate fields. The 3-state signal WCA gives us per round is:
    //
    //   best > 0 AND average  > 0  → 0 DNFs (all attempts valid)
    //   best > 0 AND average = -1  → ≥1 DNF (exact count unknown)
    //   best = -1                  → all attempts DNF
    //
    // We flatten that into an integer using per-format conventions:
    //   Ao5 ('a'): avg=-1 ⇒ ≥2 DNFs (1 DNF is trimmed, middle-3 mean
    //              stays valid), so record 2; all-DNF ⇒ 5.
    //   Mo3/Bo3/Bo5 ('m','3','5'): avg=-1 ⇒ ≥1 DNF (any DNF taints the
    //              mean); all-DNF ⇒ N (3/3/5).
    //   Bo1/Bo2 ('1','2'): no average column, so the only signal is
    //              best: DNF ⇒ 1 or 2 respectively.
    // Rounds where best > 0 and average > 0 could still have had one
    // DNF hidden by Ao5 trimming; we can't see it. Re-include
    // `result_attempts` if we need exact counts.
    await client.query(`
      INSERT INTO app_staging.official_results (
        result_id, competitor_id, competition_id, event_id, round_type_id,
        format_id, is_final, best, average, metric_value, position,
        regional_single_record, regional_average_record,
        dnf_count,
        competition_date, is_championship, championship_scope
      )
      SELECT r.id::bigint,
             r.person_id,
             r.competition_id,
             r.event_id,
             r.round_type_id,
             NULLIF(r.format_id, '') AS format_id,
             rt.final = '1' AS is_final,
             r.best::int,
             r.average::int,
             CASE WHEN r.average::int > 0 THEN r.average::int ELSE r.best::int END AS metric_value,
             r.pos::int,
             NULLIF(NULLIF(r.regional_single_record, ''), 'NULL'),
             NULLIF(NULLIF(r.regional_average_record, ''), 'NULL'),
             (CASE
                WHEN r.best::int = -1 THEN
                  CASE NULLIF(r.format_id, '')
                    WHEN 'a' THEN 5
                    WHEN 'm' THEN 3
                    WHEN '5' THEN 5
                    WHEN '3' THEN 3
                    WHEN '2' THEN 2
                    WHEN '1' THEN 1
                    ELSE 1
                  END
                WHEN r.average::int = -1 THEN
                  CASE NULLIF(r.format_id, '')
                    WHEN 'a' THEN 2
                    WHEN 'm' THEN 1
                    WHEN '5' THEN 1
                    WHEN '3' THEN 1
                    ELSE 0
                  END
                ELSE 0
              END)::smallint AS dnf_count,
             cd.end_date AS competition_date,
             cc.scope_rank IS NOT NULL AS is_championship,
             CASE cc.scope_rank WHEN 3 THEN 'world' WHEN 2 THEN 'continental' WHEN 1 THEN 'national' END
      FROM raw_wca.results r
      JOIN comp_date cd ON cd.competition_id = r.competition_id
      JOIN raw_wca.round_types rt ON rt.id = r.round_type_id
      JOIN last_competed_per_event lce
           ON lce.person_id = r.person_id AND lce.event_id = r.event_id
      LEFT JOIN comp_championship cc ON cc.competition_id = r.competition_id
      WHERE cd.end_date >= lce.last_date - INTERVAL '${RESULTS_WINDOW_YEARS} years'
    `);

    await client.query(`DROP TABLE last_competed_per_event`);

    await client.query(`DROP TABLE comp_championship`);
    await client.query(`DROP TABLE comp_date`);

    const counts = await client.query<{ t: string; n: string }>(`
      SELECT 'events' AS t, count(*)::text AS n FROM app_staging.events
      UNION ALL SELECT 'competitors',  count(*)::text FROM app_staging.competitors
      UNION ALL SELECT 'competitions', count(*)::text FROM app_staging.competitions
      UNION ALL SELECT 'countries',    count(*)::text FROM app_staging.countries
      UNION ALL SELECT 'results',      count(*)::text FROM app_staging.official_results
    `);
    const by = Object.fromEntries(counts.rows.map((r) => [r.t, Number(r.n)]));
    log.info('derive: transform complete', by);
    return by as {
      events: number;
      competitors: number;
      results: number;
      countries: number;
      competitions: number;
    };
  } finally {
    await client.end();
  }
}
