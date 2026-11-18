import { expect, test } from '@playwright/test';
import { STAGE_LIVE_TIMEOUT } from './timeouts';

test.describe('boring core, depth meter, evidence extras, HUD', () => {
  test('the core has one ring link per layer and fills rings as layers are passed', async ({ page }) => {
    await page.goto('/ja');
    const rings = page.locator('nav.core-nav a.core-ring');
    await expect(rings).toHaveCount(11);
    await expect(rings.first()).toHaveAttribute('aria-current', 'location');
    await page.locator('section[data-layer="auction"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.locator('a.core-ring[href="#layer-auction"]')).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('a.core-ring[data-passed]')).toHaveCount(6);
    await expect(page.locator('.depth-meter')).toContainText('ライブオークション');
  });

  test('a ring can be used from the keyboard to jump to its layer', async ({ page }) => {
    await page.goto('/en');
    await page.locator('a.core-ring[href="#layer-genten"]').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#layer-genten$/);
    await expect(page.locator('a.core-ring[href="#layer-genten"]')).toHaveAttribute('aria-current', 'location');
  });

  test('Genten evidence shows a labelled chart, and the evidence link can be copied', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'clipboard permission flow covered on desktop');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/ja#ev-genten-acc-genten');
    const dialog = page.locator('dialog#evidence-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('svg[role="img"]')).toHaveAttribute('aria-label', /100%/);
    const copy = dialog.locator('button.evidence-copy');
    await expect(copy).toBeVisible();
    await copy.click();
    // The copied link is the evidence's own page (PM_REVIEW_07 §2-1), which works without JS.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https?:\/\/[^/]+\/ja\/evidence\/genten-acc-genten$/);
  });

  test('the standalone evidence page has no copy button (its URL is the link)', async ({ page }) => {
    await page.goto('/ja/evidence/genten-acc-genten');
    await expect(page.locator('.evidence-figure')).toHaveText('100%');
    await expect(page.locator('button.evidence-copy')).toHaveCount(0);
  });

  test('without ?debug the HUD code is never downloaded (PM_REVIEW_05 §2-4)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'once is enough');
    test.setTimeout(60_000);
    const urls: string[] = [];
    page.on('response', (r) => r.request().resourceType() === 'script' && urls.push(r.url()));
    await page.goto('/ja?quality=low', { waitUntil: 'networkidle' });
    await page.mouse.move(20, 20); // also load the stage and the first scenes
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'live', { timeout: STAGE_LIVE_TIMEOUT });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.debug-hud')).toHaveCount(0);
    for (const url of urls) {
      const body = await (await page.request.get(url)).text();
      expect(body.includes('debug-hud'), `${url} must not contain the HUD`).toBe(false);
    }
  });

  test('?debug=1 HUD records 10 s and outputs JSON', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'once is enough');
    test.setTimeout(40_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/ja?debug=1');
    const hud = page.locator('.debug-hud');
    await expect(hud).toBeVisible();
    await hud.locator('button').click();
    const out = hud.locator('textarea');
    await expect(out).toBeVisible({ timeout: 15_000 });
    const json = JSON.parse(await out.inputValue()) as { fpsAvg: number; durationMs: number; device: { dpr: number } };
    expect(json.durationMs).toBe(10_000);
    expect(json.fpsAvg).toBeGreaterThan(0);
    expect(json.device.dpr).toBeGreaterThan(0);
  });
});
