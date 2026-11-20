import { expect, test } from '@playwright/test';

/**
 * Firefox (Gecko) behaviour, on a desktop viewport (final QA round, 2026-11-20). The cinema itself is
 * exercised in Chromium; here: every kind of page renders, the evidence opens and closes, the
 * keyboard reaches the content, nothing overflows and nothing throws — with the 3D on if this
 * Firefox has WebGL, and as the static version if it has not.
 */
for (const locale of ['ja', 'en'] as const) {
  test(`/${locale} renders, evidence opens and closes, no overflow, no errors`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${locale}`);
    await expect(page.locator('section[data-layer]')).toHaveCount(11);
    await expect(page.locator('html')).toHaveAttribute('data-stage', /^(off|live)$/, { timeout: 90_000 });
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // The keyboard: the first Tab is the skip link, and it goes to the content.
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    // A number in the hero opens its evidence; Escape closes it and focus comes back.
    const metric = page.locator('.chips a.metric').first();
    await metric.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog#evidence-dialog');
    await expect(dialog.locator('.evidence-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(metric).toBeFocused();
    expect(errors).toEqual([]);
  });

  test(`/${locale}: a case study, an evidence page and the 404 page`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${locale}/work/genten`);
    await expect(page.locator('article.work h1')).toBeVisible();
    await expect(page.locator('.genten-eval')).toBeVisible();
    await page.goto(`/${locale}/evidence/genten-acc-genten`);
    await expect(page.locator('article.evidence-panel')).toBeVisible();
    const res = await page.goto(`/${locale}/no-such-page`);
    expect(res?.status()).toBe(404);
    await expect(page.locator(`section[lang="${locale}"] a`)).toHaveAttribute('href', `/${locale}`);
    expect(errors).toEqual([]);
  });
}
