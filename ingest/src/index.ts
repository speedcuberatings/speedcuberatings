import {
  fetchWcaMetadata,
  fetchLocalState,
  isNewExport,
  majorVersion,
} from './check.ts';
import { downloadAndUnzip, cleanup } from './download.ts';
import { importExport } from './import.ts';
import { atomicSwap, updateMeta } from './swap.ts';
import { log } from './log.ts';
import { runPhase2 } from './phase2/index.ts';

async function main(): Promise<void> {
  const startedAt = new Date();
  const force = process.env.FORCE_INGEST === '1';
  const skipPhase2 = process.env.SKIP_PHASE2 === '1';

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
      log.info('phase1: ingest complete', {
        elapsed_sec: Math.round((Date.now() - startedAt.getTime()) / 1000),
        row_counts: result.rowCounts,
      });
    } finally {
      await cleanup(dl.dir);
    }
  } else {
    log.info('phase1: no new export, skipping ingest');
  }

  // Phase 2 runs every time (even without a new export) so the inactivity
  // decay stays current on every hourly tick.
  if (skipPhase2) {
    log.info('phase2: skipped via SKIP_PHASE2');
    return;
  }
  await runPhase2();
}

main().catch((err) => {
  log.error('ingest failed', { error: String(err), stack: (err as Error)?.stack });
  process.exit(1);
});
