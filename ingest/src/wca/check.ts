import { log } from '../log.ts';
import { makePool } from '../db.ts';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WcaExportMetadata {
  export_date: string;
  export_format_version: string;
  sql_url: string;
  tsv_url: string;
}

const WCA_EXPORT_API = 'https://www.worldcubeassociation.org/api/v0/export/public';
const USER_AGENT =
  'speedcuberatings-ingest/0.1 (+https://github.com/<owner>/speedcuberatings)';

/**
 * Fetch the public export metadata.
 *
 * The live API returns `export_version` (with a `v` prefix, e.g. `v2.0.2`)
 * even though the README documents it as `export_format_version`. We normalise
 * both shapes here so the rest of the code sees `export_format_version` without
 * the leading `v`.
 */
export async function fetchWcaMetadata(): Promise<WcaExportMetadata> {
  const res = await fetch(WCA_EXPORT_API, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`WCA export API returned ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const version =
    (typeof body.export_format_version === 'string' ? body.export_format_version : undefined) ??
    (typeof body.export_version === 'string' ? body.export_version : undefined);
  const exportDate = typeof body.export_date === 'string' ? body.export_date : undefined;
  const sqlUrl = typeof body.sql_url === 'string' ? body.sql_url : undefined;
  const tsvUrl = typeof body.tsv_url === 'string' ? body.tsv_url : undefined;
  if (!exportDate || !version || !sqlUrl || !tsvUrl) {
    throw new Error(`WCA export API response missing fields: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return {
    export_date: exportDate,
    export_format_version: version.replace(/^v/, ''),
    sql_url: sqlUrl,
    tsv_url: tsvUrl,
  };
}

export interface LocalState {
  lastExportDate: string | null;
  lastExportVersion: string | null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const META_SQL_PATH = path.resolve(__dirname, '../../sql/meta.sql');

/**
 * Create `scr._meta` if it doesn't exist. Idempotent — runs the DDL file,
 * which uses IF NOT EXISTS / ON CONFLICT throughout.
 */
export async function ensureMeta(): Promise<void> {
  const sql = await fsp.readFile(META_SQL_PATH, 'utf8');
  const pool = makePool();
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

export async function fetchLocalState(): Promise<LocalState> {
  await ensureMeta();
  const pool = makePool();
  try {
    const r = await pool.query<{
      last_export_date: Date | null;
      last_export_version: string | null;
    }>(
      `SELECT last_export_date, last_export_version FROM scr._meta WHERE id = 1`,
    );
    const row = r.rows[0];
    if (!row) return { lastExportDate: null, lastExportVersion: null };
    return {
      lastExportDate: row.last_export_date ? row.last_export_date.toISOString() : null,
      lastExportVersion: row.last_export_version,
    };
  } finally {
    await pool.end();
  }
}

export function isNewExport(remote: WcaExportMetadata, local: LocalState): boolean {
  if (!local.lastExportDate) return true;
  // Compare as timestamps to avoid string formatting quirks.
  return new Date(remote.export_date).getTime() > new Date(local.lastExportDate).getTime();
}

export function majorVersion(v: string): string {
  const stripped = v.replace(/^v/, '');
  return stripped.split('.')[0] ?? stripped;
}

// CLI entry: used by pnpm ingest:check. Prints JSON summary and exits non-zero
// on error. Returns a shell exit code that callers can branch on.
async function main() {
  const remote = await fetchWcaMetadata();
  const local = await fetchLocalState();
  const fresh = isNewExport(remote, local);
  log.info('wca export check', {
    remote_export_date: remote.export_date,
    remote_version: remote.export_format_version,
    local_export_date: local.lastExportDate,
    local_version: local.lastExportVersion,
    new_export: fresh,
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ remote, local, fresh }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.error('check failed', { error: String(err) });
    process.exit(1);
  });
}
