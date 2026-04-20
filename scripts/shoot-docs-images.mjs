/**
 * Render evergreen brand images for docs/ (README hero + social square).
 *
 * These are *not* screenshots of live leaderboards — they're branded
 * compositions using the site's design tokens (paper cream, Fraunces,
 * Manrope, JetBrains Mono, crimson accent). Keeps them stable as the
 * underlying rating data changes.
 *
 * Playwright is used for rendering rather than @vercel/og / Satori
 * because (a) the target dimensions are non-standard OG sizes and
 * (b) Playwright + Chromium handles subpixel text hinting the way
 * the live site does.
 *
 * One-time setup:
 *   pnpm dlx playwright@latest install chromium
 *
 * Run:
 *   pnpm dlx --package=playwright@latest node scripts/shoot-docs-images.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');
const fontsDir = path.join(repoRoot, 'web', 'lib', 'og-fonts-files');
fs.mkdirSync(docsDir, { recursive: true });

const b64 = (file) =>
  fs.readFileSync(path.join(fontsDir, file)).toString('base64');
const FONTS = {
  fraunces: b64('fraunces-500.ttf'),
  fraunces_italic: b64('fraunces-500-italic.ttf'),
  manrope: b64('manrope-500.ttf'),
  jbmono: b64('jbmono-500.ttf'),
};

const COLORS = {
  paper: '#f4efe6',
  ink: '#18171c',
  muted: '#6b6558',
  accent: '#c03028',
  rule: '#d6ccb8',
};

// Embedded cube-mark glyph matching the site's OG CubeMark.
const CUBE_TILES = ['#f5f5f0', '#ffd73a', '#c03028', '#ff8c1a', '#1a5fd8', '#1fae4d'];
const cubeTiles = () => {
  const out = [];
  for (let i = 0; i < 9; i++) out.push(CUBE_TILES[(i * 2 + Math.floor(i / 3)) % CUBE_TILES.length]);
  return out;
};

function cubeMarkHtml(size = 44) {
  const tile = Math.round(size * (16 / 56));
  const gap = Math.round(size * (4 / 56));
  const pad = Math.round(size * (6 / 56));
  const radius = Math.max(2, Math.round(tile / 8));
  const tiles = cubeTiles();
  const rows = [0, 1, 2]
    .map(
      (r) => `
      <div style="display:flex;gap:${gap}px;">
        ${[0, 1, 2]
          .map(
            (c) =>
              `<div style="width:${tile}px;height:${tile}px;background:${tiles[r * 3 + c]};border-radius:${radius}px;"></div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');
  return `
    <div style="display:flex;flex-direction:column;gap:${gap}px;padding:${pad}px;background:${COLORS.ink};border-radius:${Math.round(pad * 1.3)}px;">
      ${rows}
    </div>
  `;
}

const sharedCss = `
  @font-face { font-family: 'Fraunces'; font-weight: 500; font-style: normal;
    src: url(data:font/ttf;base64,${FONTS.fraunces}) format('truetype'); }
  @font-face { font-family: 'Fraunces'; font-weight: 500; font-style: italic;
    src: url(data:font/ttf;base64,${FONTS.fraunces_italic}) format('truetype'); }
  @font-face { font-family: 'Manrope'; font-weight: 500; font-style: normal;
    src: url(data:font/ttf;base64,${FONTS.manrope}) format('truetype'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 500; font-style: normal;
    src: url(data:font/ttf;base64,${FONTS.jbmono}) format('truetype'); }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${COLORS.paper}; color: ${COLORS.ink};
    font-family: Manrope, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  /* Subtle paper noise, matches the live site's body texture. */
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.05;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }
  .eyebrow {
    font-family: Manrope; font-size: 22px; letter-spacing: 3px;
    text-transform: uppercase; color: ${COLORS.muted};
  }
  .footer-mono {
    font-family: 'JetBrains Mono'; font-size: 18px; letter-spacing: 1px;
    color: ${COLORS.muted};
  }
  .footer-body { font-family: Manrope; font-size: 18px; color: ${COLORS.muted}; }
  .rule-top { border-top: 1px solid ${COLORS.rule}; padding-top: 22px; }
`;

function heroHtml() {
  // 1774x887 — wide README banner. Upscaled from the 1200x630 home OG.
  return `
<!doctype html>
<html><head><meta charset="utf-8"><style>${sharedCss}
  .frame { width: 1774px; height: 887px; padding: 92px 104px;
    display: flex; flex-direction: column; justify-content: space-between; }
  .header { display: flex; align-items: center; gap: 24px; }
  .display {
    font-family: Fraunces; font-weight: 500; font-size: 172px;
    line-height: 0.95; letter-spacing: -4px; margin: 0;
  }
  .display .accent { font-style: italic; color: ${COLORS.accent}; }
  .sub {
    font-family: Manrope; font-size: 38px; line-height: 1.35;
    color: ${COLORS.muted}; max-width: 1280px; margin-top: 36px;
  }
  .footer { display: flex; justify-content: space-between; align-items: baseline; }
</style></head>
<body>
  <div class="frame">
    <div class="header">
      ${cubeMarkHtml(64)}
      <span class="eyebrow">Speedcube Ratings</span>
    </div>
    <div>
      <h1 class="display">A different way<br/>to read the <span class="accent">leaderboard.</span></h1>
      <p class="sub">Hourly performance ratings from the official WCA results export.<br/>Rating model by James Macdiarmid.</p>
    </div>
    <div class="footer rule-top">
      <span class="footer-mono">speedcuberatings.com</span>
      <span class="footer-body">Based on WCA results · updated hourly</span>
    </div>
  </div>
</body></html>`;
}

function profileHtml() {
  // 1254x1254 — square brand card. Composition is wordmark-centric so it
  // reads cleanly in a square (the "different way to read the leaderboard"
  // line only works in 2:1).
  return `
<!doctype html>
<html><head><meta charset="utf-8"><style>${sharedCss}
  .frame { width: 1254px; height: 1254px; padding: 120px 104px 104px 104px;
    display: flex; flex-direction: column; justify-content: space-between; }
  .top-row { display: flex; align-items: center; gap: 28px; }
  .wordmark-block { display: flex; flex-direction: column; gap: 36px; }
  .wordmark {
    font-family: Fraunces; font-weight: 500; font-size: 224px;
    line-height: 0.88; letter-spacing: -7px; margin: 0;
    display: flex; flex-direction: column;
  }
  .wordmark .italic {
    font-style: italic; color: ${COLORS.accent};
    margin-left: -6px;
  }
  .tag {
    font-family: Fraunces; font-size: 46px; line-height: 1.25;
    color: ${COLORS.ink}; max-width: 1020px; margin: 0;
  }
  .tag .accent { font-style: italic; color: ${COLORS.accent}; }
  .sub {
    font-family: Manrope; font-size: 26px; line-height: 1.4;
    color: ${COLORS.muted}; margin: 20px 0 0 0; max-width: 1020px;
  }
  .footer { display: flex; justify-content: space-between; align-items: baseline; }
</style></head>
<body>
  <div class="frame">
    <div class="top-row">
      ${cubeMarkHtml(96)}
      <span class="eyebrow" style="font-size:28px;">Speedcube Ratings</span>
    </div>
    <div class="wordmark-block">
      <h1 class="wordmark">
        <span>Speedcube</span>
        <span class="italic">Ratings.</span>
      </h1>
      <div>
        <p class="tag">An independent performance <span class="accent">leaderboard</span> for the speedcubing community.</p>
        <p class="sub">Hourly ratings from the official WCA results export. Rating model by James Macdiarmid.</p>
      </div>
    </div>
    <div class="footer rule-top">
      <span class="footer-mono">speedcuberatings.com</span>
      <span class="footer-body">Based on WCA results</span>
    </div>
  </div>
</body></html>`;
}

const shots = [
  {
    name: 'hero.jpg',
    html: heroHtml(),
    viewport: { width: 1774, height: 887 },
  },
  {
    name: 'Profile.jpg',
    html: profileHtml(),
    viewport: { width: 1254, height: 1254 },
  },
];

const browser = await chromium.launch();
for (const shot of shots) {
  const ctx = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.setContent(shot.html, { waitUntil: 'networkidle' });
  // Let fonts finish decoding.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const buf = await page.screenshot({
    type: 'jpeg',
    quality: 92,
    clip: { x: 0, y: 0, width: shot.viewport.width, height: shot.viewport.height },
  });
  const outPath = path.join(docsDir, shot.name);
  fs.writeFileSync(outPath, buf);
  console.log(
    `wrote ${path.relative(process.cwd(), outPath)} (${buf.length} bytes, ` +
      `${shot.viewport.width}x${shot.viewport.height}@2x)`,
  );
  await ctx.close();
}
await browser.close();
