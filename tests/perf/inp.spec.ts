import { devices, expect, test, type Page } from '@playwright/test';

/**
 * INP gate (CLAUDE.md §4: INP ≤ 200 ms; it stays a pass/fail condition for the home — PM decision
 * 2026-11-19). Lighthouse measures page loads only, so INP is measured here: real interactions on
 * the home, mobile profile, CPU 4× slower, after the page has settled (3D running or not).
 *
 * INP per interaction = the longest Event Timing entry with that interactionId (input delay +
 * processing + time to the next paint). The page's INP is the worst of them.
 */
type Entry = { name: string; duration: number; interactionId: number; startTime: number };

async function interactions(page: Page) {
  return page.evaluate(() => {
    const entries = (window as unknown as { __events: Entry[] }).__events.filter((e) => e.interactionId > 0);
    const byId = new Map<number, Entry[]>();
    for (const e of entries) byId.set(e.interactionId, [...(byId.get(e.interactionId) ?? []), e]);
    return [...byId.values()].map((es) => ({ inp: Math.max(...es.map((e) => e.duration)), events: es.map((e) => `${e.name} ${e.duration}`).join(', ') }));
  });
}

for (const locale of ['ja', 'en'] as const) {
  test(`INP on /${locale}: evidence dialog, keyboard close, plain tap (mobile, CPU 4×)`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __events: PerformanceEntry[] };
      w.__events = [];
      new PerformanceObserver((list) => w.__events.push(...list.getEntries())).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`/${locale}`);
    await expect(page.locator('html')).toHaveAttribute('data-stage', /^(off|live)$/, { timeout: 90_000 });
    await page.waitForTimeout(1000);

    // 1. Tap a number in the hero: the evidence dialog opens.
    const metric = page.locator('.chips a.metric').first();
    const box = await metric.boundingBox();
    if (!box) throw new Error('no metric to tap');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('dialog#evidence-dialog')).toBeVisible();
    await page.waitForTimeout(500);
    // 2. Close it from the keyboard.
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog#evidence-dialog')).toBeHidden();
    await page.waitForTimeout(300);
    // 3. A tap on plain text.
    const text = await page.locator('.hero-lead').boundingBox();
    if (!text) throw new Error('no text to tap');
    await page.touchscreen.tap(text.x + 10, text.y + text.height / 2);
    await page.waitForTimeout(500);

    const results = await interactions(page);
    for (const r of results) console.log(`[${locale}] INP ${r.inp} ms (${r.events})`);
    expect(results.length, 'interactions recorded').toBeGreaterThanOrEqual(3);
    expect(Math.max(...results.map((r) => r.inp)), 'worst interaction (INP)').toBeLessThanOrEqual(200);
    await context.close();
  });
}

/**
 * The cinema's own interactions (STORYBOARD v2.1 §1, §5): choosing a band in the index (the flight
 * into its world) and moving a slider. The stage is forced on (`low`, reduced resolution: CI renders
 * WebGL in software); the 3D frames compete with the interactions, as they do on a real phone.
 */
test('INP in the cinema: a band chosen in the index, a slider moved (mobile, CPU 4×)', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __events: PerformanceEntry[] };
    w.__events = [];
    new PerformanceObserver((list) => w.__events.push(...list.getEntries())).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
  await page.goto('/ja?quality=low&dpr=0.4&debug=1');
  await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 120_000 });
  // Into the index (act 2), then throttle: the interactions are measured, not the loading.
  await page.locator('section[data-act="explode"]').evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + ((el as HTMLElement).offsetHeight - window.innerHeight) * 0.7);
  });
  // The split is a key moment with its own tempo (§9): wait until the index is there and at rest.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __world: { hub?: boolean } }).__world.hub), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(2500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1000);
  const link = page.locator('.band-labels a[data-band-link="auction"]');
  const box = await link.boundingBox();
  if (!box) throw new Error('no band label to tap');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __world: { act?: string } }).__world.act), { timeout: 60_000 }).toBe('auction');
  await page.waitForTimeout(3000);
  const slider = page.locator('[data-control="bidders"]');
  await slider.focus();
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  const results = await interactions(page);
  for (const r of results) console.log(`[cinema] INP ${r.inp} ms (${r.events})`);
  expect(results.length, 'interactions recorded').toBeGreaterThanOrEqual(3);
  expect(Math.max(...results.map((r) => r.inp)), 'worst interaction (INP)').toBeLessThanOrEqual(200);
  await context.close();
});
