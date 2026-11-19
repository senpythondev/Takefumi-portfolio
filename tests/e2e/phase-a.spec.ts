import { expect, test, type Page } from '@playwright/test';
import { contentEn } from '../../src/content/layers.en.ts';
import { contentJa } from '../../src/content/layers.ja.ts';
import { startStage } from './stage-helpers';

/**
 * STORYBOARD v2.1, Phase A: the long texts live on the case-study pages; the §8 typography; the
 * cursor; the rules of the security and patent sections.
 */
const WORK = ['current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent', 'deep', 'catchup'];
const CONTENT = { ja: contentJa, en: contentEn } as const;

const scrollToAct = (page: Page, act: string, at: number) =>
  page.evaluate(
    ([id, t]) => {
      const el = document.querySelector<HTMLElement>(`[data-act="${id}"]`) as HTMLElement;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + (el.offsetHeight - window.innerHeight) * (t as number));
    },
    [act, at] as const,
  );

for (const locale of ['ja', 'en'] as const) {
  test(`/${locale}: every case study reads without JavaScript, and every number is shown somewhere`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'HTML only: once is enough');
    test.setTimeout(120_000);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const seen = new Set<string>();
    const collect = async () => {
      for (const id of await page.locator('a.metric').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric') ?? ''))) seen.add(id);
    };
    await page.goto(`/${locale}`);
    await collect();
    for (const id of WORK) {
      const res = await page.goto(`/${locale}/work/${id}`);
      expect(res?.status(), id).toBe(200);
      await expect(page.locator('h1#work-title')).toBeVisible();
      expect(await page.locator('.work-body > *').count(), `${id} has its long text`).toBeGreaterThan(0);
      await expect(page.locator('.work-back')).toHaveAttribute('href', `/${locale}#layer-${id}`);
      await collect();
    }
    await expect(page.locator('.genten-eval table').first()).toHaveCount(0); // on the Genten page only
    await page.goto(`/${locale}/work/genten`);
    await expect(page.locator('.genten-eval table').first()).toBeVisible();
    const all = CONTENT[locale].metrics.map((m) => m.id);
    expect(all.filter((id) => !seen.has(id))).toEqual([]);
    // The evidence page leads back to the case study where the number is told.
    await page.goto(`/${locale}/evidence/auction-errors`);
    await expect(page.locator('.evidence-back a')).toHaveAttribute('href', `/${locale}/work/auction`);
    await context.close();
  });
}

test('the home keeps only the acts: no long panels, small DOM', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'HTML only: once is enough');
  await page.goto('/ja?quality=static');
  await expect(page.locator('.layer-body, .layer-header')).toHaveCount(0);
  for (const act of await page.locator('section.act-world').all()) {
    const metrics = await act.locator('.act-metrics:not(.act-metrics-then) .act-metric').count();
    const id = await act.getAttribute('data-act');
    expect(metrics, `${id}: at most 3 big numbers (catch-up: 4, one at a time)`).toBeLessThanOrEqual(id === 'catchup' ? 4 : 3);
    for (const m of await act.locator('.act-metric .metric').all()) await expect(m.locator('.metric-symbol')).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBeLessThan(1500);
});

test('§8.2: vertical Mincho headlines on the Japanese desktop; horizontal on phones and in English', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'reduced-motion', 'typography only');
  await page.goto('/ja?quality=static');
  const mode = () => page.locator('section[data-act="genten"] .act-headline').evaluate((el) => getComputedStyle(el).writingMode);
  expect(await mode()).toBe(testInfo.project.name === 'mobile' ? 'horizontal-tb' : 'vertical-rl');
  await page.goto('/en?quality=static');
  expect(await mode()).toBe('horizontal-tb');
  // Every act carries its one-character mark (§8.3).
  expect(await page.locator('.act-kanji').count()).toBe(11);
});

test('3-4: the reconstruction notice is part of the whole section', async ({ page }) => {
  await page.goto('/ja?quality=static');
  const badge = page.locator('section[data-act="php-audit"] .act-badge');
  await expect(badge).toBeVisible();
  await expect(badge.locator('.metric-badge[data-confidence="reconstructed"]')).toHaveText('再現');
});

test.describe('with the 3D', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
  });

  test('§8.7: the following cursor is there for a mouse, and gone after a key', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 310);
    const cursor = page.locator('.cursor');
    await expect(cursor).toHaveCount(1);
    await expect(cursor).not.toHaveAttribute('data-hidden', '');
    await page.keyboard.press('Tab');
    await expect(cursor).toHaveAttribute('data-hidden', '');
  });

  test('3-6: the name for the watermark is never sent anywhere', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    await scrollToAct(page, 'patent', 0.6);
    await page.waitForTimeout(3000);
    const sent: string[] = [];
    page.on('request', (r) => sent.push(r.url()));
    const input = page.locator('[data-control="watermark"]');
    await input.focus();
    await input.pressSequentially('テスト 太郎', { delay: 40 });
    await page.waitForTimeout(1500);
    expect(sent.filter((u) => !/\/_next\/static\//.test(u))).toEqual([]);
    expect(sent.join(' ')).not.toContain(encodeURIComponent('テスト'));
  });
});

test('touch and reduced motion: no following cursor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'the desktop has a mouse');
  await page.goto('/ja');
  await page.waitForTimeout(2500);
  await expect(page.locator('.cursor')).toHaveCount(0);
});
