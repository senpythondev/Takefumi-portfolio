/**
 * npm run screenshots -- [baseUrl] [outDir]
 * Captures the pages the PM review asks for (ja/en × desktop/mobile, plus reduced-motion)
 * from a running server. Full-page JPEGs keep the files small; Playwright writes no EXIF.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'docs/screenshots/phase-2';
mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'mobile', options: { ...devices['Pixel 7'], deviceScaleFactor: 2 } },
] as const;

const browser = await chromium.launch();
try {
  for (const locale of ['ja', 'en'] as const) {
    for (const target of targets) {
      const context = await browser.newContext({ ...target.options, locale });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/${locale}`, { waitUntil: 'networkidle' });
      const base = join(outDir, `${locale}-${target.name}`);
      await page.screenshot({ path: `${base}-first-view.jpg`, type: 'jpeg', quality: 80 });
      await page.screenshot({ path: `${base}-full.jpg`, type: 'jpeg', quality: 70, fullPage: true });
      // The evidence drawer, opened from the first metric on the page.
      // One image per layer for review (full-page captures are too tall to read).
      const sectionsFor = { 'ja-desktop': 'all', 'en-mobile': ['genten', 'deep'] } as const;
      const wanted = sectionsFor[`${locale}-${target.name}` as keyof typeof sectionsFor];
      if (wanted) {
        // Element captures scroll the page; a sticky header would be painted over the section.
        await page.addStyleTag({ content: '.site-header{position:static}' });
        for (const section of await page.locator('section.layer').all()) {
          const id = await section.getAttribute('data-layer');
          if (!id || (wanted !== 'all' && !(wanted as readonly string[]).includes(id))) continue;
          await section.screenshot({ path: join(outDir, `${locale}-${target.name}-layer-${id}.jpg`), type: 'jpeg', quality: 75 });
        }
      }
      await page.locator('button.metric').first().click();
      await page.locator('dialog.evidence[open]').waitFor();
      await page.waitForTimeout(400); // let the drawer finish sliding in
      await page.screenshot({ path: `${base}-evidence.jpg`, type: 'jpeg', quality: 80 });
      await context.close();
      console.log(`✔ ${locale} ${target.name}`);
    }
  }
} finally {
  await browser.close();
}
