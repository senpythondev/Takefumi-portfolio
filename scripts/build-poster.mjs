/**
 * Renders the hero poster from the real wall shader (docs/concept/ART_DIRECTION.md), so the page
 * shows the same picture before the 3D loads and in the static tier.
 *
 *   npm run dev            (the /lab/wall page exists only in development)
 *   npm run poster         → public/media/poster-wide.webp, poster-tall.webp
 *
 * Re-run after changing src/three/materials/wall.ts or the layer colour tokens.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3000';
// `dim` matches the hero light level in src/three/world/controller.ts (wide 1, narrow 0.28).
// `shaft=-1`: no borehole — act 0 drills it down the poster in CSS while the 3D loads.
// Sizes: the page scales the poster to the viewport height and anchors it at the borehole
// (globals.css .world-poster), so the wide one is 2.4:1 and the tall one 3:4 to cover most screens.
const POSTERS = [
  { file: 'poster-wide.webp', width: 1728, height: 720, query: 'q=high&t=3&shaft=-1', quality: 0.5 },
  { file: 'poster-tall.webp', width: 768, height: 1024, query: 'q=high&t=3&dim=0.28&shaft=-1', quality: 0.6 },
];

mkdirSync('public/media', { recursive: true });
const browser = await chromium.launch();
for (const p of POSTERS) {
  const page = await browser.newPage({ viewport: { width: p.width, height: p.height } });
  await page.goto(`${base}/lab/wall?${p.query}`);
  await page.waitForFunction(() => Number(document.documentElement.dataset.wall ?? 0) >= 1, null, { timeout: 180_000 });
  const dataUrl = await page.evaluate((q) => window.__wall.webp(q), p.quality);
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(`public/media/${p.file}`, bytes);
  console.log(`${p.file}: ${p.width}×${p.height}, ${(bytes.length / 1024).toFixed(1)} KB`);
  await page.close();
}
await browser.close();
