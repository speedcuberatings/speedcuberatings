import {
  fetchWcaMetadata,
  fetchLocalState,
  isNewExport,
  majorVersion,
} from './wca/check.ts';
import { downloadAndUnzip, cleanup } from './wca/download.ts';
import { importExport } from './wca/import.ts';
import { atomicSwap, updateMeta } from './wca/swap.ts';
import { log } from './log.ts';
import { runDerive } from './derive/index.ts';

/**
 * Two-stage ingest orchestrator.
 *
 *   Stage `wca`     — poll the WCA export API and, when a new export is
 *                     available, download + import into `raw_wca`.
 *                     Skipped when `export_date` hasn't changed (unless
 *                     FORCE_INGEST=1).
 *   Stage `derive`  — rebuild `app.*` from `raw_wca.*` and recompute
 *                     ratings. Runs every hourly tick so inactivity decay
 *                     stays current to the day. Skipped with SKIP_DERIVE=1.
 */
async function main(): Promise<void> {
  const startedAt = new Date();
  const force = process.env.FORCE_INGEST === '1';
  const skipDerive = process.env.SKIP_DERIVE === '1';

  const remote = await fetchWcaMetadata();
  const local = await fetchLocalState();

  log.info('ingest start', {
    remote_export_date: remote.export_date,
    remote_version: remote.export_format_version,
    local_export_date: local.lastExportDate,
    local_version: local.lastExportVersion,
    force,
  });

  // Major-version guard.
  if (
    local.lastExportVersion &&
    majorVersion(remote.export_format_version) !==
      majorVersion(local.lastExportVersion)
  ) {
    log.error('wca export major version bump — halting for manual review', {
      local: local.lastExportVersion,
      remote: remote.export_format_version,
    });
    process.exit(2);
  }

  const hasNewExport = force || isNewExport(remote, local);

  if (hasNewExport) {
    const dl = await downloadAndUnzip(remote.tsv_url);
    try {
      const result = await importExport(dl.tsvFiles, dl.metadataJsonPath);
      await atomicSwap();
      await updateMeta({
        exportDate: result.metadata.export_date,
        exportVersion: result.metadata.export_format_version,
        tsvUrl: remote.tsv_url,
        rowCounts: result.rowCounts,
        startedAt,
      });
      log.info('wca: import complete', {
        elapsed_sec: Math.round((Date.now() - startedAt.getTime()) / 1000),
        row_counts: result.rowCounts,
      });
    } finally {
      await cleanup(dl.dir);
    }
  } else {
    log.info('wca: no new export, skipping import');
  }

  if (skipDerive) {
    log.info('derive: skipped via SKIP_DERIVE');
    return;
  }
  await runDerive();
}

main().catch((err) => {
  log.error('ingest failed', { error: String(err), stack: (err as Error)?.stack });
  process.exit(1);
});
