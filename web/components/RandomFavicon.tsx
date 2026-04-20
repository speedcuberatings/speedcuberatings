'use client';

import { useEffect } from 'react';

// The six classic WCA face colours.
const WCA_COLORS = [
  '#f5f5f0', // white
  '#ffd73a', // yellow
  '#c03028', // red (tuned to our editorial crimson so it reads on brand)
  '#ff8c1a', // orange
  '#1a5fd8', // blue
  '#1fae4d', // green
] as const;

const TILE_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [3, 3],  [12, 3],  [21, 3],
  [3, 12], [12, 12], [21, 12],
  [3, 21], [12, 21], [21, 21],
];

function pick(): string {
  return WCA_COLORS[Math.floor(Math.random() * WCA_COLORS.length)]!;
}

/**
 * Generate a fresh scrambled 3x3 face as an inline SVG string. Each tile is
 * independently random across the six WCA colours — not a strictly "legal"
 * scramble, but visually indistinguishable from one at favicon size.
 */
function scrambledFaviconSvg(): string {
  const tiles = TILE_POSITIONS.map(
    ([x, y]) =>
      `<rect x="${x}" y="${y}" width="8" height="8" rx="1.25" fill="${pick()}"/>`,
  ).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="4" fill="#18171c"/>` +
    tiles +
    `</svg>`
  );
}

/**
 * Swap the document's favicon with a freshly scrambled cube face on mount.
 * The static `app/icon.svg` is still served for SSR / crawlers; this client
 * component overrides it once the page has hydrated.
 */
export function RandomFavicon() {
  useEffect(() => {
    const svg = scrambledFaviconSvg();
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    // Remove any existing <link rel="icon"> tags so we become the canonical one.
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = url;
    document.head.appendChild(link);
  }, []);

  return null;
}
