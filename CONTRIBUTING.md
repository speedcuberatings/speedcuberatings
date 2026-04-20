# Contributing

Thanks for considering a contribution. This is a small project run by volunteers so please keep things simple and chat before starting anything substantial.

## Quick setup

1. Fork and clone the repo.
2. `pnpm install` (Node 20+, pnpm 9+).
3. Copy `.env.example` to `.env` and point `DATABASE_URL` at a Postgres — the easiest path is a free-tier [Neon](https://neon.tech) branch.
4. `pnpm --filter @scr/ingest run ingest` — populates your database (~2–5 minutes on first run).
5. `pnpm --filter @scr/web dev` — site at `http://localhost:3000`.

## Before you open a PR

- Keep changes focused. One logical change per PR is much easier to review.
- Run typecheck for whichever package you touched:
  - `cd ingest && npx tsc --noEmit`
  - `cd web && npx tsc --noEmit`
- Keep the code style consistent with what's around it. No reformatting passes unrelated to your change.
- Avoid adding dependencies unless you have a real need; call it out in the PR description if you do.

## What this project is and isn't

**Is:** a faithful implementation of the rating model described by [James Macdiarmid](https://www.youtube.com/watch?v=2lU-d6OUU3Q), plus a public site that reads it.

**Isn't:** a place to invent a new rating model. If you want to change the *model*, please raise the idea with James directly or open a discussion issue first. Calibration tweaks to match his reference figures are welcome; conceptual redesigns are probably out of scope here.

## Ideas for good first contributions

- Event-specific tweaks (e.g. nicer display formatting for multi-blind results).
- Accessibility audits of the rankings and profile pages.
- Adding keyboard shortcuts for the metric / region pickers.
- Reducing bundle size or rendering cost.
- Documenting any edges of the rating formula that are unclear in the code.

## Reporting bugs and issues

Use GitHub Issues. Include:
- What you did
- What you expected
- What happened instead
- Browser and OS if it's a UI issue

For security issues, see `SECURITY.md`.

## Code of Conduct

Be kind. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Licensing

By contributing you agree that your contributions are licensed under the same MIT license as the rest of the project.
