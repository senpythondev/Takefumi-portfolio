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
// `dim` matches the hero light level in src/three/world/controller.ts (wide 1, narrow 0.34).
const POSTERS = [
  { file: 'poster-wide.webp', width: 1280, height: 720, query: 'q=high&t=3', quality: 0.55 },
  { file: 'poster-tall.webp', width: 640, height: 1280, query: 'q=high&t=3&dim=0.34', quality: 0.6 },
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
