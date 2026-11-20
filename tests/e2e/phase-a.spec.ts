import AxeBuilder from '@axe-core/playwright';
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

test('case studies: no accessibility violations (WCAG 2.2 AA, heading order included)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'reduced-motion', 'static HTML: desktop and mobile are enough');
  test.setTimeout(120_000);
  for (const locale of ['ja', 'en']) {
    for (const id of WORK) {
      await page.goto(`/${locale}/work/${id}`);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), `/${locale}/work/${id}`).toEqual([]);
    }
  }
});

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
  // Every act carries its one-character mark (§8.3), with its strokes in writing order (§10-B)
  // and the credit the stroke data's licence asks for.
  expect(await page.locator('.act-kanji').count()).toBe(11);
  expect(await page.locator('.act-kanji svg.kanji-strokes').count()).toBe(11);
  expect(await page.locator('section[data-act="genten"] .kanji-strokes path').count()).toBe(12);
  await expect(page.locator('.site-footer')).toContainText('KanjiVG');
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
    // §11.2: moving fast leaves a short tail of light; pressing closes the ring.
    await expect
      .poll(
        async () => {
          for (let i = 0; i < 12; i += 1) await page.mouse.move(200 + ((i * 97) % 900), 300 + ((i * 53) % 300));
          return page.locator('.cursor-spark').evaluateAll((els) => els.filter((el) => el.getAnimations().length > 0).length);
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    await page.keyboard.press('Tab');
    await expect(cursor).toHaveAttribute('data-hidden', '');
  });

  test('§9: a key moment plays to its end at its own tempo; the picture is not scrubbed by the scroll', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await startStage(page);
    const surface = () => page.evaluate(() => (window as unknown as { __world: { acts?: { surface: number } } }).__world.acts?.surface ?? 0);
    // Before the extraction's starting point: the picture follows the scroll and waits at the range's edge.
    await scrollToAct(page, 'surface', 0.36);
    await expect.poll(surface, { timeout: 30_000 }).toBeGreaterThan(0.29);
    await page.waitForTimeout(1500);
    expect(await surface()).toBeLessThanOrEqual(0.3);
    // Past it: the core is pulled out to the end of the moment (70 %) with no further scrolling.
    await scrollToAct(page, 'surface', 0.45);
    await expect.poll(surface, { timeout: 30_000 }).toBeGreaterThanOrEqual(0.7);
    await page.waitForTimeout(1000);
    expect(await surface()).toBeCloseTo(0.7, 5);
    // Scrolled back a little, it stays; back over the far point, it plays back.
    await scrollToAct(page, 'surface', 0.62);
    await page.waitForTimeout(1000);
    expect(await surface()).toBeCloseTo(0.7, 5);
    await scrollToAct(page, 'surface', 0.5);
    await expect.poll(surface, { timeout: 30_000 }).toBeLessThanOrEqual(0.3);
  });

  test('§9-4: ?debug=scroll shows the tuning panel; a slider changes the page and is remembered', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=scroll');
    await startStage(page);
    const panel = page.locator('.scroll-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('input[type="range"]')).toHaveCount(5);
    const height = () => page.locator('section[data-act="genten"]').evaluate((el) => (el as HTMLElement).offsetHeight / window.innerHeight);
    const before = await height();
    await panel.locator('input[data-tune="length"]').fill('2');
    await expect.poll(height).toBeGreaterThan(before * 1.2);
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('gt-scroll-tune') ?? '{}').length)).toBe(2);
    await page.reload();
    await expect(page.locator('.scroll-panel input[data-tune="length"]')).toHaveValue('2');
    // Without the parameter the saved values are not used.
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    await expect(page.locator('.scroll-panel')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--act-scale').trim())).toBe('1.5');
  });

  test('3-6: the watermark, the full-page viewer and the PDF are made in the browser; the name is never sent', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    await scrollToAct(page, 'patent', 0.6);
    await page.waitForTimeout(8000);
    const sent: string[] = [];
    page.on('request', (r) => sent.push(r.url() + (r.postData() ?? '')));
    const input = page.locator('[data-control="watermark"]');
    const confirm = page.locator('[data-watermark-confirm]');
    await expect(confirm).toBeDisabled();
    await input.focus();
    await input.pressSequentially('テスト 太郎', { delay: 40 });
    // §11.3: the input itself is never delayed.
    await expect(input).toHaveValue('テスト 太郎');
    await page.waitForTimeout(1500);
    // After 確認: the sample document as a full page, labelled as fictional, with the viewer's line.
    await confirm.click();
    const viewer = page.locator('dialog.doc-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.doc-sample-label')).toHaveText('架空の見本文書');
    await expect(viewer.locator('[data-doc-footer]').first()).toHaveText(/^閲覧者：テスト 太郎 \d{4}-\d{2}-\d{2} \d{2}:\d{2}　見本$/);
    await expect(viewer.locator('img').first()).toHaveAttribute('src', '/media/patent/sample-page-1.webp');
    // The watermark is drawn on the page (the canvas is not blank once it has formed).
    await expect
      .poll(() => viewer.locator('canvas').first().evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 0) n += 1;
        return n;
      }), { timeout: 20_000 })
      .toBeGreaterThan(500);
    // The watermarked PDF is made here: a real PDF, with no metadata.
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), viewer.locator('[data-doc-download]').click()]);
    const file = await download.path();
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const text = bytes.toString('latin1');
    for (const key of ['/Author', '/Creator', '/Producer', '/CreationDate', '/Title', '/Metadata']) expect(text, key).not.toContain(key);
    await viewer.locator('[data-doc-close]').click();
    await expect(viewer).toBeHidden();
    // Nothing but the site's own static files was requested, and nothing carried the name.
    expect(sent.filter((u) => !/\/_next\/static\/|\/media\/patent\/sample-/.test(u))).toEqual([]);
    const all = sent.join(' ');
    for (const part of ['テスト', '太郎', encodeURIComponent('テスト'), encodeURIComponent('太郎')]) expect(all).not.toContain(part);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie)).not.toContain('テスト');
  });

  test('§11.4: a click on bare rock drills it and brings up a real number; never more than three holes', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    await page.waitForTimeout(5000); // the drill is fetched once the page is idle
    const spots = [[900, 520], [1000, 600], [820, 640], [940, 680]] as const;
    for (const [x, y] of spots) await page.mouse.click(x, y);
    await expect(page.locator('.drill-hole')).toHaveCount(3);
    const label = page.locator('.drill-label a.metric').first();
    await expect(label).toHaveAttribute('href', /\/ja\/evidence\//);
    // The number is one that is already in the page (never made up), with its confidence symbol.
    const id = await label.getAttribute('data-metric');
    expect(await page.locator(`main a.metric[data-metric="${id}"]`).count()).toBeGreaterThan(0);
    await expect(label.locator('.metric-symbol')).toHaveCount(1);
    // On a link or from the keyboard, nothing is drilled.
    await expect(page.locator('.drill-hole')).toHaveCount(0, { timeout: 15_000 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.drill-hole')).toHaveCount(0);
  });

  test('§10-H: sound is off by default and its code is fetched only when it is switched on', async ({ page }) => {
    test.setTimeout(120_000);
    const scripts: string[] = [];
    await page.addInitScript(() => {
      const w = window as unknown as { __audio: number; AudioContext: typeof AudioContext };
      w.__audio = 0;
      const Real = w.AudioContext;
      w.AudioContext = class extends Real {
        constructor() {
          super();
          w.__audio += 1;
        }
      };
    });
    await page.goto('/ja?quality=low&dpr=0.4');
    await startStage(page);
    const toggle = page.locator('[data-sound-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(0);
    page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(1);
    expect(scripts.length).toBeGreaterThan(0); // fetched now, not before
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test('touch and reduced motion: no following cursor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'the desktop has a mouse');
  await page.goto('/ja');
  await page.waitForTimeout(2500);
  await expect(page.locator('.cursor')).toHaveCount(0);
});

test('the sample document is fictional, small, and carries no metadata', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'a file check: once is enough');
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync('public/media/patent/sample-document.pdf');
  expect(bytes.length).toBeLessThan(1024 * 1024);
  const text = bytes.toString('latin1');
  for (const key of ['/Info', '/Author', '/Creator', '/Producer', '/CreationDate', '/ModDate', '/Title', '/Metadata']) expect(text, key).not.toContain(key);
  expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeLessThanOrEqual(2);
});
