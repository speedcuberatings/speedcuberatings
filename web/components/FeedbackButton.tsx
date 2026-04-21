'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Floating "Send feedback" button anchored in the bottom-right corner of
 * every page. Opens a minimal modal that POSTs to /api/feedback, which
 * files a GitHub issue. A labeled issue kicks off a Devin triage session
 * via GitHub Actions (see .github/workflows/feedback-triage.yml).
 *
 * No auth, no spam protection yet — fine for low traffic. Revisit if
 * we start getting garbage issues.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pathname = usePathname();

  // Autofocus when opened; reset when closed.
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 30);
    } else {
      // Only wipe fields after the "sent" state has been shown for a beat.
      if (status !== 'sending') {
        setBody('');
        setEmail('');
        setStatus('idle');
        setErrorMsg(null);
        setIssueUrl(null);
      }
    }
  }, [open, status]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || status === 'sending') return;
    setStatus('sending');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          email: email.trim() || null,
          pageUrl: typeof window !== 'undefined' ? window.location.href : pathname,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Request failed (${res.status})`);
      }
      const payload = (await res.json()) as { url?: string };
      setIssueUrl(payload.url ?? null);
      setStatus('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-5 right-5 z-40
                   inline-flex items-center gap-2
                   border rule rounded-full
                   bg-[var(--color-paper)] hover:bg-[var(--color-paper-2)]
                   px-4 py-2.5 text-[12px] tracking-[0.08em] uppercase
                   text-[var(--color-ink)]
                   shadow-[0_2px_10px_rgba(24,23,28,0.08)]
                   transition-colors cursor-pointer
                   [touch-action:manipulation]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M2 3.5h10v6H7.5L5 12V9.5H2z" strokeLinejoin="round" />
        </svg>
        Feedback
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close feedback dialog"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[rgba(24,23,28,0.35)] backdrop-blur-[1px]
                       cursor-default"
          />

          <form
            onSubmit={submit}
            className="relative w-full max-w-[520px]
                       bg-[var(--color-paper)] border rule rounded-[4px]
                       shadow-[0_8px_40px_rgba(24,23,28,0.18)]
                       p-6 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="eyebrow mb-1">Feedback</p>
                <h2
                  className="font-display text-[1.75rem] leading-[1.05] text-[var(--color-ink)]"
                  style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 500' }}
                >
                  Send <span className="italic text-[var(--color-accent)]">feedback</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)]
                           text-[18px] leading-none p-1 -mr-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            {status === 'sent' ? (
              <div className="text-[14px] text-[var(--color-ink-soft)] leading-relaxed">
                <p className="mb-2">
                  Thanks — filed as an issue. We&apos;ll take a look.
                </p>
                {issueUrl && (
                  <p className="mb-4">
                    <a
                      href={issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ink-link"
                    >
                      View on GitHub ↗
                    </a>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center min-h-[40px] px-5
                             bg-[var(--color-ink)] text-[var(--color-paper)]
                             text-[12px] tracking-[0.08em] uppercase
                             rounded-[2px] cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mb-4">
                  Found a bug, a weird rating, or have a feature idea? This
                  opens a public GitHub issue — please don&apos;t include
                  anything sensitive.
                </p>

                <label className="block text-[12px] tracking-[0.06em] uppercase
                                  text-[var(--color-muted)] mb-1.5"
                       htmlFor="feedback-body">
                  Message
                </label>
                <textarea
                  id="feedback-body"
                  ref={textareaRef}
                  required
                  rows={5}
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What would you like to tell us?"
                  className="w-full bg-[var(--color-paper-2)] border rule rounded-[2px]
                             px-3 py-2.5 text-[14px] leading-relaxed
                             text-[var(--color-ink)]
                             placeholder:text-[var(--color-mute-2)]
                             focus:outline-none focus:border-[var(--color-rule-strong)]
                             resize-y min-h-[120px]"
                />

                <label className="block text-[12px] tracking-[0.06em] uppercase
                                  text-[var(--color-muted)] mt-4 mb-1.5"
                       htmlFor="feedback-email">
                  Email <span className="normal-case tracking-normal text-[11px]">(optional, if you want a reply)</span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[var(--color-paper-2)] border rule rounded-[2px]
                             px-3 py-2 text-[14px]
                             text-[var(--color-ink)]
                             placeholder:text-[var(--color-mute-2)]
                             focus:outline-none focus:border-[var(--color-rule-strong)]"
                />

                {status === 'error' && errorMsg && (
                  <p className="mt-3 text-[13px] text-[var(--color-down)]">
                    {errorMsg}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-[12px] tracking-[0.08em] uppercase
                               text-[var(--color-muted)] hover:text-[var(--color-ink)]
                               px-3 py-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!body.trim() || status === 'sending'}
                    className="inline-flex items-center justify-center min-h-[40px] px-5
                               bg-[var(--color-ink)] text-[var(--color-paper)]
                               text-[12px] tracking-[0.08em] uppercase
                               rounded-[2px]
                               disabled:opacity-40 disabled:cursor-not-allowed
                               cursor-pointer"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
