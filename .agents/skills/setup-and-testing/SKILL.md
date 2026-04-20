# Speedcube Ratings — Setup & Testing

## Prerequisites
- Node 20+ (22.x works)
- pnpm 9+ (enable via `corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- `DATABASE_URL` environment variable pointing to a Neon Postgres instance with `sslmode=require`

## Setup
```sh
pnpm install
echo "DATABASE_URL=$DATABASE_URL" > .env.local
```

## Build
```sh
pnpm --filter @scr/ingest run build   # TypeScript compilation
pnpm --filter @scr/web build           # Next.js static build
```

## Dev Server
```sh
pnpm --filter @scr/web dev             # http://localhost:3000
```
The root route `/` redirects to `/rankings/333` (3×3 leaderboard).

## Lint
```sh
pnpm --filter @scr/web lint
```
Note: ESLint is not pre-configured in the repo. Running `next lint` for the first time triggers an interactive setup wizard. There is no committed `.eslintrc.*` file.

## Tests
No test suite exists in this repo (no jest, vitest, or test scripts). Verification is done via end-to-end UI testing.

## End-to-End Testing Flows
When testing the app, verify these core flows against the live dev server:

1. **Rankings page** — Navigate to `/`. Verify redirect to `/rankings/333`, heading "3×3 rankings", event picker with 17 icons, leaderboard with ranked competitors, metric toggle (AVERAGE/SINGLE), stats line.
2. **Event switching** — Click a different event icon (e.g., 2×2). Verify URL changes, heading updates, leaderboard shows different data.
3. **Metric toggle** — Click SINGLE. Verify URL gets `?metric=single`, ratings change (lower values for single vs average).
4. **Competitor profile** — Click a competitor row. Verify `/competitors/{wcaId}` loads with name, WCA ID, country flag, "Rated in N events", ratings grid by event, WCA profile link.
5. **About page** — Click About nav link. Verify heading, James Macdiarmid credit, YouTube link, 7-step rating explanation.
6. **Navigation** — Click Rankings from About. Verify return to `/rankings/333` with full data.

## Database
- The app reads from `app.*` and `scr.*` schemas only (never `raw_wca.*`)
- `DATABASE_URL` secret is stored as a repo-scoped secret
- Connection uses `@neondatabase/serverless` (HTTP/WebSocket driver)

## Key Routes
- `/` → redirects to `/rankings/333`
- `/rankings/[event]` — leaderboard (query params: `?metric=`, `?region=`, `?limit=`)
- `/competitors/[wcaId]` — competitor profile
- `/about` — rating model explanation
