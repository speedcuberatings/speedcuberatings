import 'server-only';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

/**
 * Font loader for `next/og` ImageResponse. Satori requires TTF/OTF as
 * ArrayBuffer. We read from local files (committed in
 * `web/lib/og-fonts-files/`) instead of fetching from the network at
 * render time — Google Fonts' CSS API serves WOFF2 by default which
 * Satori can't parse, and UA-sniffing to coax TTF out of it is brittle.
 */

const FILES_DIR = path.resolve(process.cwd(), 'lib/og-fonts-files');

interface FontSpec {
  name: string;
  file: string;
  weight: 500;
  style: 'normal' | 'italic';
}

const SPECS: readonly FontSpec[] = [
  { name: 'Fraunces', file: 'fraunces-500.ttf', weight: 500, style: 'normal' },
  {
    name: 'Fraunces',
    file: 'fraunces-500-italic.ttf',
    weight: 500,
    style: 'italic',
  },
  { name: 'Manrope', file: 'manrope-500.ttf', weight: 500, style: 'normal' },
  { name: 'JetBrains Mono', file: 'jbmono-500.ttf', weight: 500, style: 'normal' },
];

const cache = new Map<string, Promise<Buffer>>();

async function load(file: string): Promise<Buffer> {
  const existing = cache.get(file);
  if (existing) return existing;
  const p = fsp.readFile(path.join(FILES_DIR, file));
  cache.set(file, p);
  return p;
}

export async function loadOgFonts() {
  const buffers = await Promise.all(SPECS.map((s) => load(s.file)));
  return SPECS.map((s, i) => ({
    name: s.name,
    data: buffers[i]!,
    weight: s.weight,
    style: s.style,
  }));
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_COLORS = {
  paper: '#f4efe6',
  ink: '#18171c',
  muted: '#6b6558',
  accent: '#c03028',
  rule: '#d6ccb8',
} as const;
