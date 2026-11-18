import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, test } from '@playwright/test';

/**
 * PM_REVIEW_07 §2-3: why is /ja's TBT higher than /en's on CI (layout 440–500 ms vs 150–250 ms in
 * Lighthouse) when the two looked alike on the development machine?
 *
 * Loads each page on a mobile profile with 4× CPU throttling (as Lighthouse does) and reads Chrome's
 * own cumulative style and layout time (CDP Performance.getMetrics) after load. CSS variants are
 * injected into <head> by rewriting the HTML response, so the first layout already uses them.
 * Informational: prints a table and writes perf-results/ja-layout.json; it never fails.
 */
const VARIANTS: Record<string, string> = {
  base: '',
  // Japanese line breaking: `strict` applies extra kinsoku rules to CJK text.
  'line-break-auto': 'body { line-break: auto !important; }',
  // Name a font that has the Japanese glyphs, so the browser does not search a fallback per run of text.
  'font-explicit': `body, body * { font-family: 'Droid Sans Fallback', 'Noto Sans CJK JP', sans-serif !important; }`,
  // Both of the above.
  'both': `body { line-break: auto !important; } body, body * { font-family: 'Droid Sans Fallback', 'Noto Sans CJK JP', sans-serif !important; }`,
};
const RUNS = 5;

type Sample = { layout: number; style: number; layoutCount: number };

test('ja/en style and layout cost by CSS variant (informational)', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const results: Record<string, Record<string, Sample[]>> = {};
  for (const locale of ['ja', 'en'] as const) {
    for (const [variant, css] of Object.entries(VARIANTS)) {
      for (let run = 0; run < RUNS; run++) {
        const context = await browser.newContext({ ...devices['Pixel 7'] });
        const page = await context.newPage();
        if (css) {
          await page.route(`**/${locale}`, async (route) => {
            const response = await route.fetch();
            const html = (await response.text()).replace('</head>', `<style data-probe>${css}</style></head>`);
            await route.fulfill({ response, body: html });
          });
        }
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.goto(`/${locale}`, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const { metrics } = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
        const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
        const sample = { layout: get('LayoutDuration') * 1000, style: get('RecalcStyleDuration') * 1000, layoutCount: get('LayoutCount') };
        ((results[locale] ??= {})[variant] ??= []).push(sample);
        await context.close();
      }
    }
  }

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const table: Record<string, { layout: number; style: number; total: number }> = {};
  for (const [locale, byVariant] of Object.entries(results)) {
    for (const [variant, samples] of Object.entries(byVariant)) {
      const layout = median(samples.map((s) => s.layout));
      const style = median(samples.map((s) => s.style));
      table[`${locale} ${variant}`] = { layout: Math.round(layout), style: Math.round(style), total: Math.round(layout + style) };
    }
  }
  console.log(`style + layout after load, mobile, CPU 4×, median of ${RUNS} (ms)`);
  console.table(table);
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/ja-layout.json', JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, table, results }, null, 2));
});
