// Dev helper: screenshots of the cinematic acts (docs/STORYBOARD.md) at scroll positions, one page
// load per viewport, with the 3D live. Positions are in viewport heights of scroll.
//   node scripts/act-shots.mjs <baseUrl> <outDir> [WxH ...]
//   env: ACT_PATH (default /ja?quality=high), ACT_STOPS (comma list of vh), ACT_WAIT (ms per stop),
//        ACT_BARE=1 hides the page's HTML (for the stacked version's stills)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3000', out = 'docs/screenshots/m1', ...sizes] = process.argv.slice(2);
const path = process.env.ACT_PATH ?? '/ja?quality=high';
const stops = (process.env.ACT_STOPS ?? '0,0.3,0.6,1,1.4,1.8,2.2,2.6,3,3.4,3.8,4.2,4.6,5,5.4').split(',').map(Number);
const wait = Number(process.env.ACT_WAIT ?? 6000);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const size of sizes.length ? sizes : ['1440x810', '390x844']) {
  const [width, height] = size.split('x').map(Number);
  const mobile = width < 700;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  // Act 0: the poster with the borehole being drilled, before the wall is live.
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'loading', null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: `${out}/${size}-act0-loading.png` });
  await page.waitForFunction(() => document.documentElement.dataset.world === 'live', null, { timeout: 180000 }).catch(() => errors.push('world not live'));
  // Opacity, not visibility: the act text sets `visibility: visible` on itself.
  if (process.env.ACT_BARE) await page.addStyleTag({ content: 'main, header, footer, .site-header, .site-footer, .core-nav, .core-toggle, .depth-meter { opacity: 0 !important; } nextjs-portal { display: none !important; }' });
  for (const vh of stops) {
    await page.evaluate((v) => window.scrollTo(0, v * window.innerHeight), vh);
    await page.waitForTimeout(wait);
    const name = `${size}-${String(vh.toFixed(2)).replace('.', '_')}vh`;
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(name, await page.evaluate(() => `y=${Math.round(scrollY)} act-on=${document.documentElement.hasAttribute('data-act-on')} layer=${document.documentElement.dataset.layer ?? ''}`));
  }
  if (errors.length) console.log(size, [...new Set(errors)].slice(0, 4).join('\n').slice(0, 1200));
  await context.close();
}
await browser.close();
