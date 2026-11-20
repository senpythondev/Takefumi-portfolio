// Dev helper: screenshots of every act of the cinematic home (docs/STORYBOARD.md v2.1) at its
// beats — entry, story, result — with the 3D live at a chosen tier. One page load per viewport.
//   node scripts/phase-shots.mjs <baseUrl> <outDir> [WxH ...]
//   env: SHOT_PATH (default /ja?quality=high&debug=1), SHOT_ACTS (comma list of act ids),
//        SHOT_BEATS (comma list of name:fraction, default entry:0.1,story:0.45,result), SHOT_WAIT (ms)
// The output folder is for review only (docs/screenshots/ is not committed).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3000', out = 'docs/screenshots/phase-a', ...sizes] = process.argv.slice(2);
const path = process.env.SHOT_PATH ?? '/ja?quality=high&debug=1';
const only = process.env.SHOT_ACTS ? process.env.SHOT_ACTS.split(',') : null;
const beats = (process.env.SHOT_BEATS ?? 'entry:0.1,story:0.45,result').split(',').map((b) => {
  const [name, f] = b.split(':');
  return { name, f: f === undefined ? null : Number(f) };
});
const wait = Number(process.env.SHOT_WAIT ?? 7000);
mkdirSync(out, { recursive: true });

// Act lengths and pauses (src/content/acts.ts): the result beat is just before the pause ends.
const ACTS = {
  surface: [200, 0],
  explode: [150, 0],
  current: [175, 25],
  genten: [325, 25],
  pegasus: [275, 25],
  'php-audit': [325, 25],
  auction: [305, 25],
  patent: [275, 25],
  deep: [220, 20],
  catchup: [140, 20],
  bedrock: [140, 20],
  next: [150, 0],
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
  // The debug HUD (needed for the state log) is hidden in the pictures.
  await page.addStyleTag({ content: '.debug-hud { display: none !important; } nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/00-hero-${size}.png` });
  let n = 1;
  for (const [id, [len, pause]] of Object.entries(ACTS)) {
    if (only && !only.includes(id)) {
      n += 1;
      continue;
    }
    for (const beat of beats) {
      const f = beat.f ?? (pause ? 0.85 - pause / len - 0.02 : 0.7);
      const y = await page.evaluate(
        ([act, frac, l]) => {
          const el = document.querySelector(`[data-act="${act}"]`);
          if (!el) return -1;
          const top = el.getBoundingClientRect().top + window.scrollY;
          // The pinned length is the act's `len` times the tuning scale (src/lib/scroll/tune.ts).
          const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--act-scale')) || 1.5;
          return top + frac * (l / 100) * scale * window.innerHeight;
        },
        [id, f, len],
      );
      if (y < 0) continue;
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(wait);
      const name = `${String(n).padStart(2, '0')}-${id}-${beat.name}-${size}`;
      await page.screenshot({ path: `${out}/${name}.png` });
      const state = await page.evaluate(() => JSON.stringify((window).__world ?? {}));
      console.log(name, state.slice(0, 220));
    }
    n += 1;
  }
  if (errors.length) console.log(size, 'errors:', [...new Set(errors)].slice(0, 6).join('\n').slice(0, 1500));
  await context.close();
}
await browser.close();
