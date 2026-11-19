import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, expect, test, type Page } from '@playwright/test';

/**
 * PM_REVIEW_07 §3-1, STORYBOARD §3-2: the 3D starts loading by itself right after load, so a
 * visitor's first tap may land while the 3D code is being loaded and evaluated. That tap must still
 * get a quick response (INP).
 *
 * Mobile profile, CPU 4×, 3D forced on (?quality=medium: this machine renders WebGL in software,
 * which would otherwise mean 'static'). The tap is on plain text, as soon as the 3D load has begun
 * (`data-stage="loading"`). INP for that interaction = the longest Event Timing entry with its
 * interactionId (input delay + processing + time to the next paint). "warm" repeats the visit with
 * the 3D chunks already in the HTTP cache — the worst case, since the code is then ready to
 * evaluate at once. Writes perf-results/first-input.json. Target: under 200 ms (CLAUDE.md §4).
 */
async function firstInteraction(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __events: PerformanceEventTiming[] };
    w.__events = [];
    new PerformanceObserver((list) => w.__events.push(...(list.getEntries() as PerformanceEventTiming[]))).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
  // As soon as the 3D load has begun (on a warm cache it may already be live).
  await expect(page.locator('html')).toHaveAttribute('data-stage', /^(loading|live)$/, { timeout: 30_000 });
  const tappedDuring = await page.evaluate(() => document.documentElement.dataset.stage ?? '');
  const box = await page.locator('.layer-surface p').first().boundingBox();
  if (!box) throw new Error('no text to tap');
  await page.touchscreen.tap(box.x + 10, box.y + box.height / 2);
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'live', { timeout: 60_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const events = (window as unknown as { __events: PerformanceEventTiming[] }).__events.filter((e) => e.interactionId > 0);
    const first = Math.min(...events.map((e) => e.interactionId));
    const mine = events.filter((e) => e.interactionId === first);
    const start = performance.getEntriesByName('stage:start')[0]?.startTime ?? 0;
    const live = performance.getEntriesByName('stage:live')[0]?.startTime ?? 0;
    return {
      tappedDuring: '',
      inp: Math.max(...mine.map((e) => e.duration)),
      events: mine.map((e) => ({ type: e.name, duration: e.duration, delay: e.processingStart - e.startTime })),
      startToLive: Math.round(live - start),
    };
  }).then((r) => ({ ...r, tappedDuring }));
}

test('first interaction stays responsive while the 3D loads (informational)', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const results: Record<string, { inp: number; startToLive: number }[]> = { cold: [], warm: [] };
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const phase of ['cold', 'warm'] as const) {
      await page.goto('/ja?quality=medium', { waitUntil: 'load' });
      const r = await firstInteraction(page);
      results[phase]?.push({ inp: r.inp, startToLive: r.startToLive });
      console.log(`[${phase} ${run}] tap while ${r.tappedDuring}: INP ${r.inp} ms (${r.events.map((e) => `${e.type} ${e.duration}`).join(', ')}), stage live ${r.startToLive} ms after the load began`);
    }
    await context.close();
  }
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/first-input.json', JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
});
