'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Outcome = { ok: true } | { ok: false; error: string };

/**
 * Toolbar of config-I/O buttons for the calibration page.
 *
 *   [ Reset ] [ Copy URL ] [ Export JSON ] [ Import JSON ]
 *
 * The Import button doubles as a drop target: dragging a .json file
 * anywhere onto the button triggers the same import flow as picking a
 * file via the hidden <input>.
 *
 * Toasts after each action live in a small ephemeral span to the right
 * of the buttons. All button styles follow the editorial palette —
 * paper-tone with thin rules and a crimson accent on hover.
 */
export function JsonPortControls({
  onReset,
  onExport,
  onImport,
  onCopyUrl,
}: {
  onReset: () => void;
  onExport: () => void;
  onImport: (json: string) => Outcome;
  onCopyUrl: () => Promise<Outcome>;
}) {
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const outcome = onImport(text);
        if (outcome.ok) flash('ok', 'imported');
        else flash('err', outcome.error);
      } catch (err) {
        flash('err', String((err as Error)?.message ?? err));
      }
    },
    [onImport, flash],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <Btn
        label="Reset"
        onClick={() => {
          onReset();
          flash('ok', 'reset to default');
        }}
      />
      <Btn
        label="Copy URL"
        onClick={async () => {
          const outcome = await onCopyUrl();
          if (outcome.ok) flash('ok', 'URL copied');
          else flash('err', outcome.error);
        }}
      />
      <Btn
        label="Export JSON"
        onClick={() => {
          onExport();
          flash('ok', 'JSON exported');
        }}
      />
      <label
        className="inline-flex items-center justify-center min-h-[28px] px-3 border rule rounded-[2px]
                   text-[12px] tracking-[0.06em] uppercase cursor-pointer
                   text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]
                   [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        title="Click to pick a file, or drop a .json file onto this button"
      >
        Import JSON
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            // allow re-picking the same file
            e.target.value = '';
          }}
        />
      </label>
      {toast && (
        <span
          className={[
            'eyebrow !tracking-[0.12em] text-[10px] whitespace-nowrap',
            toast.kind === 'ok'
              ? 'text-[var(--color-up)]'
              : 'text-[var(--color-accent)]',
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </span>
      )}
    </div>
  );
}

function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[28px] px-3 border rule rounded-[2px]
                 text-[12px] tracking-[0.06em] uppercase cursor-pointer
                 text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]
                 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
    >
      {label}
    </button>
  );
}
