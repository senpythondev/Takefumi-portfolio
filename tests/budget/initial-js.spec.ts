import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { collectScripts, kb, sum } from './measure';

/**
 * Initial-JS budget (CLAUDE.md §4): ≤ 180 KB gzip, 3D excluded.
 * "Initial" = every script requested before StageLoader starts loading the 3D stage
 * (performance.mark('stage:start')), up to network idle. 1 KB = 1,000 bytes (the stricter reading).
 */
const INITIAL_JS_BUDGET = 180_000;

for (const locale of ['ja', 'en'] as const) {
  test(`initial JS on /${locale} stays within budget`, async ({ page }) => {
    await page.goto(`/${locale}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const { scripts, stageStart } = await collectScripts(page);
    const initial = scripts.filter((s) => stageStart === null || s.startTime < stageStart);
    const total = sum(initial);

    mkdirSync('test-results/budget', { recursive: true });
    writeFileSync(
      `test-results/budget/initial-js-${locale}.json`,
      JSON.stringify({ locale, measuredAt: new Date().toISOString(), budgetBytes: INITIAL_JS_BUDGET, initialJsGzipBytes: total, stageStart, scripts: initial }, null, 2),
    );
    console.log(`[${locale}] initial JS: ${kb(total)} gzip in ${initial.length} files (budget ${kb(INITIAL_JS_BUDGET)})`);
    expect(total).toBeLessThanOrEqual(INITIAL_JS_BUDGET);
  });
}
