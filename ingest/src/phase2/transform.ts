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
 * - `official_results`: last 2 years of competition results, joined with
 *   `competitions` for the date and with `championships` for the scope,
 *   with types cast from text and invalid values (DNF=-1, DNS=-2, 0=no
 *   result) filtered out.
 */
export async function transform(): Promise<{
  events: number;
  competitors: number;
  results: number;
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

    await client.query(`
      INSERT INTO app_staging.competitors (wca_id, name, country_id, gender)
      SELECT wca_id, name, country_id, NULLIF(gender, '')
      FROM raw_wca.persons
      WHERE sub_id = '1'
    `);

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

    await client.query(`
      CREATE TEMP TABLE comp_date AS
      SELECT id AS competition_id,
             make_date(
               coalesce(NULLIF(end_year, ''), year)::int,
               coalesce(NULLIF(end_month, ''), month)::int,
               coalesce(NULLIF(end_day, ''), day)::int
             ) AS competition_date
      FROM raw_wca.competitions
    `);

    const cutoff = `current_date - INTERVAL '${RESULTS_WINDOW_YEARS} years'`;

    await client.query(`
      INSERT INTO app_staging.official_results (
        result_id, competitor_id, competition_id, event_id, round_type_id,
        is_final, best, average, metric_value, position,
        regional_single_record, regional_average_record,
        competition_date, is_championship, championship_scope
      )
      SELECT r.id::bigint,
             r.person_id,
             r.competition_id,
             r.event_id,
             r.round_type_id,
             rt.final = '1' AS is_final,
             r.best::int,
             r.average::int,
             CASE WHEN r.average::int > 0 THEN r.average::int ELSE r.best::int END AS metric_value,
             r.pos::int,
             NULLIF(NULLIF(r.regional_single_record, ''), 'NULL'),
             NULLIF(NULLIF(r.regional_average_record, ''), 'NULL'),
             cd.competition_date,
             cc.scope_rank IS NOT NULL AS is_championship,
             CASE cc.scope_rank WHEN 3 THEN 'world' WHEN 2 THEN 'continental' WHEN 1 THEN 'national' END
      FROM raw_wca.results r
      JOIN comp_date cd ON cd.competition_id = r.competition_id
      JOIN raw_wca.round_types rt ON rt.id = r.round_type_id
      LEFT JOIN comp_championship cc ON cc.competition_id = r.competition_id
      WHERE cd.competition_date >= ${cutoff}
        AND r.best::int > 0
    `);

    await client.query(`DROP TABLE comp_championship`);
    await client.query(`DROP TABLE comp_date`);

    const counts = await client.query<{ t: string; n: string }>(`
      SELECT 'events' AS t, count(*)::text AS n FROM app_staging.events
      UNION ALL SELECT 'competitors', count(*)::text FROM app_staging.competitors
      UNION ALL SELECT 'results',     count(*)::text FROM app_staging.official_results
    `);
    const by = Object.fromEntries(counts.rows.map((r) => [r.t, Number(r.n)]));
    log.info('phase2: transform complete', by);
    return by as { events: number; competitors: number; results: number };
  } finally {
    await client.end();
  }
}
