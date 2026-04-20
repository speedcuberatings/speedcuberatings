/**
 * Renders a humanised "last updated X ago, based on WCA export of Y" line.
 * All strings computed server-side so there's no hydration mismatch.
 */
export function LastUpdated({
  lastImportFinished,
  lastExportDate,
}: {
  lastImportFinished: string | null;
  lastExportDate: string | null;
}) {
  if (!lastImportFinished) {
    return (
      <p className="text-[13px] text-[var(--color-muted)]">
        Rankings have not been published yet.
      </p>
    );
  }
  const imported = new Date(lastImportFinished);
  const exported = lastExportDate ? new Date(lastExportDate) : null;

  return (
    <p className="text-[13px] text-[var(--color-muted)] leading-relaxed">
      Last updated{' '}
      <time
        dateTime={imported.toISOString()}
        className="text-[var(--color-ink)]"
      >
        {humanDateTime(imported)}
      </time>{' '}
      <span className="text-[var(--color-mute-2)]">
        ({relativeTime(imported)})
      </span>
      {exported && (
        <>
          , from the WCA results export of{' '}
          <time
            dateTime={exported.toISOString()}
            className="text-[var(--color-ink)]"
          >
            {humanDate(exported)}
          </time>
          .
        </>
      )}
    </p>
  );
}

function humanDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function humanDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}
