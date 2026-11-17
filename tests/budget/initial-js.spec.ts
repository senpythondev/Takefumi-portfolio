import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/**
 * Initial-JS budget (CLAUDE.md §4): ≤ 180 KB gzip, 3D excluded.
 * "Initial" = every script requested before the first interaction, up to network idle.
 * Bytes are measured by gzipping each response body ourselves (zlib default level), so the
 * figure does not depend on the server's compression. 1 KB = 1,000 bytes (the stricter reading).
 * Phase 3: chunks of the deferred effects bundle are tagged and reported separately.
 */
const INITIAL_JS_BUDGET = 180_000;

for (const locale of ['ja', 'en'] as const) {
  test(`initial JS on /${locale} stays within budget`, async ({ page }) => {
    const scripts: Array<{ url: string; raw: number; gzip: number }> = [];
    const other: Record<string, { raw: number; gzip: number }> = {};

    page.on('response', async (response) => {
      const type = response.request().resourceType();
      if (!['script', 'document', 'stylesheet', 'font'].includes(type)) return;
      const body = await response.body().catch(() => null);
      if (!body) return;
      const entry = { raw: body.length, gzip: gzipSync(body).length };
      if (type === 'script') scripts.push({ url: new URL(response.url()).pathname, ...entry });
      else {
        const acc = (other[type] ??= { raw: 0, gzip: 0 });
        acc.raw += entry.raw;
        acc.gzip += entry.gzip;
      }
    });

    await page.goto(`/${locale}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const total = scripts.reduce((sum, s) => sum + s.gzip, 0);
    const report = {
      locale,
      measuredAt: new Date().toISOString(),
      budgetBytes: INITIAL_JS_BUDGET,
      initialJsGzipBytes: total,
      scripts: scripts.sort((a, b) => b.gzip - a.gzip),
      otherResources: other,
    };
    mkdirSync('test-results/budget', { recursive: true });
    writeFileSync(`test-results/budget/initial-js-${locale}.json`, JSON.stringify(report, null, 2));
    console.log(`[${locale}] initial JS: ${(total / 1000).toFixed(1)} KB gzip in ${scripts.length} files (budget ${INITIAL_JS_BUDGET / 1000} KB)`);
    for (const [type, v] of Object.entries(other)) console.log(`[${locale}] ${type}: ${(v.gzip / 1000).toFixed(1)} KB gzip (${(v.raw / 1000).toFixed(1)} KB raw)`);

    expect(total).toBeLessThanOrEqual(INITIAL_JS_BUDGET);
  });
}
