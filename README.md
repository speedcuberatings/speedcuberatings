# speedcuberatings

[![Ingest](https://github.com/speedcuberatings/speedcuberatings/actions/workflows/ingest.yml/badge.svg)](https://github.com/speedcuberatings/speedcuberatings/actions/workflows/ingest.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A public, always-up-to-date performance-rating leaderboard for the speedcubing community, built on top of the official [WCA results export](https://www.worldcubeassociation.org/export/results).

The rating model is by **James Macdiarmid**, proposed in his video [_Our ranking system is broken. Let's fix it!_](https://www.youtube.com/watch?v=2lU-d6OUU3Q). This project implements his spec.

## What this repo does

- A cron job hourly-polls the WCA results export, imports any new release into Neon Postgres, and recomputes performance ratings per (competitor, event, metric).
- A Next.js site reads the derived tables and renders per-event leaderboards, competitor profiles with rating history, and shareable social-card images.

## Architecture

```
GitHub Actions  ──── hourly cron
      │
      ├── poll WCA API → if new export:
      │      download TSV zip → COPY into wca_staging → atomic rename → raw_wca
      │
      └── rebuild derived schema:
             raw_wca → app_staging.{events,competitors,continents,countries,
                                     competitions,official_results,current_ratings}
             → atomic rename → app
                      ▲
                      │
             (history snapshot to scr.rating_history once per month)

Neon Postgres
  raw_wca.*   — untyped mirror of the WCA export
  app.*       — typed, app-facing derived tables
  scr.*       — long-lived metadata (ingest state, rating_history)

Next.js (web/)
  reads app.* and scr.rating_history only
```

The separation between `raw_wca` and `app` is deliberate: the web app never queries the raw WCA schema, so upstream format changes are absorbed in one place (the rating pipeline) without breaking the UI.

## Repo layout

```
ingest/        TypeScript ingest pipeline (WCA export → Neon)
  sql/         SQL schema for scr.* and app_staging.*
  src/
    wca/       Stage 1: WCA API → raw_wca (check, download, import, swap)
    derive/    Stage 2: raw_wca → app (schema, transform, ratings, rank, swap, snapshot)
    db.ts, log.ts   small shared infra
    index.ts   pipeline orchestrator (called by the workflow)
web/           Next.js 15 App Router site
  app/         routes: /rankings/[event], /competitors/[wcaId], /about, OG images
  components/  shared UI (leaderboard, pickers, charts, skeletons)
  lib/         db client, typed queries, formatters, OG renderers
scripts/       ops scripts (rating verification and parameter sweeps)
.github/
  workflows/
    ingest.yml hourly WCA-export sync + rating recompute
```

## Rating model

Per (competitor, event, metric):

1. Collect their results over the last 24 months, *anchored on their most recent competition in this event* (so a competitor who last competed 18 months ago still rates off their full 2-year context, rather than having the window shrink around them). Competitors whose most recent round in the event is older than 24 months drop off the leaderboard. Require ≥3 results in window.
2. For each round, compute a Kinch-style score: `100 × (WR_value / result_value)`. WR is the all-time minimum of the same metric (`average` for Ao5/Mo3 events; `best` for BLD, FMC, multi).
3. Multiply by a bonus factor (max +2%) for context: final round + medal, regional record, championship scope.
4. Weight by `0.99 ^ days_since_competition`; take the weighted mean → raw rating.
5. If the competitor hasn't competed in this event for longer than the event-specific grace period (90 days for 3×3, 2×2, OH, pyra, skewb, squan; 180 days for big cubes / clock / minx / 3bld; 365 days for FMC / multi / 4bld / 5bld), multiply by `0.995 ^ (days − grace)`.
6. Rank per event and metric using SQL `RANK()` (tied competitors share a rank; the next slot skips).

Bonus weights are calibrated against the reference values shown in James's video (MAE 0.45 across 11 reference figures). See the comment block at the top of `ingest/src/derive/ratings.ts` and `scripts/sweep-rating.ts`.

### Known gaps

- **DNFs are not yet factored in.** Currently we drop DNF results when computing a competitor's rating, which understates the rating impact of unreliable solvers in BLD / FMC / multi / clock. James noted in the source video's comment thread that DNF rate should eventually be folded in as a per-event penalty coefficient. See issue tracker / `AGENTS.md` for progress.
- The per-event inactivity grace period (90 / 180 / 365 days depending on how often the event is held) is a judgement call rather than a value from the spec.

## Running locally

Requires Node 20+ and pnpm 9+, plus a Neon Postgres database (or any Postgres).

```sh
pnpm install

# Environment
cp .env.example .env.local         # then edit
# or export directly:
export DATABASE_URL="postgres://user:pass@host/db?sslmode=require"

# Ingest: check for a new WCA export (no download)
pnpm --filter @scr/ingest run check

# Ingest: download + import + recompute ratings
pnpm --filter @scr/ingest run ingest

# Ingest: force re-import even if export_date hasn't changed
FORCE_INGEST=1 pnpm --filter @scr/ingest run ingest

# Web
pnpm --filter @scr/web dev         # http://localhost:3000
pnpm --filter @scr/web build
```

## Deployment

- **Ingest** — GitHub Actions workflow at `.github/workflows/ingest.yml`. Runs hourly and on manual dispatch. Requires the repo secret `DATABASE_URL`.
- **Web** — Deploy to any Next.js host. We target Vercel. Set `DATABASE_URL` to your production Neon connection string.

## Attribution

This site uses competition data from the [World Cube Association](https://worldcubeassociation.org/results), used under the terms of their public results export. It is not affiliated with or endorsed by the WCA.

The rating model is by [James Macdiarmid](https://www.youtube.com/watch?v=2lU-d6OUU3Q). The implementation is ours.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, see [SECURITY.md](SECURITY.md).
