# AGENTS.md

Working notes for agents and contributors. For the public-facing overview
(what this is, how to run it, attribution) see `README.md`.

## Tech stack

- Node 20, pnpm 9 workspaces
- TypeScript, ESM (`"type": "module"` in the `ingest` package)
- Postgres via `pg` + `pg-copy-streams` (ingest) and `@neondatabase/serverless` (web)
- `unzipper` for the WCA TSV archive
- Next.js 15 App Router, React 19, Tailwind 4
- `@cubing/icons` for event glyphs in the UI
- GitHub Actions for scheduled ingest
- Neon Postgres as the serving DB

## Key commands

```sh
# Install (from repo root)
pnpm install

# Ingest
pnpm --filter @scr/ingest run check          # poll WCA, no download
pnpm --filter @scr/ingest run ingest         # full pipeline
FORCE_INGEST=1 pnpm --filter @scr/ingest run ingest
SKIP_DERIVE=1  pnpm --filter @scr/ingest run ingest   # only refresh raw_wca

# Web
pnpm --filter @scr/web dev                   # localhost:3000
pnpm --filter @scr/web build
pnpm --filter @scr/web lint

# Rating tools
DATABASE_URL=… npx tsx scripts/verify-rating.ts <wcaId>
DATABASE_URL=… npx tsx scripts/sweep-rating.ts
```

## Secrets / env vars

- `DATABASE_URL` — Postgres connection string with `sslmode=require`.
  - Local: put in `.env` at the repo root.
  - GitHub Actions: repo secret of the same name.
  - Web (Vercel): same.

## Schema conventions

- `raw_wca.*` — 1:1 mirror of the WCA TSV export. All columns are `text`;
  table and column names come from the WCA TSV headers (snake_case in
  format V2+). Created dynamically at ingest time, so the mirror survives
  WCA adding/removing columns.
- `app.*` — derived, typed, app-facing schema built each ingest run.
  Tables: `events`, `competitors`, `continents`, `countries`,
  `competitions`, `official_results`, `current_ratings`.
  - `current_ratings` is keyed on `(competitor_id, event_id, metric)`
    where `metric ∈ {'single','average'}`. Most events have both rows.
  - `rank` uses SQL `RANK()` so ties share a rank and the next slot
    skips (5, 5, 7) — standard sports convention.
  - `current_ratings.last_competition_id` joins `app.competitions` for
    the "last at <Competition>, <City>" subtext on leaderboards.
- `scr.*` — long-lived metadata that survives the app-schema swap.
  - `_meta` — single-row ingest state (last export date, version, row
    counts, timestamps).
  - `rating_history` — monthly snapshots of `current_ratings` for
    trend/delta displays.
  - `rating_snapshot_state` — tracks which calendar month we last
    snapshotted so reruns inside a month don't duplicate.

## Site invariant

`web/` only reads from `app.*` and `scr.*`. It never queries `raw_wca.*`.
If you need something from raw WCA data, add it to the `derive/` stage's
schema first. This keeps upstream format changes contained.

## Ingest pipeline design

- **Dynamic raw schema.** Each ingest reads the TSV headers at runtime
  and creates matching `raw_wca.*` tables with all-`text` columns, so
  WCA schema tweaks within a major version don't break us.
- **Atomic swap.** Raw ingest lands in `wca_staging`; app build lands
  in `app_staging`. When each stage is done, `ALTER SCHEMA ... RENAME`
  atomically promotes it, with the prior generation kept briefly as
  `*_prev` for rollback.
- **Major-version guard.** If the WCA export's `export_format_version`
  major digit changes, the ingest halts with exit code 2 and alerts.
  Requires manual review.
- **Row-count sanity checks.** After import, row counts for
  `persons`, `competitions`, `results`, `events`, `countries` are
  compared to minimum thresholds. Halt before swap if anything looks
  suspiciously empty.
- **Two stages, run every tick.** Stage 1 (WCA import) runs only when
  the export's `export_date` changes. Stage 2 (derived tables + rating
  compute) runs on every hourly tick so inactivity decay stays current
  to the day.
- **Filtered WCA scope.** We skip `scrambles`, `result_attempts`,
  `ranks_single`, and `ranks_average` from the WCA export — they're
  not used by the rating model and dominate storage. See
  `INCLUDED_TABLES` in `ingest/src/import.ts`. Revisit if a feature
  ever needs them.

## Rating model

Per (competitor, event, metric), every ingest run:

1. Collect last-24-months results. Exclude if fewer than 3 in window.
2. For each round, compute a Kinch-style score:
   `100 × (WR_value / result_value)`. WR is the all-time minimum of
   the same metric (`average` for Ao5/Mo3 events; `best` for BLD /
   FMC / multi / events without averages).
3. Multiply by bonus factor (max +2%): final round + medal, regional
   record, championship scope. The source video states "max 15 to
   17%" but effective values in the reference implementation are
   ~10× smaller; calibrated via `scripts/sweep-rating.ts` to match
   the reference leaderboard to MAE 0.45. See the comment block at
   the top of `ingest/src/derive/ratings.ts`.
4. Weight by `0.99 ^ days_since_competition`. Weighted mean → raw
   rating.
5. If days since most recent result > 90, multiply by
   `0.995 ^ (days − 90)`. Competitors disappear naturally at the
   24-month cutoff.
6. Rank by rating per (event, metric) using SQL `RANK()`.

Tunable constants are at the top of `ingest/src/derive/ratings.ts`.
Rateable event list is in `ingest/src/derive/transform.ts`.

## Web app

- **Stack.** Next.js 15 App Router with Server Components by default,
  `@neondatabase/serverless` as the DB driver (HTTP/WebSocket-based;
  works on Node, Edge, and Cloudflare Workers).
- **Routes.**
  - `/` — redirect to `/rankings/333`
  - `/rankings/[event]` — leaderboard. Query params `?metric=`,
    `?region=`, `?limit=`.
  - `/competitors/[wcaId]` — profile (per-event ratings, sparkline,
    recent results). Query param `?metric=`.
  - `/about` — colophon.
  - `/opengraph-image`, `/rankings/[event]/opengraph-image`,
    `/competitors/[wcaId]/opengraph-image` — Next's OG image
    convention (unfiltered, seen by social crawlers).
  - `/rankings/[event]/og`, `/competitors/[wcaId]/og` — filter-aware
    OG image endpoints hit by the in-page "Share card" link.
- **Caching.** Stable reference queries (events, continents,
  countries, metadata) are wrapped in `unstable_cache`. `getLeaderboard`
  is wrapped in React's `cache` so `StatsLine` and `LeaderboardSection`
  share one query per request. Pages use `revalidate`.
- **Loading UX.** `loading.tsx` for hard navigation. `<Suspense>`
  boundaries around the filter-dependent sections keyed on
  `(metric, region, limit)` so soft nav on filter change shows a
  paper-tone skeleton immediately while the shell stays mounted.

## Aesthetic conventions

- Paper-cream `#f4efe6` background with a subtle SVG noise texture.
- Deep-ink body text; crimson `#c03028` accent used sparingly (top-3
  rank italic, hover states, italicised wordmark highlight).
- Typography: Fraunces (display, variable), Manrope (body),
  JetBrains Mono (tabular figures).
- Event icons from `@cubing/icons` webfont.
- Restrained motion: one staggered reveal on mount (`--i` index).
- Design tokens live under `@theme` in `web/app/globals.css`.
- OG images (rendered via `next/og` / Satori) use locally-committed
  TTF files under `web/lib/og-fonts-files/` so Satori gets raw
  TrueType and not the WOFF2 Google Fonts normally serves.

## Favicon

- `web/app/icon.svg` is a static deterministic favicon for SSR and
  crawlers.
- `web/components/RandomFavicon.tsx` is a client component that
  replaces the icon after hydration with a freshly scrambled 3×3 face,
  so each page load (or refresh) produces a new random one.

## Things to watch out for

- Neon's HTTP/WebSocket driver reuses connections under the hood, so
  Postgres `TEMP TABLE`s can leak across sessions. The ingest
  transform defensively `DROP TABLE IF EXISTS` before recreating them.
- `COPY ... FORMAT text` is used (not CSV). WCA TSVs don't quote
  fields and replace newlines in `333mbf` scrambles with `|`. If that
  convention changes we'll need to adjust.
- Some WCA columns contain the literal string `"NULL"` for missing
  values. The transform uses `NULLIF(col, 'NULL')` before casting.
- Full WCA data is several GB once indexed. Neon free tier is 0.5 GB,
  so even the trimmed dataset needs the Launch plan (10 GB).

## Repo layout cheat sheet

```
ingest/                  Ingest pipeline (Node/TS, runs in GH Actions)
  sql/                   SQL DDL: scr.* + app_staging.* tables
  src/
    wca/                 Stage 1: WCA API → raw_wca
                           check, download, import, swap
    derive/              Stage 2: raw_wca → app + rating compute
                           schema, transform, ratings, rank, swap, snapshot
    db.ts, log.ts        Small shared infra
    index.ts             Pipeline orchestrator
web/                     Next.js 15 site (Server + Client components)
  app/                   Routes + OG images
  components/            Shared UI
  lib/                   DB client, queries, formatters, OG renderers
scripts/                 One-off ops scripts (rating verification)
.github/workflows/       CI/cron
```
