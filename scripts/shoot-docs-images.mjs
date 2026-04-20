/**
 * Regenerate the README/social images in `docs/` by screenshotting the live
 * site. Uses Playwright because rendering Fraunces + Manrope + the event
 * icon font correctly off-browser is a hassle, and the live site is the
 * source of truth for the brand anyway.
 *
 * One-time setup (kept out of the web package's deps so it doesn't bloat
 * regular installs):
 *   pnpm dlx playwright@latest install chromium
 *
 * Run:
 *   pnpm dlx --package=playwright@latest node scripts/shoot-docs-images.mjs
 *
 * Or if you'd rather pin a version, add it as a devDep to web/ temporarily,
 * run `node scripts/shoot-docs-images.mjs` from the web/ directory, and
 * remove the dep once you're happy with the output.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '..', 'docs');
fs.mkdirSync(docsDir, { recursive: true });

const SITE = process.env.SITE ?? 'https://speedcuberatings.com';

const shots = [
  // README banner. ~2:1 wide.
  {
    name: 'hero.jpg',
    url: `${SITE}/rankings/333?metric=average`,
    viewport: { width: 1774, height: 887 },
    clip: { x: 0, y: 0, width: 1774, height: 887 },
  },
  // Square brand / social card.
  {
    name: 'Profile.jpg',
    url: `${SITE}/rankings/333?metric=average`,
    viewport: { width: 1254, height: 1254 },
    clip: { x: 0, y: 0, width: 1254, height: 1254 },
  },
];

const browser = await chromium.launch();
for (const shot of shots) {
  const ctx = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(shot.url, { waitUntil: 'networkidle' });
  // Fonts + the staggered reveal animation.
  await page.waitForTimeout(1500);
  const buf = await page.screenshot({
    type: 'jpeg',
    quality: 92,
    clip: shot.clip,
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
