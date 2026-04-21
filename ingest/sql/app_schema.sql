-- App-facing derived schema, built as `app_staging` by the derive stage
-- (see ingest/src/derive/) and atomically renamed to `app` on success.
--
-- This file is idempotent-ish: the staging schema is always dropped and
-- recreated (so it starts clean on every run); everything in `scr` uses
-- IF NOT EXISTS so the long-lived tables there survive across runs.
DROP SCHEMA IF EXISTS app_staging CASCADE;
CREATE SCHEMA app_staging;

CREATE TABLE app_staging.events (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  format     text NOT NULL,     -- 'time' | 'number' | 'multi'
  rank       int  NOT NULL,
  rateable   boolean NOT NULL
);

CREATE TABLE app_staging.continents (
  id           text PRIMARY KEY,   -- e.g. '_Europe'
  name         text NOT NULL,      -- 'Europe'
  record_name  text                -- 'ER', 'AsR', etc; nullable
);

CREATE TABLE app_staging.countries (
  id              text PRIMARY KEY,   -- WCA country name, e.g. 'China'
  iso2            text,               -- may be null for historical/special codes
  name            text NOT NULL,
  continent_id    text REFERENCES app_staging.continents(id),
  continent_name  text
);

CREATE INDEX countries_continent_idx ON app_staging.countries (continent_id);

CREATE TABLE app_staging.competitors (
  wca_id       text PRIMARY KEY,
  name         text NOT NULL,
  country_id   text NOT NULL,  -- WCA country name, e.g. 'China'
  country_iso2 text,            -- ISO 3166-1 alpha-2, nullable for non-ISO regions
  gender       text
);

CREATE INDEX competitors_country_idx ON app_staging.competitors (country_id);

-- Competitions, restricted to the last N years (matches the results window).
-- Stored so the web app can render "last at <Competition>" without touching
-- raw_wca.
CREATE TABLE app_staging.competitions (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  city        text,
  country_id  text,
  start_date  date,
  end_date    date
);

CREATE INDEX competitions_end_date_idx ON app_staging.competitions (end_date DESC);

-- Flattened, typed view of official WCA results from the last N years.
-- Enriched with competition date and championship scope for easy consumption
-- by the rating pipeline.
--
-- `format_id` and `dnf_count` were added for the calibration sandbox
-- (see web/app/calibrate/) so the client-side rating engine can filter /
-- penalise by round format (Ao5 / Mo3 / Bo3 / Bo1) and by attempt
-- reliability. Safe to ignore from the production rating path — it still
-- only reads best / average.
CREATE TABLE app_staging.official_results (
  result_id              bigint PRIMARY KEY,
  competitor_id          text   NOT NULL,
  competition_id         text   NOT NULL,
  event_id               text   NOT NULL,
  round_type_id          text   NOT NULL,
  format_id              text,              -- WCA format: 'a' (Ao5), 'm' (Mo3), '3' (Bo3), '2' (Bo2), '1' (Bo1), '5' (Bo5)
  is_final               boolean NOT NULL,
  best                   int,
  average                int,
  metric_value           int,               -- average if > 0 else best; kept for backward-compat
  position               int,
  regional_single_record text,
  regional_average_record text,
  dnf_count              smallint,          -- count of DNF/DNS attempts across value1..value5 (0-5)
  competition_date       date   NOT NULL,
  is_championship        boolean NOT NULL,
  championship_scope     text
);

CREATE INDEX official_results_event_date_idx
  ON app_staging.official_results (event_id, competition_date DESC);
CREATE INDEX official_results_competitor_event_idx
  ON app_staging.official_results (competitor_id, event_id);

-- One row per (competitor, event, metric). `metric` is 'single' or 'average'.
-- Most events have both; some (multi, FMC-single context) only one.
CREATE TABLE app_staging.current_ratings (
  competitor_id         text NOT NULL,
  event_id              text NOT NULL,
  metric                text NOT NULL,   -- 'single' | 'average'
  rating                numeric(6,2) NOT NULL,
  raw_rating            numeric(6,2) NOT NULL,
  result_count          int NOT NULL,
  last_competed_at      date NOT NULL,
  last_competition_id   text,            -- references app_staging.competitions(id); nullable
  rank                  int,
  PRIMARY KEY (competitor_id, event_id, metric),
  CHECK (metric IN ('single','average'))
);

CREATE INDEX current_ratings_event_metric_rank_idx
  ON app_staging.current_ratings (event_id, metric, rank);
CREATE INDEX current_ratings_country_join_idx
  ON app_staging.current_ratings (competitor_id);

-- Tracks when we last wrote a monthly snapshot, so repeat runs within the
-- same month don't produce duplicate history rows.
CREATE TABLE IF NOT EXISTS scr.rating_snapshot_state (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_snapshot_month  date
);
INSERT INTO scr.rating_snapshot_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Rating history lives in the `scr` schema (not `app`) so it survives the
-- atomic swap of `app_staging` -> `app`. Managed by snapshot.ts.
--
-- Schema evolution: we added a `metric` column mid-April 2026. Older rows
-- (pre-change) are all 'average' since that was the only metric computed.
-- The DO block below is a one-shot backfill that runs idempotently.
CREATE TABLE IF NOT EXISTS scr.rating_history (
  snapshot_date  date NOT NULL,
  competitor_id  text NOT NULL,
  event_id       text NOT NULL,
  rating         numeric(6,2) NOT NULL,
  rank           int,
  PRIMARY KEY (snapshot_date, competitor_id, event_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'scr' AND table_name = 'rating_history'
       AND column_name = 'metric'
  ) THEN
    ALTER TABLE scr.rating_history ADD COLUMN metric text;
    -- Backfill existing rows. Pre-schema-change runs computed 'average' for
    -- every event where it made sense, 'single' for BLD events / FMC / multi.
    UPDATE scr.rating_history
       SET metric = CASE
         WHEN event_id IN ('333bf','444bf','555bf','333mbf','333fm') THEN 'single'
         ELSE 'average'
       END
     WHERE metric IS NULL;
    ALTER TABLE scr.rating_history ALTER COLUMN metric SET NOT NULL;
    ALTER TABLE scr.rating_history
      ADD CONSTRAINT rating_history_metric_chk CHECK (metric IN ('single','average'));
    -- Rewrite PK to include metric.
    ALTER TABLE scr.rating_history DROP CONSTRAINT rating_history_pkey;
    ALTER TABLE scr.rating_history
      ADD CONSTRAINT rating_history_pkey
      PRIMARY KEY (snapshot_date, competitor_id, event_id, metric);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rating_history_event_metric_date_idx
  ON scr.rating_history (event_id, metric, snapshot_date DESC);
