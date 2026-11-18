import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { collectScripts, kb, sum, type ScriptSize } from './measure';

/**
 * Deferred JS, attributed by the performance marks set in src/three/StageLoader.tsx and boot.ts:
 *   stage:start   → boot (quality decision)
 *   stage:effects → effects bundle (Lenis + GSAP/ScrollTrigger)
 *   stage:3d      → 3D base (three.js + R3F + drei), counted once — budget 250 KB gzip (PM_REVIEW_01 D8)
 *   stage:scenes  → scene chunks loaded as scenes mount — budget 250 KB gzip each (CLAUDE.md §4)
 * None of these are part of initial JS.
 */
const BASE_3D_BUDGET = 250_000;
const SCENE_BUDGET = 250_000;

async function marks(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(['stage:start', 'stage:effects', 'stage:3d', 'stage:scenes'].map((n) => [n, performance.getEntriesByName(n)[0]?.startTime ?? null])),
  ) as Promise<Record<string, number | null>>;
}

const between = (scripts: ScriptSize[], from: number | null, to: number | null) =>
  scripts.filter((s) => from !== null && s.startTime >= from && (to === null || s.startTime < to));

test('deferred chunks: 3D base and scene chunks stay within budget', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/ja?quality=high', { waitUntil: 'networkidle' });
  await page.mouse.move(20, 20); // the stage loads on the first interaction
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'live', { timeout: 15_000 });
  // Visit every layer so every scene chunk is requested.
  for (const id of await page.locator('section.layer[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer') as string))) {
    await page.locator(`section[data-layer="${id}"]`).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(250);
  }
  await page.waitForLoadState('networkidle');

  const m = await marks(page);
  const { scripts } = await collectScripts(page);
  const groups = {
    boot: between(scripts, m['stage:start'] ?? null, m['stage:effects'] ?? null),
    effects: between(scripts, m['stage:effects'] ?? null, m['stage:3d'] ?? null),
    base3d: between(scripts, m['stage:3d'] ?? null, m['stage:scenes'] ?? null),
    scenes: between(scripts, m['stage:scenes'] ?? null, null),
  };

  mkdirSync('test-results/budget', { recursive: true });
  writeFileSync('test-results/budget/deferred.json', JSON.stringify({ measuredAt: new Date().toISOString(), marks: m, groups }, null, 2));
  for (const [name, list] of Object.entries(groups)) {
    console.log(`${name.padEnd(8)} ${kb(sum(list)).padStart(9)} gzip in ${list.length} file(s)`);
  }
  for (const s of groups.scenes) console.log(`   scene chunk ${kb(s.gzip).padStart(9)}  ${s.url}`);

  expect(groups.base3d.length, '3D base should have loaded').toBeGreaterThan(0);
  expect(sum(groups.base3d)).toBeLessThanOrEqual(BASE_3D_BUDGET);
  for (const s of groups.scenes) expect(s.gzip, s.url).toBeLessThanOrEqual(SCENE_BUDGET);
});
