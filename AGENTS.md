# AGENTS.md

Notes for future agents (and humans) working on this repo.

## Project overview

Public speedcubing performance-rating site built on top of the official [WCA results export](https://www.worldcubeassociation.org/export/results). See `README.md` for architecture and `docs/Rubik's Cube Ranking_Ratings.txt` for the rating model.

## Phases

1. **Phase 1 — Ingest** (current): hourly-synced mirror of WCA export → Neon Postgres `raw_wca` schema.
2. **Phase 2 — Rating pipeline**: compute derived tables (`current_ratings`, `rating_history`) from `raw_wca`.
3. **Phase 3 — Public site**: Next.js UI reading the derived tables.

**Important invariant:** the `web/` app must only query derived tables, never `raw_wca.*`. This lets us absorb WCA schema changes in one place (the rating pipeline) without breaking the site.

## Tech stack

- Node 20, pnpm 9 workspaces
- TypeScript everywhere (`"type": "module"` in `ingest`)
- `pg` + `pg-copy-streams` for Postgres
- `unzipper` for the export zip
- Next.js (App Router) for the web app
- Neon (managed Postgres) for serving DB
- GitHub Actions for scheduled ingest

## Key commands

```sh
# Install
pnpm install

# Ingest: check only (no download)
pnpm --filter @scr/ingest run check

# Ingest: full (requires DATABASE_URL)
pnpm --filter @scr/ingest run ingest

# Ingest: force re-import regardless of export_date
FORCE_INGEST=1 pnpm --filter @scr/ingest run ingest

# Web dev
pnpm --filter @scr/web run dev
```

## Secrets / env vars

- `DATABASE_URL` — Neon Postgres connection string (`sslmode=require`). Required for all ingest commands and the web app.
- GitHub repo secret: `DATABASE_URL` — used by `.github/workflows/ingest.yml`.

## Schema conventions

- `raw_wca.*` — 1:1 mirror of WCA TSV tables. All columns are `text`. Table/column names are whatever the TSV header says (snake_case in V2).
- `scr._meta` — single-row ingest state. Persists across schema swaps.
- Future: `app.*` or top-level schema for derived tables.

## Ingest design notes

- **Dynamic schema**: tables in `raw_wca` are created at ingest time from each TSV's header row. This is deliberately resilient to WCA schema changes within a major version.
- **Atomic swap**: fresh data lands in `wca_staging`, then `ALTER SCHEMA ... RENAME` atomically promotes it to `raw_wca`, with the previous generation retained as `raw_wca_prev` for one cycle.
- **Major-version guard**: if WCA bumps the major part of `export_format_version`, ingest halts with exit code 2 instead of auto-proceeding. Requires a manual review.
- **Sanity checks**: post-import, row counts for core tables (`persons`, `competitions`, `results`, `events`, `countries`) are validated against minimum thresholds; ingest aborts before swap if they fail.

## Verification checklist (Phase 1)

- [ ] `pnpm install` succeeds at repo root.
- [ ] `pnpm --filter @scr/ingest run check` returns JSON with `fresh: true` on a new Neon branch.
- [ ] Full ingest completes end-to-end against a Neon dev branch.
- [ ] Row counts roughly match WCA's published figures (see https://www.worldcubeassociation.org/results/misc/stats).
- [ ] Re-running without `FORCE_INGEST` skips cleanly (no download, no rewrite).
- [ ] `FORCE_INGEST=1` re-runs end-to-end and swap is transparent to concurrent readers.
- [ ] Scheduled GitHub Action fires hourly in a test branch.

## Things to watch out for

- The TSV zip is ~336 MB and decompresses to several GB. Neon free tier's 0.5 GB will not fit once indexes are added; plan for the Launch tier before going live.
- The `scr._meta.last_export_date` comparison is a `timestamptz > timestamptz` check; ensure we keep it that way if rewriting.
- `COPY ... FORMAT text` is used (not CSV). WCA TSVs don't quote fields and use `|` to replace newlines within `333mbf` scrambles. If WCA changes this convention we may need to adjust.
- Do **not** add app-level queries against `raw_wca.*`. If you need data in the web app, add it to the derived-schema plan first.

## Open follow-ups

- GitHub repo / remote not yet configured.
- Neon account / project not yet configured.
- Alerting on ingest failure beyond default GH Actions email (Slack/Discord webhook TBD).
- Phase 2 & 3 designs not yet detailed.
