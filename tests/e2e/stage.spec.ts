import { expect, test, type Page } from '@playwright/test';
import { expectStageOff, startStage } from './stage-helpers';

type Info = { geometries: number; textures: number; programs: number; calls: number };

const info = (page: Page) => page.evaluate(() => (window as unknown as { __stage: { info: () => Info } }).__stage.info());

async function scrollThrough(page: Page, direction: 'down' | 'up') {
  const ids = await page.locator('section.layer[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer') as string));
  for (const id of direction === 'down' ? ids : [...ids].reverse()) {
    await page.locator(`section[data-layer="${id}"]`).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(250);
  }
  if (direction === 'up') await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

test.describe('3D stage', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
  });

  test('mounts one canvas / one WebGL context, without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/ja?quality=high&debug=1');
    await startStage(page); // the stage loads on the first interaction, once the page listens
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect.poll(async () => (await info(page)).geometries, { timeout: 10_000 }).toBeGreaterThan(0);
    await scrollThrough(page, 'down');
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('scrolling top → bottom → top three times does not grow GPU resources', async ({ page }) => {
    test.setTimeout(150_000); // six full passes over 11 layers with software-rendered WebGL
    await page.goto('/ja?quality=high&debug=1');
    await startStage(page); // the stage loads on the first interaction, once the page listens
    // three.js counts resources once uploaded; offscreen neighbours upload on first view.
    // So the reference is the steady state after one full round trip, not the first paint.
    await scrollThrough(page, 'down');
    await scrollThrough(page, 'up');
    const steady = await info(page);
    // Each placeholder scene owns one geometry (at most current ± 1 = 3 resident) + 1 shared by the 3D core.
    expect(steady.geometries).toBeLessThanOrEqual(4);
    for (let i = 0; i < 2; i += 1) {
      await scrollThrough(page, 'down');
      expect((await info(page)).geometries).toBeLessThanOrEqual(4);
      await scrollThrough(page, 'up');
    }
    await expect
      .poll(async () => {
        const now = await info(page);
        return [now.geometries, now.textures, now.programs];
      }, { timeout: 10_000 })
      .toEqual([steady.geometries, steady.textures, steady.programs]);
  });

  test('auto-degrade: under heavy CPU throttling the stage steps down to static without breaking', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/ja?quality=medium&adaptive=1&debug=1');
    await startStage(page); // the stage loads on the first interaction, once the page listens
    const cdp = await page.context().newCDPSession(page);
    // 20×: this test proves the degrade path, so the slowdown must be unambiguous on any machine.
    // (At 6× a fast runner may legitimately hold ≥ 40 fps and stay at medium — that case is the
    // "25 fps or more" half of PM_REVIEW_03 §8, measured by `npm run perf`.)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    // PerformanceMonitor lowers the tier step by step; at 'static' the canvas is disposed.
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 90_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await expect(page.locator('html')).not.toHaveAttribute('data-stage', 'live');
    await expect(page.locator('.layer-stage-still').first()).toHaveCSS('opacity', '1');
    await expect(page.locator('section[data-layer="genten"] h2')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('?quality=static loads no 3D at all', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
    await page.goto('/ja?quality=static', { waitUntil: 'networkidle' });
    await expectStageOff(page); // decided after hydration, so the interaction below is a real test
    await page.mouse.move(10, 10);
    await page.waitForTimeout(1500);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByName('stage:start').length)).toBe(0);
  });
});

test('reduced motion loads no 3D, Lenis or GSAP', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'reduced-motion', 'only with prefers-reduced-motion');
  await page.goto('/ja', { waitUntil: 'networkidle' });
  await expectStageOff(page);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1500);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByName('stage:start').length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains('lenis'))).toBe(false);
});
