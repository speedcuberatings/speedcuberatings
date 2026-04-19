import { createReadStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import copyFrom from 'pg-copy-streams';
import { log } from './log.ts';
import { makeClient } from './db.ts';

const STAGING_SCHEMA = 'wca_staging';

/**
 * Tables we actually load into `raw_wca`. The WCA TSV zip contains more
 * tables than we need — `scrambles`, `result_attempts`, `ranks_single`, and
 * `ranks_average` are excluded because:
 *  - `scrambles` / `result_attempts` are huge and unused by the rating model
 *    (the model only needs `results.best`/`.average`, not individual solves).
 *  - `ranks_*` are WCA's pre-computed PR rankings, which we replace with our
 *    own rating pipeline in Phase 2.
 *
 * Excluding them keeps us comfortably inside Neon's 512 MB free tier while
 * we iterate. Revisit when we need those features.
 */
const INCLUDED_TABLES = new Set<string>([
  'championships',
  'competitions',
  'continents',
  'countries',
  'eligible_country_iso2s_for_championship',
  'events',
  'formats',
  'persons',
  'results',
  'round_types',
]);

export interface ImportResult {
  rowCounts: Record<string, number>;
  metadata: { export_date: string; export_format_version: string };
}

/**
 * Read the first line of a file and return:
 *  - the header columns (split by tab)
 *  - the byte offset at which the next line starts
 */
async function readHeader(filePath: string): Promise<{ columns: string[]; dataStart: number }> {
  const fh = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(1 << 16); // 64KB is plenty for a header
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const slice = buf.subarray(0, bytesRead);
    const nl = slice.indexOf(0x0a); // '\n'
    if (nl === -1) {
      throw new Error(`header not found within first 64KB of ${filePath}`);
    }
    let headerEnd = nl;
    if (headerEnd > 0 && slice[headerEnd - 1] === 0x0d) headerEnd -= 1; // strip \r
    const headerStr = slice.subarray(0, headerEnd).toString('utf8');
    const columns = headerStr.split('\t');
    return { columns, dataStart: nl + 1 };
  } finally {
    await fh.close();
  }
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

async function createStagingSchema(client: pg.Client): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${STAGING_SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${STAGING_SCHEMA}`);
}

async function createTable(
  client: pg.Client,
  table: string,
  columns: string[],
): Promise<void> {
  if (columns.length === 0) throw new Error(`no columns parsed for table ${table}`);
  const cols = columns.map((c) => `${quoteIdent(c)} text`).join(', ');
  await client.query(
    `CREATE TABLE ${STAGING_SCHEMA}.${quoteIdent(table)} (${cols})`,
  );
}

async function copyTsv(
  client: pg.Client,
  table: string,
  filePath: string,
  columns: string[],
  dataStart: number,
): Promise<number> {
  const colList = columns.map(quoteIdent).join(', ');
  // FORMAT text + explicit NULL '' means empty strings come in as NULL.
  // This matches the WCA TSV convention (no explicit null marker, blanks).
  const sql = `COPY ${STAGING_SCHEMA}.${quoteIdent(table)} (${colList}) FROM STDIN WITH (FORMAT text, NULL '', DELIMITER E'\\t')`;
  const copyStream = client.query(copyFrom.from(sql));
  const fileStream = createReadStream(filePath, { start: dataStart });
  await pipeline(fileStream, copyStream);

  const countRes = await client.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM ${STAGING_SCHEMA}.${quoteIdent(table)}`,
  );
  return Number(countRes.rows[0]?.c ?? 0);
}

export async function importExport(
  tsvFiles: Record<string, string>,
  metadataJsonPath: string | null,
): Promise<ImportResult> {
  if (!metadataJsonPath) {
    throw new Error('metadata.json missing from export');
  }
  const metadata = JSON.parse(await fsp.readFile(metadataJsonPath, 'utf8')) as {
    export_date: string;
    export_format_version: string;
  };

  const client = await makeClient();
  try {
    log.info('creating staging schema', { schema: STAGING_SCHEMA });
    await createStagingSchema(client);

    const rowCounts: Record<string, number> = {};
    // Process tables in a sensible order; largest last so we fail fast on config issues.
    const entries = Object.entries(tsvFiles)
      .filter(([table]) => INCLUDED_TABLES.has(table))
      .sort(([a], [b]) => a.localeCompare(b));
    const skipped = Object.keys(tsvFiles).filter((t) => !INCLUDED_TABLES.has(t));
    if (skipped.length) {
      log.info('skipping unused tables', { skipped });
    }
    for (const [table, filePath] of entries) {
      const { columns, dataStart } = await readHeader(filePath);
      log.info('loading table', { table, columns: columns.length });
      await createTable(client, table, columns);
      const rows = await copyTsv(client, table, filePath, columns, dataStart);
      rowCounts[table] = rows;
      log.info('loaded table', { table, rows });
    }
    sanityCheck(rowCounts);
    return { rowCounts, metadata };
  } finally {
    await client.end();
  }
}

/** Fail loudly if core tables are empty — something clearly went wrong. */
function sanityCheck(counts: Record<string, number>): void {
  const required: Array<[string, number]> = [
    ['persons', 100_000],
    ['competitions', 1_000],
    ['results', 1_000_000],
    ['events', 10],
    ['countries', 50],
  ];
  for (const [t, min] of required) {
    const got = counts[t] ?? 0;
    if (got < min) {
      throw new Error(`sanity check failed: ${t} has ${got} rows, expected >= ${min}`);
    }
  }
}

export { STAGING_SCHEMA };
