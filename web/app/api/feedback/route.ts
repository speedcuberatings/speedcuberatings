import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Public feedback endpoint. Creates a GitHub issue in the configured repo.
 *
 * Env vars (set in Vercel):
 *   - GITHUB_FEEDBACK_TOKEN : fine-grained PAT with "Issues: Read and write"
 *                             on the feedback repo. Single-use; scope tight.
 *   - GITHUB_FEEDBACK_REPO  : "owner/repo", e.g. "speedcuberatings/speedcuberatings"
 *
 * No auth, no captcha, no rate limit yet. If this starts attracting spam,
 * first move: add Cloudflare Turnstile or a simple IP rate limit.
 */

const BODY_MIN = 5;
const BODY_MAX = 4000;
const EMAIL_MAX = 200;
const URL_MAX = 500;

interface Payload {
  body?: unknown;
  email?: unknown;
  pageUrl?: unknown;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function escapeBody(s: string): string {
  // Keep GitHub-flavoured markdown mostly safe: the user input goes inside
  // a quoted block, so nothing they type is interpreted as markdown at the
  // top level. We still strip pings to avoid noisy @-mentions.
  return s.replace(/@([a-zA-Z0-9_-]+)/g, '@\u200b$1');
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  if (!token || !repo) {
    return bad('Feedback endpoint not configured', 503);
  }

  let raw: Payload;
  try {
    raw = (await req.json()) as Payload;
  } catch {
    return bad('Invalid JSON');
  }

  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  const pageUrl = typeof raw.pageUrl === 'string' ? raw.pageUrl.trim() : '';

  if (body.length < BODY_MIN) return bad('Message is too short');
  if (body.length > BODY_MAX) return bad('Message is too long');
  if (email.length > EMAIL_MAX) return bad('Email is too long');
  if (pageUrl.length > URL_MAX) return bad('Page URL is too long');

  const firstLine = body.split('\n')[0]!.trim();
  const title =
    firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine || 'Feedback';

  const userAgent = req.headers.get('user-agent') ?? 'unknown';

  const issueBody = [
    '> Submitted via the in-site feedback form.',
    '',
    '### Message',
    '',
    escapeBody(body),
    '',
    '---',
    '',
    '**Page:** ' + (pageUrl ? pageUrl : '_not provided_'),
    '**Reply-to:** ' + (email ? '`' + email + '`' : '_not provided_'),
    '**User agent:** `' + userAgent.replace(/`/g, '') + '`',
  ].join('\n');

  const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[feedback] ${title}`,
      body: issueBody,
      labels: ['feedback', 'needs-triage'],
    }),
  });

  if (!ghRes.ok) {
    const text = await ghRes.text();
    console.error('[feedback] GitHub issue creation failed', ghRes.status, text);
    return bad('Could not file the issue. Please try again later.', 502);
  }

  const issue = (await ghRes.json()) as { html_url?: string; number?: number };
  return NextResponse.json({ url: issue.html_url, number: issue.number });
}
