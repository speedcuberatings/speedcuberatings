'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Minimal streaming chat UI for /ask. POSTs to /api/ask and consumes an SSE
 * response. The MCP ask_question tool is one-shot, so we fold the full
 * conversation history into each request server-side.
 *
 * SSE events we handle:
 *   - status   : connection state (currently informational only)
 *   - progress : partial content chunks (appended to the in-flight answer)
 *   - final    : the full answer text (overrides any accumulated progress)
 *   - error    : error message
 */

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
}

export function AskChat() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [history]);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    const priorHistory = history
      .filter((t) => !t.pending && !t.error)
      .map((t) => ({ role: t.role, content: t.content }));

    setInput('');
    setBusy(true);
    setHistory((h) => [
      ...h,
      { role: 'user', content: question },
      { role: 'assistant', content: '', pending: true },
    ]);

    const updateAssistant = (patch: Partial<Turn>) =>
      setHistory((h) => {
        const next = h.slice();
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = { ...next[i], ...patch };
            break;
          }
        }
        return next;
      });

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: priorHistory }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => 'Request failed');
        updateAssistant({ content: msg || 'Request failed', pending: false, error: true });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let progressText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames: blocks separated by blank lines.
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let event = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;

          let payload: unknown;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === 'progress') {
            const p = payload as { message?: string };
            if (p.message) {
              progressText += p.message;
              updateAssistant({ content: progressText, pending: true });
            }
          } else if (event === 'final') {
            const p = payload as { text?: string; isError?: boolean };
            updateAssistant({
              content: p.text ?? '',
              pending: false,
              error: !!p.isError,
            });
          } else if (event === 'error') {
            const p = payload as { message?: string };
            updateAssistant({
              content: p.message ?? 'Something went wrong.',
              pending: false,
              error: true,
            });
          }
        }
      }
    } catch (err) {
      updateAssistant({
        content: err instanceof Error ? err.message : 'Network error',
        pending: false,
        error: true,
      });
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={scrollRef}
        className="min-h-[320px] max-h-[60vh] overflow-y-auto rounded-sm border rule bg-[color-mix(in_srgb,var(--color-paper)_92%,#000_0%)] px-4 sm:px-6 py-5"
      >
        {history.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-5">
            {history.map((t, i) => (
              <li key={i}>
                <div className="eyebrow mb-1">
                  {t.role === 'user' ? 'You' : 'Devin'}
                </div>
                <div
                  className={[
                    'text-[15px] leading-[1.6]',
                    t.error
                      ? 'text-[var(--color-accent)] whitespace-pre-wrap'
                      : 'text-[var(--color-ink)]',
                    t.pending && !t.content ? 'text-[var(--color-muted)] italic' : '',
                  ].join(' ')}
                >
                  {t.pending && !t.content ? (
                    'Thinking…'
                  ) : t.role === 'assistant' && !t.error ? (
                    <>
                      <AssistantMarkdown text={t.content} />
                      {t.pending && (
                        <span className="ml-1 inline-block w-2 animate-pulse">▍</span>
                      )}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap">{t.content}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={3}
          maxLength={4000}
          disabled={busy}
          placeholder="Ask about the rating model, the ingest pipeline, or anything else in this repo…"
          className="w-full resize-y rounded-sm border rule bg-[var(--color-paper)] px-3 py-2 text-[14px] leading-[1.5] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ink)]/30"
        />
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[var(--color-muted)]">
            Enter to send · Shift+Enter for newline
          </span>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-sm border rule px-4 py-1.5 text-[13px] tracking-[0.04em] text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-ink)] transition-colors"
          >
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="ask-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a
              {...props}
              className="ink-link"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="font-mono text-[0.9em] px-1 py-[1px] rounded-sm bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]"
                {...rest}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function EmptyState() {
  const examples = [
    'How does the rating model weight older results?',
    'What does the calibration sandbox do?',
    'Where is the WCA data ingested and transformed?',
  ];
  return (
    <div className="flex flex-col gap-3 text-[var(--color-muted)]">
      <p className="text-[14px]">Try asking:</p>
      <ul className="flex flex-col gap-1.5 text-[14px] text-[var(--color-ink)]/80">
        {examples.map((e) => (
          <li key={e} className="italic">
            — {e}
          </li>
        ))}
      </ul>
    </div>
  );
}
