-- Tracks the state of the most recent successful ingest.
-- Lives outside the raw_wca schema so it survives the atomic swap.
CREATE SCHEMA IF NOT EXISTS scr;

CREATE TABLE IF NOT EXISTS scr._meta (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_export_date      timestamptz,
  last_export_version   text,
  last_import_started   timestamptz,
  last_import_finished  timestamptz,
  last_tsv_url          text,
  last_row_counts       jsonb
);

INSERT INTO scr._meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
