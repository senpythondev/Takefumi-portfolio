import { expect, test } from '@playwright/test';
import { startStage } from '../e2e/stage-helpers';

/**
 * Safari-specific behaviour, checked with Playwright's WebKit (PM_REVIEW_03 §8-3) on an iPhone-sized
 * viewport. Runs on CI (the runner installs WebKit's system libraries); the real iPhone check is Phase 6.
 */
for (const locale of ['ja', 'en'] as const) {
  test(`/${locale} renders, evidence opens and closes, no overflow, no errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${locale}`);
    await expect(page.locator('section[data-layer]')).toHaveCount(11);
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const metric = page.locator('a.metric[data-metric="auction-errors"]').first();
    await metric.scrollIntoViewIfNeeded();
    await metric.click();
    const dialog = page.locator('dialog#evidence-dialog');
    await expect(dialog.locator('.evidence-figure')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('3D stage mounts a single canvas in WebKit (forced medium)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/ja?quality=low&dpr=0.4');
  await startStage(page, async (p) => {
    await p.touchscreen.tap(20, 300).catch(() => undefined);
    await p.mouse.move(20, 20);
  });
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
