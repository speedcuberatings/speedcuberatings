/**
 * Print a fingerprint of whichever database `DATABASE_URL` currently points
 * at, so you can tell at a glance whether your local shell, a CI run, and
 * the live site are all talking to the same DB.
 *
 * Prints only non-secret fields: host, project slug inferred from host,
 * last ingest timestamps, and the top-3 333 average so you can eyeball-
 * compare against the live site.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/check-db-identity.ts
 *
 * Also runnable against an arbitrary URL without touching env:
 *   npx tsx scripts/check-db-identity.ts 'postgres://...'
 */

import { makeClient } from '../ingest/src/db.ts';

async function main() {
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL (env or argv). Exiting.');
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '<invalid>';
    }
  })();
  // Neon hostnames look like `ep-<slug>-<id>-pooler.<region>.aws.neon.tech`.
  const neonProject = host.match(/^(ep-[a-z0-9-]+?)(?:-pooler)?\./)?.[1] ?? '<unknown>';

  // makeClient reads DATABASE_URL itself; if the caller passed a URL on argv
  // we temporarily splice it into process.env so the downstream helper sees it.
  const prevEnv = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const client = await makeClient();
  process.env.DATABASE_URL = prevEnv;
  try {
    const meta = (
      await client.query(
        `SELECT last_export_date, last_import_started, last_import_finished FROM scr._meta`,
      )
    ).rows[0];

    const top3 = (
      await client.query(
        `SELECT cr.competitor_id, c.name, cr.rating::float8 AS rating
           FROM app.current_ratings cr
           JOIN app.competitors c ON c.wca_id = cr.competitor_id
          WHERE cr.event_id = '333' AND cr.metric = 'average'
          ORDER BY cr.rating DESC
          LIMIT 3`,
      )
    ).rows;

    console.log(
      JSON.stringify(
        {
          host,
          neon_project: neonProject,
          now: new Date().toISOString(),
          last_export_date: meta?.last_export_date ?? null,
          last_import_started: meta?.last_import_started ?? null,
          last_import_finished: meta?.last_import_finished ?? null,
          top3_333_average: top3,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
