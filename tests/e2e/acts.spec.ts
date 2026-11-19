import { expect, test, type Page } from '@playwright/test';
import { expectStageOff, STAGE_LIVE_TIMEOUT } from './stage-helpers';

/**
 * The cinematic home (docs/STORYBOARD.md v2.1): acts 0–7, the split core as the index, a world
 * for every section.
 *
 * Forced to the `low` tier at reduced resolution: test machines render WebGL in software (see
 * stage.spec.ts). These tests check the mechanics — the story position, the worlds being there,
 * the flights, the stacked fallback — not the pixels (those are reviewed from screenshots,
 * `node scripts/phase-shots.mjs`).
 */
type World = { act?: string; p?: number; phase?: string; inWorld?: boolean; worlds?: string[]; hub?: boolean; bands?: ([number, number] | null)[]; acts?: { surface: number; explode: number } };
const world = (page: Page) => page.evaluate(() => (window as unknown as { __world: World }).__world);
const LOW = '/ja?quality=low&dpr=0.4&debug=1';
const WORLD_ACTS = ['current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent', 'deep', 'catchup', 'bedrock', 'next'];

/** Scroll to a point of an act's pinned range (0 = its first frame, 1 = its last). */
const scrollToAct = (page: Page, act: string, at: number) =>
  page.evaluate(
    ([id, t]) => {
      const el = document.querySelector<HTMLElement>(`[data-act="${id}"]`) as HTMLElement;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const end = el.querySelector<HTMLElement>('[data-act-end]');
      const length = end ? end.getBoundingClientRect().bottom + window.scrollY - top - window.innerHeight : el.offsetHeight - window.innerHeight;
      window.scrollTo(0, top + length * (t as number));
    },
    [act, at] as const,
  );

test.describe('cinematic acts', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
  });

  test('the 3D starts after load without any interaction; the LCP element is the hero HTML', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(LOW);
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

  test('the story follows the scroll through acts 1–2 and plays back in reverse', async ({ page }) => {
    test.setTimeout(150_000);
    const stills: string[] = [];
    page.on('request', (r) => /\/media\/act-/.test(r.url()) && stills.push(r.url()));
    await page.goto(LOW);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    const surface = page.locator('section[data-act="surface"]');
    await expect(surface).not.toHaveAttribute('data-lit');

    // End of act 1: the core lies in the frame and the act headline inks in.
    await scrollToAct(page, 'surface', 1);
    await expect.poll(async () => (await world(page)).acts?.surface ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.97);
    await expect(surface).toHaveAttribute('data-lit', '');
    await expect(page.locator('#act-core-title')).toBeVisible();
    await expect(surface.locator('[data-hero-content]')).toHaveAttribute('data-gone', '');

    // Act 2: the bands come apart, their labels (the index) appear, the guide shows.
    await scrollToAct(page, 'explode', 0.7);
    await expect.poll(async () => (await world(page)).hub, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('.band-labels li[data-on]').first()).toBeVisible();
    await expect(page.locator('section[data-act="explode"]')).toHaveAttribute('data-hub', '');
    await expect(surface).not.toHaveAttribute('data-lit');

    // Back to the top: everything plays in reverse.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await world(page)).acts?.surface ?? 1, { timeout: 30_000 }).toBeLessThan(0.03);
    await expect(page.locator('.band-labels li[data-on]')).toHaveCount(0);
    await expect(surface.locator('[data-hero-content]')).not.toHaveAttribute('data-gone');
    // The stills of the stacked version are never downloaded on the 3D path.
    expect(stills).toEqual([]);
  });

  test('every section has its world: the camera and the 3D keep going to the end', async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto(LOW);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    for (const id of WORLD_ACTS) {
      await scrollToAct(page, id, 0.45);
      await expect
        .poll(async () => {
          const w = await world(page);
          return w.act === id && (id === 'next' ? !!w.worlds?.includes('next') : !!w.inWorld);
        }, { timeout: 60_000, message: `${id}: its world is on screen` })
        .toBe(true);
      const section = page.locator(`section[data-act="${id}"]`);
      await expect(section).toHaveAttribute('data-on', '');
      // Only the act's neighbours stay mounted (CLAUDE.md §3).
      expect(((await world(page)).worlds ?? []).length).toBeLessThanOrEqual(3);
    }
    // The finale's drawer: the empty band opens as its content rises.
    await page.locator('#finale-drawer').scrollIntoViewIfNeeded();
    await expect(page.locator('#finale-drawer')).toHaveAttribute('data-open', '', { timeout: 30_000 });
  });

  test('the split core is the index: focus brings a band forward, Enter flies into its world', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto(LOW);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    await scrollToAct(page, 'explode', 0.7);
    await expect.poll(async () => (await world(page)).hub, { timeout: 30_000 }).toBe(true);
    const links = page.locator('.band-labels a');
    await expect(links).toHaveCount(11);
    const auction = page.locator('.band-labels a[data-band-link="auction"]');
    await auction.focus();
    await expect(page.locator('.band-labels li[data-layer="auction"]')).toHaveAttribute('data-hover', '', { timeout: 15_000 });
    await page.keyboard.press('Enter');
    // The flight: straight to the act's first frame, then through the cut face into the world.
    await expect.poll(async () => (await world(page)).act, { timeout: 30_000 }).toBe('auction');
    await expect.poll(async () => (await world(page)).p ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.12);
    await expect(page).toHaveURL(/#layer-auction$/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 30_000 }).toBe('layer-auction-title');
  });

  test('a band clicked in 3D flies into its world', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto(LOW);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    await scrollToAct(page, 'explode', 0.7);
    await expect.poll(async () => (await world(page)).hub, { timeout: 30_000 }).toBe(true);
    const band = (await world(page)).bands?.[2]; // Genten
    expect(band).toBeTruthy();
    const [x, y] = band as [number, number];
    await page.mouse.move(x, y);
    await expect.poll(async () => (await world(page)).hub && (await page.evaluate(() => document.querySelector('.band-labels li[data-layer="genten"]')?.hasAttribute('data-hover'))), { timeout: 30_000 }).toBe(true);
    await page.mouse.click(x, y);
    await expect.poll(async () => (await world(page)).act, { timeout: 30_000 }).toBe('genten');
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
  const all = page.locator('.act-still');
  expect(await all.count()).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < (await all.count()); i += 1) {
    const image = all.nth(i).locator('.act-still-image');
    await image.scrollIntoViewIfNeeded(); // stills load as they come near the viewport
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('background-image', /\/media\/act-[a-z-]+-(wide|tall)\.webp/);
  }
  // Every act tells its part: headline, numbers, the case study.
  for (const id of WORLD_ACTS) {
    const section = page.locator(`section[data-act="${id}"]`);
    await expect(section.locator('.act-headline')).toBeVisible();
    if (id !== 'next' && id !== 'bedrock') await expect(section.locator('.act-case')).toBeVisible();
  }
  await expect(page.locator('#act-core-title')).toBeVisible();
  await expect(page.locator('.band-labels a')).toHaveCount(11);
  await expect(page.locator('.band-labels a').first()).toBeVisible();
  // Not pinned: the surface section is only as tall as its content.
  const tall = await page.locator('section[data-act="surface"]').evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  expect(tall).toBeLessThan(2.6);
});
