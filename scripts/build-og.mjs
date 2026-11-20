// Link-preview images (OGP / X cards): a capture of the real hero, 1200×630, one per language.
//   node scripts/build-og.mjs <baseUrl>      (a running build: `npm run build && npx next start`)
// Writes public/media/og/{ja,en}.jpg. Re-run after the hero changes. The 3D runs at the high tier
// (software rendering works; it is slow). Small UI that makes no sense in a still is hidden.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3000'] = process.argv.slice(2);
mkdirSync('public/media/og', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
for (const locale of ['ja', 'en']) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/${locale}?quality=high`);
  await page.waitForFunction(() => document.documentElement.dataset.world === 'live', null, { timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.nav-hint, .sound-toggle, .depth-meter, .cursor, .cursor-spark, .core-nav, .core-toggle, .dig, .today-layer, .world-drill-meter { display: none !important; }' });
  // The borehole finishes drilling and the strata light up.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `public/media/og/${locale}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 });
  console.log(`public/media/og/${locale}.jpg`);
  await page.context().close();
}
await browser.close();
