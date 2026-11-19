import { expect, test, type Page } from '@playwright/test';
import { expectStageOff, STAGE_LIVE_TIMEOUT } from './stage-helpers';

/**
 * The cinematic acts of the home (docs/STORYBOARD.md, M1 acts 0–2 and the join).
 *
 * Forced to the `low` tier at reduced resolution: test machines render WebGL in software (see
 * stage.spec.ts). These tests check the mechanics — pinning, progress, reversal, the hand-over to
 * the layer panels, the stacked fallback — not the pixels (those are reviewed from screenshots,
 * `node scripts/act-shots.mjs`).
 */
type World = { depth: number; acts?: { surface: number; explode: number; join: number } };
const world = (page: Page) => page.evaluate(() => (window as unknown as { __world: World }).__world);
const scrollToVh = (page: Page, vh: number) => page.evaluate((v) => window.scrollTo(0, v * window.innerHeight), vh);
/** Scroll to a point of an act's pinned range (0 = its top at the top of the viewport, 1 = its end). */
const scrollToAct = (page: Page, act: string, at: number) =>
  page.evaluate(
    ([id, t]) => {
      const el = document.querySelector<HTMLElement>(`[data-act="${id}"]`) as HTMLElement;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + (el.offsetHeight - window.innerHeight) * (t as number));
    },
    [act, at] as const,
  );

test.describe('cinematic acts', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
  });

  test('the 3D starts after load without any interaction; the LCP element is the hero HTML', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    // No mouse, key or scroll: the stage must start on its own (STORYBOARD §3-2).
    await expect(page.locator('html')).toHaveAttribute('data-cinema', '');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'live', { timeout: STAGE_LIVE_TIMEOUT });
    const lcp = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { element?: Element | null })[];
            const el = entries.at(-1)?.element;
            resolve(el ? `${el.tagName.toLowerCase()}.${el.className}` : 'none');
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
    expect(lcp).toMatch(/^(p|h1|span)\.hero-/);
  });

  test('act progress follows the scroll and plays back in reverse', async ({ page }) => {
    test.setTimeout(150_000);
    const stills: string[] = [];
    page.on('request', (r) => /\/media\/act-/.test(r.url()) && stills.push(r.url()));
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    const headline = page.locator('#act-core-title');
    await expect(headline).not.toHaveAttribute('data-on');

    // End of act 1: the core lies in the frame and the act headline is lit.
    await scrollToAct(page, 'surface', 1);
    await expect.poll(async () => (await world(page)).acts?.surface ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.97);
    await expect(headline).toHaveAttribute('data-on', '');
    await expect(headline).toBeVisible();
    await expect(page.locator('section[data-act="surface"] [data-hero-content]')).toHaveAttribute('data-gone', '');
    // The wall waits at the surface while the camera moves (the wall's depth is not the scroll).
    expect((await world(page)).depth).toBeLessThan(0.05);

    // Act 2: the bands come apart and their labels (the layer index) appear over them.
    await scrollToAct(page, 'explode', 0.55);
    await expect.poll(async () => (await world(page)).acts?.explode ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
    await expect(page.locator('.band-labels li[data-on]').first()).toBeVisible();
    await expect(headline).not.toHaveAttribute('data-on');

    // Back to the top: everything plays in reverse.
    await scrollToVh(page, 0);
    await expect.poll(async () => (await world(page)).acts?.surface ?? 1, { timeout: 30_000 }).toBeLessThan(0.03);
    await expect(headline).not.toHaveAttribute('data-on');
    await expect(page.locator('.band-labels li[data-on]')).toHaveCount(0);
    await expect(page.locator('section[data-act="surface"] [data-hero-content]')).not.toHaveAttribute('data-gone');
    // The stills of the stacked version are never downloaded on the 3D path.
    expect(stills).toEqual([]);
  });

  test('the acts hand over to the layer panels on the same wall, with the navigator back', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    await scrollToAct(page, 'surface', 1);
    await expect(page.locator('html')).toHaveAttribute('data-act-on', '', { timeout: 30_000 });
    await expect(page.locator('.core-nav')).toHaveCSS('opacity', '0');

    await page.locator('section[data-layer="current"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect.poll(async () => (await world(page)).acts?.join ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.97);
    await expect(page.locator('html')).not.toHaveAttribute('data-act-on', { timeout: 30_000 });
    await expect(page.locator('.core-nav')).toHaveCSS('opacity', '1');
    // From here the wall follows the page again: its depth is the scroll position.
    const { depth, scroll } = await page.evaluate(() => ({
      depth: (window as unknown as { __world: World }).__world.depth,
      scroll: window.scrollY / window.innerHeight,
    }));
    expect(Math.abs(depth - scroll)).toBeLessThan(0.1);
    // No per-layer placeholder 3D any more (PM, M1 c).
    await expect(page.locator('.layer-stage')).toHaveCount(0);
  });

  test('the band labels are the layer index: real links, usable from the keyboard', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    const links = page.locator('.band-labels a');
    await expect(links).toHaveCount(11);
    // Focus enters the index while it is not on screen: it shows as a plain list.
    await links.nth(5).focus();
    await expect(links.nth(5)).toBeVisible();
    await page.keyboard.press('Enter');
    // Lenis takes anchor links over (smooth scroll), so check where the page went, not the URL.
    await expect
      .poll(() => page.locator('section[data-layer="auction"]').evaluate((el) => Math.abs(el.getBoundingClientRect().top)), { timeout: 30_000 })
      .toBeLessThan(120);
  });
});

test('reduced motion / static: the same story, stacked, with stills and no pinning', async ({ page }, testInfo) => {
  const stills: string[] = [];
  page.on('request', (r) => /\/media\/act-/.test(r.url()) && stills.push(r.url()));
  await page.goto(testInfo.project.name === 'reduced-motion' ? '/ja' : '/ja?quality=static', { waitUntil: 'networkidle' });
  await expectStageOff(page);
  // Not during the page load (they come in as they near the viewport).
  expect(stills).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-cinema');
  for (const still of ['core', 'explode']) {
    const image = page.locator(`.act-still-${still} .act-still-image`);
    await image.scrollIntoViewIfNeeded(); // stills load as they come near the viewport
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('background-image', new RegExp(`act-${still}-`));
  }
  await expect(page.locator('#act-core-title')).toBeVisible();
  await expect(page.locator('.band-labels a')).toHaveCount(11);
  await expect(page.locator('.band-labels a').first()).toBeVisible();
  // Not pinned: the surface section is only as tall as its content.
  const tall = await page.locator('section[data-act="surface"]').evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  expect(tall).toBeLessThan(2.6);
});
