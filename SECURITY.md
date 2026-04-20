# Security Policy

## Reporting a vulnerability

If you've found a security issue, please **don't** file a public GitHub issue. Instead email the maintainer or open a [GitHub security advisory](https://github.com/speedcuberatings/speedcuberatings/security/advisories/new) so we can triage privately.

Please include:

- A description of the issue
- Steps to reproduce
- What an attacker could do with it
- Any suggested fix (optional)

We'll acknowledge within a few days and keep you updated on the fix.

## Scope

This project reads the public WCA results export and serves a public leaderboard. There is no authentication, no user-owned data, and no personally-identifiable information beyond what the WCA itself publishes. So the primary concerns are:

- Secrets in the repo (we actively scan; see audit in git history)
- SQL injection (we use parameterised `sql\`\`` tagged templates — if you spot raw interpolation of user input, that's a bug)
- Open redirects / XSS in the web app
- Dependency vulnerabilities (run `pnpm audit` and report anything high/critical)

## Out of scope

- Rate-limiting / denial of service (the site is behind a CDN)
- Theoretical issues in open-source dependencies that haven't been exploited
- Social engineering

Thanks for keeping things safe.
