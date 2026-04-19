-- App-facing derived schema, built as `app_staging` by the Phase 2 pipeline
-- and atomically renamed to `app` on success.
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

CREATE TABLE app_staging.competitors (
  wca_id     text PRIMARY KEY,
  name       text NOT NULL,
  country_id text NOT NULL,
  gender     text
);

-- Flattened, typed view of official WCA results from the last N years.
-- Enriched with competition date and championship scope for easy consumption
-- by the rating pipeline.
CREATE TABLE app_staging.official_results (
  result_id              bigint PRIMARY KEY,
  competitor_id          text   NOT NULL,
  competition_id         text   NOT NULL,
  event_id               text   NOT NULL,
  round_type_id          text   NOT NULL,
  is_final               boolean NOT NULL,
  best                   int,
  average                int,
  metric_value           int,               -- average if > 0 else best; units depend on event format
  position               int,
  regional_single_record text,              -- WR | NR | continental code | NULL
  regional_average_record text,
  competition_date       date   NOT NULL,
  is_championship        boolean NOT NULL,
  championship_scope     text               -- 'world' | 'continental' | 'national' | NULL
);

CREATE INDEX official_results_event_date_idx
  ON app_staging.official_results (event_id, competition_date DESC);
CREATE INDEX official_results_competitor_event_idx
  ON app_staging.official_results (competitor_id, event_id);

CREATE TABLE app_staging.current_ratings (
  competitor_id     text NOT NULL,
  event_id          text NOT NULL,
  rating            numeric(6,2) NOT NULL,
  raw_rating        numeric(6,2) NOT NULL,  -- pre-inactivity-decay
  result_count      int NOT NULL,
  last_competed_at  date NOT NULL,
  rank              int,
  PRIMARY KEY (competitor_id, event_id)
);

CREATE INDEX current_ratings_event_rank_idx
  ON app_staging.current_ratings (event_id, rank);

-- Tracks when we last wrote a monthly snapshot, so repeat runs within the
-- same month don't produce duplicate history rows.
CREATE TABLE IF NOT EXISTS scr.rating_snapshot_state (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_snapshot_month  date
);
INSERT INTO scr.rating_snapshot_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Rating history lives in the `scr` schema (not `app`) so it survives the
-- atomic swap of `app_staging` -> `app`. Managed by snapshot.ts.
CREATE TABLE IF NOT EXISTS scr.rating_history (
  snapshot_date  date NOT NULL,
  competitor_id  text NOT NULL,
  event_id       text NOT NULL,
  rating         numeric(6,2) NOT NULL,
  rank           int,
  PRIMARY KEY (snapshot_date, competitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS rating_history_event_date_idx
  ON scr.rating_history (event_id, snapshot_date DESC);
