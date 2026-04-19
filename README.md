# speedcuberatings

A public, always-up-to-date performance-rating leaderboard for the speedcubing community, built on top of the official WCA results export.

See `docs/Rubik's Cube Ranking_Ratings.txt` for the rating model spec.

## Status

**Phase 1 — WCA ingest (in progress).** Hourly-synced mirror of the WCA results export into Neon Postgres under a `raw_wca` schema.

Later phases:
- **Phase 2** — Rating pipeline: transform raw WCA data into derived tables (`current_ratings`, `rating_history`).
- **Phase 3** — Public site: Next.js on Cloudflare Pages serving leaderboards, competitor pages, charts.

## Architecture

```
GitHub Actions (hourly cron)
  └─ check WCA API → if export_date changed:
       download TSV zip → unzip → COPY into `wca_staging` → atomic rename to `raw_wca`
                             │
                             ▼
                    Neon Postgres
                     ├─ raw_wca.*   (1:1 mirror, all-TEXT columns)
                     ├─ scr._meta   (ingest state + row counts)
                     └─ (future) derived tables
```

Why all-TEXT in `raw_wca`? The mirror is resilient to WCA adding/removing/renaming columns between export versions. Typed casting happens in the derived layer.

## Repo layout

- `ingest/` — TypeScript ingest scripts (run from GitHub Actions)
- `web/`    — Next.js app (placeholder until Phase 3)
- `docs/`   — rating spec + reference screenshots

## Setup

### Prerequisites

- Node 20+, pnpm 9+
- A Neon project with a Postgres database. Grab the connection string from the Neon console (use `sslmode=require`).

### Install

```sh
pnpm install
```

### Configure

Create `.env` at the repo root (or export in your shell):

```sh
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
```

### Run ingest locally

```sh
# Just check if there's a new export; does not download.
pnpm --filter @scr/ingest run check

# Full ingest (downloads ~336MB, imports to Neon).
DATABASE_URL=... pnpm --filter @scr/ingest run ingest

# Force re-import even if export_date hasn't changed.
FORCE_INGEST=1 DATABASE_URL=... pnpm --filter @scr/ingest run ingest
```

### Run web locally

```sh
pnpm --filter @scr/web run dev
```

## Deployment

- **Ingest**: GitHub Actions workflow at `.github/workflows/ingest.yml`. Requires repo secret `DATABASE_URL`. Fires hourly and on manual dispatch.
- **Web**: (Phase 3) Cloudflare Pages.

## Data source

[WCA Results Export](https://www.worldcubeassociation.org/export/results) — poll endpoint: `https://www.worldcubeassociation.org/api/v0/export/public`.

> This information is based on competition results owned and maintained by the World Cube Association, published at https://worldcubeassociation.org/results.
