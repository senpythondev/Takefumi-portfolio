// Dev helper: screenshots of the explaining layer of the cinematic home (docs/STORYBOARD.md v2.4
// §12–§13) — for every section its title card, each of the four beats and the held result — with
// the 3D live at a chosen tier. One page load per viewport.
//   node scripts/beat-shots.mjs <baseUrl> <outDir> [WxH ...]
//   env: SHOT_PATH (default /ja?quality=high&debug=1), SHOT_ACTS (comma list of act ids)
// The output folder is for review only (docs/screenshots/ is not committed).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3000', out = 'docs/screenshots/phase-a3', ...sizes] = process.argv.slice(2);
const path = process.env.SHOT_PATH ?? '/ja?quality=high&debug=1';
const only = process.env.SHOT_ACTS ? process.env.SHOT_ACTS.split(',') : null;
mkdirSync(out, { recursive: true });

// Act lengths, pauses and where beats ②–④ begin (src/content/acts.ts).
const ACTS = {
  current: [175, 25, [0.1, 0.5, 0.66]],
  genten: [325, 25, [0.17, 0.34, 0.86]],
  pegasus: [275, 25, [0.2, 0.5, 0.92]],
  'php-audit': [325, 25, [0.2, 0.6, 0.98]],
  auction: [305, 25, [0.36, 0.7, 0.92]],
  patent: [275, 25, [0.12, 0.6, 0.8]],
  deep: [220, 20, null],
  catchup: [140, 20, null],
  bedrock: [140, 20, null],
  next: [150, 0, null],
};

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
for (const size of sizes.length ? sizes : ['1440x900', '390x844']) {
  const [width, height] = size.split('x').map(Number);
  const mobile = width < 700;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  await page.waitForFunction(() => document.documentElement.dataset.world === 'live', null, { timeout: 180000 }).catch(() => errors.push('world not live'));
  await page.addStyleTag({ content: '.debug-hud { display: none !important; } nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(4000);
  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${name}-${size}.png`, timeout: 180000 });
    const state = await page.evaluate(() => {
      const w = window.__world ?? {};
      const s = document.querySelector(`[data-act="${w.act}"]`);
      return JSON.stringify({ act: w.act, p: Math.round((w.p ?? 0) * 1000) / 1000, beat: s?.dataset.beat, card: s?.hasAttribute('data-card'), result: s?.hasAttribute('data-result') });
    });
    console.log(`${name}-${size}`, state);
  };
  // The picture has come to rest: the story position has not changed for a while.
  const settle = async (min = 1500) => {
    await page.waitForTimeout(min);
    for (let i = 0; i < 120; i += 1) {
      if (!(await page.evaluate(() => window.__world?.moving ?? false))) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1800);
  };
  const goto = async (act, frac, len) => {
    await page.evaluate(
      ([id, f, l]) => {
        const el = document.querySelector(`[data-act="${id}"]`);
        const top = el.getBoundingClientRect().top + window.scrollY;
        const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--act-scale')) || 1.5;
        window.scrollTo(0, top + f * (l / 100) * scale * window.innerHeight);
      },
      [act, frac, len],
    );
  };
  if (!only) {
    // The hero: the hint, and the stardust drawn to the pointer.
    if (!mobile) {
      await page.mouse.move(width * 0.3, height * 0.55);
      await page.mouse.move(width * 0.62, height * 0.42, { steps: 12 });
      await page.waitForTimeout(1800);
    }
    await shot('00-hero-stardust');
  }
  let n = 1;
  for (const [id, [len, pause, cuts]] of Object.entries(ACTS)) {
    const prefix = `${String(n).padStart(2, '0')}-${id}`;
    n += 1;
    if (only && !only.includes(id)) continue;
    const result = 0.85 - pause / len;
    if (id === 'next') {
      await goto(id, 0.9, len);
      await settle(3000);
      await shot(`${prefix}-ledger`);
      continue;
    }
    await goto(id, 0.152, len);
    await settle(4500);
    await shot(`${prefix}-0-card`);
    if (cuts) {
      const edges = [0.15, ...cuts.map((c) => 0.15 + c * (result - 0.15)), result];
      for (let b = 0; b < 4; b += 1) {
        // Past the point where the beat starts playing; the picture then rests at the end of the beat.
        await goto(id, edges[b] + 0.6 * (edges[b + 1] - edges[b]), len);
        await settle(b === 3 ? 1000 : 2500);
        if (b < 3) await shot(`${prefix}-${b + 1}-beat`);
      }
      await goto(id, result + (0.85 - result) * 0.5, len);
      await settle(3500);
      await shot(`${prefix}-4-result`);
    } else {
      await goto(id, 0.15 + 0.5 * (result - 0.15), len);
      await settle(2500);
      await shot(`${prefix}-1-story`);
      await goto(id, result + (0.85 - result) * 0.5, len);
      await settle(2500);
      await shot(`${prefix}-2-result`);
    }
  }
  if (errors.length) console.log(size, 'errors:', [...new Set(errors)].slice(0, 6).join('\n').slice(0, 1500));
  await context.close();
}
await browser.close();
