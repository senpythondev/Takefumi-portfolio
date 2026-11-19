// Dev helper: screenshots of the real page with the 3D stage live.
//   node scripts/page-shots.mjs <baseUrl> <outDir> <name|path|WxH|scrollVh|pointerX,pointerY>...
import { chromium } from '@playwright/test';
const [base, out, ...shots] = process.argv.slice(2);
const browser = await chromium.launch();
for (const shot of shots) {
  const [name, path = '/ja?quality=high', size = '1440x810', scroll = '0', pointer = ''] = shot.split('|');
  const [width, height] = size.split('x').map(Number);
  const mobile = width < 700;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  if (!path.includes('static')) {
    await page.waitForFunction(() => ['armed', 'loading', 'live'].includes(document.documentElement.dataset.stage ?? ''), null, { timeout: 60000 });
    await page.mouse.move(30, 30);
    await page.waitForFunction(() => document.documentElement.dataset.world === 'live', null, { timeout: 120000 }).catch(() => errors.push('world not live'));
  }
  if (Number(scroll) > 0) await page.evaluate((vh) => window.scrollTo(0, vh * window.innerHeight), Number(scroll));
  if (pointer) {
    const [px, py] = pointer.split(',').map(Number);
    await page.mouse.move(px * width, py * height);
  } else await page.mouse.move(2, height - 2);
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 3500));
  await page.screenshot({ path: `${out}/${name}.png` });
  if (errors.length) console.log(name, [...new Set(errors)].slice(0, 4).join('\n').slice(0, 1200));
  await context.close();
}
await browser.close();
