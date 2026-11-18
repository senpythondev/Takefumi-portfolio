import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, expect, test } from '@playwright/test';

/**
 * Substitute measurement (PM_REVIEW_03 §8, PM_REVIEW_05 §3.2): long tasks right after the first
 * interaction, attributed to the boot steps by the performance marks in src/three/boot.ts.
 * Target: every long task ≤ 100 ms at 4× CPU throttling. Software WebGL here, so GPU time is not
 * representative; JS parse/evaluate and React/R3F setup are.
 */
const MARKS = ['stage:start', 'stage:effects', 'stage:3d', 'stage:scenes', 'stage:live'];
const cases = [
  { name: 'mobile-medium-4x', device: devices['Pixel 7'], quality: 'medium', rate: 4 },
  { name: 'mobile-medium-6x', device: devices['Pixel 7'], quality: 'medium', rate: 6 },
  { name: 'desktop-high-4x', device: { viewport: { width: 1440, height: 900 } }, quality: 'high', rate: 4 },
] as const;

for (const c of cases) {
  test(`stage startup long tasks: ${c.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ ...c.device });
    const page = await context.newPage();
    await page.goto(`/ja?quality=${c.quality}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const w = window as unknown as { __lt: Array<{ start: number; duration: number }> };
      w.__lt = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: false });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: c.rate });
    await page.mouse.move(30, 30);
    if (c.device === devices['Pixel 7']) await page.touchscreen.tap(30, 300).catch(() => undefined);
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'live', { timeout: 60_000 });
    await page.waitForTimeout(8000);
    const result = await page.evaluate((names) => {
      const marks = Object.fromEntries(names.map((n) => [n, performance.getEntriesByName(n)[0]?.startTime ?? null]));
      const lt = (window as unknown as { __lt: Array<{ start: number; duration: number }> }).__lt;
      const phaseOf = (t: number) => {
        let phase = 'before stage';
        for (const n of names) if (marks[n] !== null && t >= (marks[n] as number)) phase = n;
        return phase;
      };
      return { marks, tasks: lt.map((x) => ({ ...x, phase: phaseOf(x.start) })) };
    }, MARKS);
    const max = Math.max(0, ...result.tasks.map((t) => t.duration));
    const blocking = result.tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
    mkdirSync('test-results/perf', { recursive: true });
    writeFileSync(`test-results/perf/stage-startup-${c.name}.json`, JSON.stringify({ ...c, device: undefined, max, blocking, ...result }, null, 2));
    console.log(`[${c.name}] long tasks ${result.tasks.length}, max ${Math.round(max)} ms, blocking ${Math.round(blocking)} ms`);
    for (const t of result.tasks) console.log(`   ${String(Math.round(t.duration)).padStart(4)} ms  in ${t.phase}`);
    await context.close();
  });
}
