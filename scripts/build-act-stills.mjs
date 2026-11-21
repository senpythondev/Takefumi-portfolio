/**
 * Renders the stills of the stacked story (static tier, reduced motion, no JS — ActStill) from the
 * real scene: the page at the high tier, its HTML hidden, each act at its result beat.
 *
 *   npm run build && npx next start -p 3300
 *   node scripts/build-act-stills.mjs http://localhost:3300 [act ...]
 *   → public/media/act-<id>-wide.webp (1280×720) and act-<id>-tall.webp (640×1280)
 *
 * Re-run after a change to a world (src/three/worlds/*) or to acts 1–2.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3000', ...only] = process.argv.slice(2);
// Act lengths and pauses (src/content/acts.ts) → the fraction of each act to capture.
const ACTS = {
  surface: 0.97,
  explode: 0.7,
  current: 0.68,
  genten: 0.5,
  'site-migration': 0.7,
  'php-audit': 0.74,
  auction: 0.45,
  patent: 0.7,
  deep: 0.5,
  catchup: 0.45,
  bedrock: 0.5,
  next: 0.7,
};
const SIZES = [
  { suffix: 'wide', width: 1280, height: 720, mobile: false, quality: 0.55 },
  { suffix: 'tall', width: 640, height: 1280, mobile: true, quality: 0.55 },
];

mkdirSync('public/media', { recursive: true });
const browser = await chromium.launch();
for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, hasTouch: size.mobile, isMobile: size.mobile });
  const page = await context.newPage();
  await page.goto(`${base}/ja?quality=high`);
  await page.waitForFunction(() => document.documentElement.dataset.world === 'live', null, { timeout: 180_000 });
  await page.addStyleTag({ content: 'main, header, footer, .site-header, .site-footer, .core-nav, .core-toggle, .depth-meter, .cursor { opacity: 0 !important; } nextjs-portal { display: none !important; }' });
  for (const [id, at] of Object.entries(ACTS)) {
    if (only.length && !only.includes(id)) continue;
    await page.evaluate(
      ([act, f]) => {
        const el = document.querySelector(`[data-act="${act}"]`);
        const top = el.getBoundingClientRect().top + window.scrollY;
        const end = el.querySelector('[data-act-end]');
        const length = end ? end.getBoundingClientRect().bottom + window.scrollY - top - window.innerHeight : el.offsetHeight - window.innerHeight;
        window.scrollTo(0, top + length * f);
      },
      [id, at],
    );
    await page.waitForTimeout(9000);
    const png = await page.screenshot();
    // PNG → WebP in the browser (no image library needed).
    const webp = await page.evaluate(
      async ([b64, q]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas.toDataURL('image/webp', q);
      },
      [png.toString('base64'), size.quality],
    );
    const bytes = Buffer.from(webp.split(',')[1], 'base64');
    writeFileSync(`public/media/act-${id}-${size.suffix}.webp`, bytes);
    console.log(`act-${id}-${size.suffix}.webp ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  await context.close();
}
await browser.close();
