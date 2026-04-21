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

# Engine parity (against local /api/calibrate/pool) — requires dev server
DATABASE_URL=… npx tsx scripts/verify-engine-parity.ts           # default 333 avg
DATABASE_URL=… npx tsx scripts/verify-engine-parity.ts 222 single

# DB identity check — confirms which Neon project a given DATABASE_URL
# actually points at. Useful after rotating Vercel or GH Actions secrets.
DATABASE_URL=… npx tsx scripts/check-db-identity.ts
```

## Secrets / env vars

- `DATABASE_URL` — Postgres connection string with `sslmode=require`.
  All three slots must point at the **same** Neon project:
  - Local: `.env` at the repo root.
  - GitHub Actions: repo secret of the same name (used by
    `.github/workflows/ingest.yml`).
  - Web (Vercel): environment variable on the `speedcuberatings-web`
    project under the Production and Preview scopes. Marked "Sensitive"
    in the Vercel UI, so the value cannot be read back after saving —
    only overwritten.
- **Canonical DB**: single Neon project `ep-calm-credit-amwcaln3`
  (`neondb`, pooled connection). Historically a separate `ep-late-union`
  "prod" project existed; it was retired on 2026-04-20 after an audit
  found Vercel and GH Actions had drifted onto different projects,
  which caused a multi-hour "why is the site stale?" debugging episode.
  If you need a sandbox, create a **Neon branch** off this project,
  not a second project.
- `GITHUB_FEEDBACK_TOKEN` / `GITHUB_FEEDBACK_REPO` — Vercel-only.
  Used by `web/app/api/feedback/route.ts` to file a GitHub issue when
  a user submits the in-site feedback widget. The token is a
  fine-grained PAT scoped to the feedback repo with only "Issues:
  Read and write". Repo is `"owner/repo"`, e.g.
  `speedcuberatings/speedcuberatings`.
- `DEVIN_API_KEY` — GitHub repo secret. Consumed by
  `.github/workflows/feedback-triage.yml` to spin up a Devin session
  that posts an initial triage comment on any issue labelled
  `feedback`. v1 `https://api.devin.ai/v1/sessions` endpoint.
- **Whenever you rotate any of the three slots**, run
  `scripts/check-db-identity.ts` against the new value and against the
  other two slots (trigger a GH workflow_dispatch on `ingest.yml` and
  confirm `scr._meta.last_import_started` moves; deploy a preview on
  Vercel if you need to verify the web slot). The script prints only
  non-secret fields (host, project slug, ingest timestamps, top-3 333
  average) so output can be pasted anywhere safely.

## Schema conventions

- `raw_wca.*` — 1:1 mirror of the WCA TSV export. All columns are `text`;
  table and column names come from the WCA TSV headers (snake_case in
  format V2+). Created dynamically at ingest time, so the mirror survives
  WCA adding/removing columns.
- `app.*` — derived, typed, app-facing schema built each ingest run.
  Tables: `events`, `competitors`, `continents`, `countries`,
  `competitions`, `official_results`, `current_ratings`.
  - `events.wr_single` / `events.wr_average` are the all-time world
    records per metric, sourced from `raw_wca.results` during derive.
    These are the canonical Kinch denominators — both the ingest's
    rating pass and the calibration sandbox's `/api/calibrate/pool`
    endpoint read from this column, so the two stay in lockstep.
    Nullable; some events (BLD singles, FMC, multi) don't have
    averages.
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

1. Collect results in a 24-month window *anchored on the competitor's
   most recent round in the event*, not on today. Competitors whose
   latest round is older than 24 months drop out of the leaderboard
   for that event. Exclude the competitor if fewer than 3 in window.
2. For each round, compute a Kinch-style score:
   `100 × (WR_value / result_value)`. WR is the all-time minimum of
   the same metric (`average` for Ao5/Mo3 events; `best` for BLD /
   FMC / multi / events without averages).
3. Multiply by a bonus factor `1 + 0.01 × (placement + record)`:
   - **Placement** = `(R + S + T + U + 0.5) × 0.3 × champ_mult − 0.075`
     where R=1 if final, S=1 if pos≤3 in final, T=1 if pos≤2, U=2
     if pos=1, and `champ_mult` is 5.5 / 3.0 / 1.0 / 0.5 for
     worlds / continental / national / non-championship.
   - **Record** = `2·any_record + 2·continental_or_higher + 4·WR`,
     so NR=2, CR=4, WR=8. Single and average records on the same
     round de-dupe.
   Reverse-engineered from James's "Seasonal ratings" spreadsheet
   (April 2026); reproduces his reference leaderboard to MAE ~0.025.
4. Weight by `0.99 ^ days_since_competition`. Weighted mean → raw
   rating.
5. If days since most recent result exceeds the event-specific
   grace period (90 / 180 / 365 days; see
   `INACTIVITY_GRACE_DAYS` in `ratings.ts`), multiply by
   `0.9995 ^ (days − grace)`.
6. Rank by rating per (event, metric) using SQL `RANK()`.

Tunable constants are at the top of `ingest/src/derive/ratings.ts`.
Rateable event list is in `ingest/src/derive/transform.ts`.

### Rating model follow-ups

- **DNF handling (partial).** All-DNF rounds (`best = -1`) are now
  stored in `app.official_results` with a per-format `dnf_count`, so
  the calibration sandbox's DNF-rate penalty sees real signal for
  BLD / FMC / multi events instead of always reading 0%. The
  production rating path still ignores `dnf_count` — we compute the
  DNF-rate multiplier only in the client-side `/calibrate` engine
  behind the `dnfPenalty` extra. Once tuned there, the next step is a
  second-pass adjustment inside `ratings.ts`:
  `rating *= max(floor, 1 − α × max(0, dnf_rate − baseline))`
  with `α` and `baseline` tunable per event. James Macdiarmid flagged
  this as a known gap in the source-video comments and suggested
  roughly this shape; BLD expects higher baseline DNF rates than 3×3.
  The exact DNFs-per-round count is still a lower bound: see "Known
  limitation" in the calibration section below.
- **Window is anchored on the competitor's most recent competition in
  the event**, not the current date. A competitor who last competed 18
  months ago still rates off their full 24-month context, and
  disappears from the leaderboard only once their most recent round
  falls outside the 24-month cutoff. See `last_competed_per_event` in
  `transform.ts`.
- **Per-event inactivity grace period.** 90 / 180 / 365 days depending
  on how frequently the event is held (see `INACTIVITY_GRACE_DAYS` map
  in `ratings.ts`). Judgement call, not spec.

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
  - `/calibrate`, `/calibrate/[event]` — **hidden** calibration sandbox
    for the rating formula (see below). Not linked from anywhere on the
    site; `robots.txt` disallows it and the page sets `noindex,nofollow`.
    Query param `?metric=`, `?c=` (base64 config diff).
  - `/api/calibrate/pool` — JSON endpoint for the calibration page's
    candidate pool. `?event=`, `?metric=`, `?poolSize=` (10-200, default 50).
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

## Calibration sandbox

A hidden, unlinked page at `/calibrate/[event]` that lets a non-technical
collaborator tweak the rating formula and watch the top-N leaderboard
re-rank instantly. Ship-gated by obscurity — no auth, no link from
anywhere on the site, `robots.txt` disallows it. Share the URL with
people you want to have access.

- **Architecture.** Client-side rating engine recomputes ratings in the
  browser on every knob turn. The server's only job is to return a
  pre-baked "candidate pool" of results for the selected (event, metric)
  via `/api/calibrate/pool`. Pool is ~1.2 MB uncompressed / ~60 KB
  gzipped per event × metric for 50 candidates.
- **Engine mirror.** `web/lib/rating-engine/` is a TypeScript port of
  `ingest/src/derive/ratings.ts`. Default config reproduces production
  ratings to MAE ~0.01 (rounding-level). If these two ever drift, the
  `StatusBar` pill on the page flashes and `scripts/verify-engine-parity.ts`
  fails. Keep in sync; bump `ENGINE_VERSION` in `defaults.ts` for any
  schema change.
- **Tunable parameters.** Every constant in `ratings.ts` (weight base,
  inactivity base, grace days, Kinch scale, placement & record bonus,
  champ multipliers…) plus three experimental "extras" which are off by
  default so default = production:
  - `dnfPenalty` — rate-based adjustment. Two-sided: penalty above a
    baseline DNF rate, optional reward below it (gated by a separate
    `bonusAlpha` slope that defaults to 0, so enabling the extra with
    defaults keeps the original penalty-only behaviour). Clamped by
    `floor` and `ceil`. See limitation below.
  - `formatWeights` — per-format multipliers (Ao5, Mo3, Bo3, Bo5, Bo2, Bo1)
  - `roundTypeFilter` — include-list by `round_type_id`
- **Per-event overrides.** Any global parameter can be overridden on a
  per-event basis, with a per-field "inherit from global" toggle.
  Handles the case where e.g. 333mbf needs very different handling than
  333 without forcing a one-size-fits-all formula.
- **Config persistence.** URL-encoded diff (short base64 in `?c=`) and
  full JSON export / import. No database table. Sharing is URL or file.
- **Required schema.** Calibration needs `format_id` and `dnf_count`
  columns on `app.official_results` (added 2026-04). These are populated
  by `ingest/src/derive/transform.ts` on every derive run. If you see
  `column "format_id" does not exist` errors in the `/api/calibrate/pool`
  route, the DB hasn't had derive run since the column was added — kick
  an ingest via workflow_dispatch or run locally.
- **Known limitation: DNF-rate is still a lower bound.** The WCA TSV
  export doesn't include per-attempt values (`result_attempts` is
  deliberately skipped in `INCLUDED_TABLES` to keep us under the Neon
  storage cap), so we derive `dnf_count` from the 3-state signal WCA
  gives us per round:
  - `best > 0 AND average > 0` → 0 DNFs
  - `best > 0 AND average = -1` → ≥1 DNF (Ao5 contributes 2, since a
    single DNF is trimmed and leaves the mean valid; Mo3/Bo3/Bo5
    contribute 1)
  - `best = -1` → all attempts DNF (N per format: 5/3/3/5/2/1)
  All-DNF rounds ARE stored in `app.official_results` (keyed by the
  `last_competed_per_event` successful-anchor window); the prod rating
  query in `ratings.ts` filters `${col} > 0` itself so they don't
  reach rating math, but they do feed DNF accounting and show up in
  the calibration sandbox's DNF rate. The `getCompetitorRecentResults`
  query filters `best > 0` so DNF rounds don't clutter profile pages.
  The single-DNF-in-valid-Ao5 case remains invisible — re-include
  `result_attempts` when that becomes load-bearing.
- **Verification.** `scripts/verify-engine-parity.ts` hits the running
  dev server's pool endpoint and checks engine output vs production for
  any (event, metric) pair. MAE > 0.05 is the regression threshold.

## In-site feedback widget

A floating "Feedback" button anchored bottom-right on every page
(`web/components/FeedbackButton.tsx`, mounted in `app/layout.tsx`).
Opens a modal with a textarea, an optional email field, and the current
page URL captured automatically.

- **Flow.** Modal POSTs to `/api/feedback` → route handler files a GH
  issue with labels `feedback` + `needs-triage` using
  `GITHUB_FEEDBACK_TOKEN` + `GITHUB_FEEDBACK_REPO` → GH Actions
  workflow `feedback-triage.yml` listens on `issues.labeled` and, when
  the `feedback` label is applied, kicks off a Devin session via the v1
  Sessions API. Devin is prompted to post ONE triage comment on the
  issue (scope + label recommendations) and not to open a PR.
- **No auth, no captcha, no rate limit.** Fine for launch-day traffic.
  If we start getting spam issues, the cheapest next step is adding
  Cloudflare Turnstile to the modal + verifying the token in the route
  handler; per-IP rate limiting via Upstash is the step after.
- **Privacy.** The feedback text, optional email, and page URL go into
  a public GitHub issue verbatim. The modal warns users not to submit
  anything sensitive. `@`-mentions in the user body are escaped with a
  zero-width joiner so they don't ping random GitHub users.
- **Auto-implement via label.** Applying the `devin-implement` label
  to any issue (feedback or otherwise) triggers
  `.github/workflows/feedback-implement.yml`, which spins up a Devin
  session prompted to read the issue + any prior triage comment,
  implement the change on a feature branch, and open a PR against
  `main`. Devin is told to stop and ask questions rather than guess
  on ambiguous requests. Reserve for scoped, low-risk work; bigger
  changes should still go through a human-driven Devin session.
- **Progressive auto-labelling.** The triage Devin session is also
  allowed to apply `devin-implement` itself at the end of triage,
  gated on a conservative confidence checklist in the prompt
  (clear scope, handful of files, no schema/rating-model/ingest/
  auth/user-data changes, modest size, no open questions). When the
  criteria aren't met, triage posts the comment and leaves the label
  to a human. The auth boundary therefore has two modes: human
  collaborators for any labelling, and triage Devin for the narrow
  "obvious small fix" subset. If triage starts auto-labelling things
  it shouldn't, tighten the checklist or revert to human-only
  labelling by removing step 4 from the triage prompt.

**Required labels** (create once with `gh label create`):
`feedback`, `needs-triage`, `devin-implement`.

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
    api/calibrate/pool/  Candidate-pool JSON endpoint for /calibrate
    api/feedback/        POST endpoint that files a GH issue from the widget
    calibrate/[event]/   Hidden calibration sandbox (noindex, unlinked)
  components/            Shared UI
    calibrate/           Calibration page components (client-heavy)
  lib/                   DB client, queries, formatters, OG renderers
    rating-engine/       Client-side port of ingest/src/derive/ratings.ts
scripts/                 One-off ops scripts (rating verification)
.github/workflows/       CI/cron
```
