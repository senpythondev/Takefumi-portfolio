import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_URLS, EMAIL_PARTS } from '../../src/content/links.ts';

const LOCALES = ['ja', 'en'] as const;
const LAYER_IDS = ['surface', 'current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent', 'deep', 'catchup', 'bedrock', 'next'];
const ADDRESS = `${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}`;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

for (const locale of LOCALES) {
  test.describe(`/${locale}`, () => {
    test('renders every act as HTML, in order, without console errors', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`/${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveCount(1);
      const ids = await page.locator('section[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')));
      expect(ids).toEqual(LAYER_IDS);
      const acts = await page.locator('section[data-act]').evaluateAll((els) => els.map((e) => e.getAttribute('data-act')));
      expect(acts).toEqual(['surface', 'explode', ...LAYER_IDS.slice(1)]);
      await expect(page.locator('link[rel="alternate"][hreflang="ja"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
      expect(errors).toEqual([]);
    });

    test('every metric opens its evidence; Esc closes it and returns focus', async ({ page }) => {
      test.setTimeout(90_000); // one open/close round trip per number on the home
      await page.goto(`/${locale}`);
      const ids = await page.locator('a.metric').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-metric')))]);
      // The home keeps only the acts' numbers; the rest are on the case studies (phase-a.spec.ts).
      expect(ids.length).toBeGreaterThan(20);
      const dialog = page.locator('dialog#evidence-dialog');
      for (const id of ids) {
        const link = page.locator(`a.metric[data-metric="${id}"]`).first();
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await expect(dialog, `evidence for ${id}`).toBeVisible();
        await expect(dialog.locator('.evidence-figure')).toHaveText((await link.locator('.metric-value').textContent()) ?? '');
        await expect(page).toHaveURL(new RegExp(`/${locale}$`)); // the dialog opened in place of navigation
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(link).toBeFocused();
      }
    });

    test('the page carries one empty evidence dialog, and every metric links to its evidence page', async ({ page, request }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('dialog')).toHaveCount(1);
      await expect(page.locator('dialog#evidence-dialog .evidence-figure')).toHaveCount(0);
      const hrefs = await page.locator('a.metric').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href') ?? ''))]);
      for (const href of hrefs) {
        expect(href).toMatch(new RegExp(`^/${locale}/evidence/[a-z0-9-]+$`));
        expect((await request.get(href)).status(), href).toBe(200);
        expect((await request.get(`${href}/fragment`)).status(), `${href}/fragment`).toBe(200);
      }
    });

    test('evidence can be opened from a shared #ev-<id> URL', async ({ page }) => {
      await page.goto(`/${locale}#ev-genten-acc-genten`);
      await expect(page.locator('dialog#evidence-dialog')).toBeVisible();
      await expect(page.locator('dialog#evidence-dialog .evidence-figure')).toHaveText('100%');
    });

    test('evidence page: readable without JavaScript, links back and across languages', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(`/${locale}`);
      await page.locator('a.metric[data-metric="genten-acc-genten"]').first().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/evidence/genten-acc-genten$`));
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('.evidence-figure')).toHaveText('100%');
      await expect(page.locator('.evidence-chart svg[role="img"]')).toBeVisible();
      // Back to where the number is told in full: the Genten case study.
      await expect(page.locator('.evidence-back a')).toHaveAttribute('href', `/${locale}/work/genten`);
      const other = locale === 'ja' ? 'en' : 'ja';
      await expect(page.locator('a.action-lang')).toHaveAttribute('href', `/${other}/evidence/genten-acc-genten`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${locale}/evidence/genten-acc-genten$`));
      await context.close();
    });

    test('external links are only the allowlisted ones (CLAUDE.md §1-2)', async ({ page }) => {
      await page.goto(`/${locale}`);
      const hrefs = await page.locator('a[href^="http"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(ALLOWED_URLS, href).toContain(href);
      // The client has not consented yet: neither the link nor the domain may appear.
      expect(await page.content()).not.toContain('pegasus-job.com');
    });

    test('the e-mail address is never in the HTML, only assembled in the browser', async ({ page, request, context }) => {
      const html = await (await request.get(`/${locale}`)).text();
      expect(html).not.toContain(ADDRESS);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`/${locale}`);
      const link = page.locator('a.contact-address');
      await expect(link).toHaveText(ADDRESS);
      await expect(link).toHaveAttribute('href', `mailto:${ADDRESS}`);
      await page.locator('button.contact-copy').click();
      await expect(page.locator('.contact [role="status"]')).not.toBeEmpty();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ADDRESS);
    });

    test('no accessibility violations (WCAG 2.2 AA), page and open dialog', async ({ page }) => {
      await page.goto(`/${locale}`);
      const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
      const pageScan = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(pageScan.violations).toEqual([]);
      await page.locator('a.metric').first().click();
      await expect(page.locator('dialog.evidence[open] .evidence-figure')).toBeVisible();
      const dialogScan = await new AxeBuilder({ page }).include('dialog.evidence[open]').withTags(tags).analyze();
      expect(dialogScan.violations).toEqual([]);
      await page.goto(`/${locale}/evidence/genten-acc-genten`);
      const evidencePageScan = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(evidencePageScan.violations).toEqual([]);
    });

    test('no horizontal overflow at this viewport', async ({ page }) => {
      await page.goto(`/${locale}`);
      // Compare with the device width: on mobile, overflowing content silently widens the
      // layout viewport (innerWidth), so comparing with innerWidth alone would always pass.
      const deviceWidth = page.viewportSize()?.width ?? 0;
      const { inner, scroll } = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
      expect(inner).toBe(deviceWidth);
      expect(scroll).toBeLessThanOrEqual(deviceWidth);
    });

    test('all content is readable without JavaScript', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(`/${locale}`);
      await expect(page.locator('section[data-layer]')).toHaveCount(LAYER_IDS.length);
      for (const id of LAYER_IDS) await expect(page.locator(`section[data-layer="${id}"] h1, section[data-layer="${id}"] h2`).first()).toBeVisible();
      await expect(page.locator('.contact-fallback')).toBeVisible();
      await expect(page.locator('#summary')).toBeVisible();
      await context.close();
    });

    // @visual: font rendering differs between machines until Phase 4 self-hosts subset fonts,
    // so these baselines are checked locally and excluded on CI (re-baselined on CI in Phase 4).
    test('visual: first view, Genten evaluation, evidence drawer', { tag: '@visual' }, async ({ page }) => {
      // font-display: optional keeps the fallback for a page view whose fonts arrive late (parallel
      // test load): warm the cache with one visit, then compare the second.
      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${locale}-first-view.png`);
      await page.goto(`/${locale}/work/genten`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.genten-eval')).toHaveScreenshot(`${locale}-genten-eval.png`);
      await page.locator('a.metric[data-metric="genten-acc-genten"]').first().click();
      await expect(page.locator('dialog#evidence-dialog .evidence-figure')).toBeVisible();
      await expect(page.locator('dialog#evidence-dialog')).toHaveScreenshot(`${locale}-evidence.png`);
    });
  });
}

test('/ redirects by Accept-Language', async ({ browser }) => {
  // `locale` sets the browser's Accept-Language (device presets would otherwise override a raw header).
  for (const [locale, expected] of [
    ['ja-JP', '/ja'],
    ['en-US', '/en'],
  ] as const) {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe(expected);
    await context.close();
  }
});

test('reduced motion: the drawer opens without animation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'reduced-motion', 'only meaningful with prefers-reduced-motion');
  await page.goto('/ja');
  await page.locator('a.metric').first().click();
  const animation = await page.locator('dialog.evidence[open]').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});
