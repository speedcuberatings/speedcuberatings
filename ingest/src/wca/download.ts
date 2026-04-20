import { createWriteStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { tmpdir } from 'node:os';
import unzipper from 'unzipper';
import { log } from '../log.ts';

export interface DownloadedExport {
  dir: string;
  tsvFiles: Record<string, string>; // tableName -> absolute path
  metadataJsonPath: string | null;
}

const USER_AGENT =
  'speedcuberatings-ingest/0.1 (+https://github.com/<owner>/speedcuberatings)';

/**
 * Download and unzip the TSV export into a fresh temporary directory.
 * The WCA TSV zip contains files named `WCA_export_<table>.tsv` plus
 * a top-level `metadata.json` and `README.md`.
 */
export async function downloadAndUnzip(tsvUrl: string): Promise<DownloadedExport> {
  const dir = await fsp.mkdtemp(path.join(tmpdir(), 'wca-export-'));
  log.info('downloading wca tsv export', { url: tsvUrl, dir });

  const res = await fetch(tsvUrl, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }

  const zipPath = path.join(dir, 'export.zip');
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(zipPath));

  const stat = await fsp.stat(zipPath);
  log.info('download complete', { bytes: stat.size });

  // Extract.
  await pipeline(
    (await import('node:fs')).createReadStream(zipPath),
    unzipper.Extract({ path: dir }),
  );
  await fsp.unlink(zipPath);

  const entries = await fsp.readdir(dir);
  const tsvFiles: Record<string, string> = {};
  let metadataJsonPath: string | null = null;
  for (const name of entries) {
    const full = path.join(dir, name);
    if (name === 'metadata.json') {
      metadataJsonPath = full;
    } else if (name.endsWith('.tsv')) {
      const m = name.match(/^WCA_export_(.+)\.tsv$/);
      if (m) {
        tsvFiles[m[1]] = full;
      }
    }
  }
  log.info('unzipped', { tables: Object.keys(tsvFiles), hasMetadata: !!metadataJsonPath });
  return { dir, tsvFiles, metadataJsonPath };
}

export async function cleanup(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}
