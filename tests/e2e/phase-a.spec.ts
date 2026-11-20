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
const plainRole = (id: 'auction') => (contentJa.cinema.acts[id].role ?? '').replace(/\{\{([a-z0-9-]+)\}\}/g, (_, m: string) => contentJa.metrics.find((x) => x.id === m)?.display ?? '');

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
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBeLessThan(2000);
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
  // (v2.5: the strokes are only drawn by the cinema, which adds them on the client — see the 3D tests.)
  expect(await page.locator('.act-kanji .kanji-glyph').count()).toBe(11);
  expect(await page.locator('.kanji-strokes').count()).toBe(0);
  await expect(page.locator('.site-footer')).toContainText('KanjiVG');
});

test('3-4: the reconstruction notice is part of the whole section', async ({ page }) => {
  await page.goto('/ja?quality=static');
  const badge = page.locator('section[data-act="php-audit"] .act-badge');
  await expect(badge).toBeVisible();
  await expect(badge.locator('.metric-badge[data-confidence="reconstructed"]')).toHaveText('再現');
});

test('v2.4 §12–§13: title cards, four beats, comparisons and the results ledger are plain HTML — with JavaScript off too', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'HTML only: once is enough');
  test.setTimeout(120_000);
  // Option A (PM, v2.5): the 3D-only markup is built on the client; everything a reader needs stays in the HTML.
  for (const [locale, javaScriptEnabled] of [['ja', true], ['en', true], ['ja', false], ['en', false]] as const) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    const content = CONTENT[locale];
    const display = new Map(content.metrics.map((m) => [m.id, m.display]));
    const plain = (text: string) => text.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id: string) => display.get(id) ?? '');
    const squash = (text: string) => text.replace(/[\s✓≈↺]/g, '');
    await page.goto(`/${locale}${javaScriptEnabled ? '?quality=static' : ''}`);
    // §12.1: every section says which project it is.
    for (const layer of content.layers.filter((l) => !['surface', 'next'].includes(l.id))) {
      const card = page.locator(`section[data-act="${layer.id}"] .act-card`);
      await expect(card.locator('.act-card-title')).toHaveText(layer.title);
      await expect(card).toBeVisible();
    }
    // §12.2: the PM's four sentences, every number a Metric link with its evidence.
    for (const [id, act] of Object.entries(content.cinema.acts) as [string, { beats?: readonly string[] }][]) {
      const beats = page.locator(`section[data-act="${id}"] .act-beat`);
      await expect(beats).toHaveCount(act.beats ? 4 : 0);
      for (const [i, text] of (act.beats ?? []).entries()) {
        expect(squash(await beats.nth(i).locator('.act-beat-text').innerText())).toBe(squash(plain(text)));
        expect(await beats.nth(i).locator('a.metric').count()).toBe((text.match(/\{\{/g) ?? []).length);
      }
    }
    // §13.1: comparisons made only of metrics.
    await expect(page.locator('section[data-act="pegasus"] .compare-bars .compare-row')).toHaveCount(2);
    await expect(page.locator('section[data-act="patent"] .compare-bars .compare-row')).toHaveCount(2);
    await expect(page.locator('section[data-act="genten"] .compare-group')).toHaveCount(2);
    await expect(page.locator('section[data-act="genten"] .compare-row a.metric')).toHaveCount(6);
    await expect(page.locator('section[data-act="auction"] .compare-side')).toHaveCount(2);
    await expect(page.locator('section[data-act="auction"] .compare-side[data-side="before"] a.metric')).toHaveCount(0);
    await expect(page.locator('section[data-act="php-audit"] .compare-list li')).toHaveCount(4);
    await expect(page.locator('section[data-act="php-audit"] .compare-stairs li')).toHaveCount(4);
    // The shorter bar really is shorter, by the metrics' own values (20 minutes against up to 4 hours).
    const widths = await page.locator('section[data-act="pegasus"] .compare-bar i').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect((widths[1] as number) / (widths[0] as number)).toBeCloseTo(20 / 240, 1);
    // §13.3: the ledger in the finale — every row's numbers open their evidence.
    const rows = page.locator('section[data-act="next"] .ledger-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
    for (const link of await page.locator('.ledger a.metric').all()) expect(await link.getAttribute('href')).toMatch(new RegExp(`^/${locale}/evidence/`));
    // The KanjiVG credit is a link (allow-listed in src/content/links.ts).
    await expect(page.locator('.site-footer a', { hasText: 'KanjiVG' })).toHaveAttribute('href', /kanjivg/);
    // Every number of every act is a link to its evidence, in the HTML as served.
    for (const [id, act] of Object.entries(content.cinema.acts) as [string, { metrics: string[]; then?: string[] }][]) {
      for (const m of [...act.metrics, ...(act.then ?? [])]) expect(await page.locator(`section[data-act="${id}"] a.metric[data-metric="${m}"]`).count(), `${locale} ${id} ${m}`).toBeGreaterThan(0);
    }
    // The 3D-only markup is not in the served page.
    await expect(page.locator('.act-labels, .kanji-strokes, [data-nav-hint]')).toHaveCount(0);
    await context.close();
  }
});

test.describe('with the 3D', () => {
  test('§11.1 (v2.5): the stardust is drawn a little to the mouse within two seconds, then springs back', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await startStage(page);
    type Dust = { count: number; pulled: number; maxOff: number };
    const dust = () => page.evaluate(() => (window as unknown as { __world: { stardust?: Dust } }).__world.stardust ?? { count: 0, pulled: 0, maxOff: 0 });
    await expect.poll(async () => (await dust()).count, { timeout: 60_000 }).toBeGreaterThanOrEqual(75);
    expect((await dust()).maxOff).toBeLessThan(0.002);
    // The hint of the first screen is there until the first scroll.
    await expect(page.locator('[data-nav-hint]')).toBeVisible();
    const { width, height } = page.viewportSize() as { width: number; height: number };
    await page.mouse.move(width * 0.3, height * 0.5);
    await page.mouse.move(width * 0.55, height * 0.45, { steps: 8 });
    const moved = Date.now();
    // Grains within a quarter of the width come toward the pointer: several of them, by 1 % of the width or more…
    await expect.poll(async () => (await dust()).maxOff, { timeout: 2000, intervals: [100] }).toBeGreaterThan(0.01);
    expect(Date.now() - moved).toBeLessThan(2000);
    expect((await dust()).pulled).toBeGreaterThan(4);
    await page.waitForTimeout(1200);
    // …and never further than about 3 % (v2.5: noticeable, not showy).
    expect((await dust()).maxOff).toBeLessThanOrEqual(0.034);
    // The pointer leaves the page: every grain goes home.
    await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')));
    await expect.poll(async () => (await dust()).maxOff, { timeout: 15_000 }).toBeLessThan(0.002);
  });

  test('§12–§13 (v2.5): by scroll position — the title card, each beat, the result held over a stretch of scroll, then recorded', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await startStage(page);
    const section = page.locator('section[data-act="auction"]');
    const go = (t: number) => scrollToAct(page, 'auction', t);
    // Scroll shares of a world act (src/content/acts.ts SHARES): entry 13 %, card 5 %, beats 50 %, held result 16 %, return 16 %.
    await go(0.155);
    await expect(section).toHaveAttribute('data-card', '', { timeout: 60_000 });
    await expect(section.locator('.act-card')).toHaveCSS('opacity', '1', { timeout: 10_000 });
    await expect(section.locator('.act-card-title')).toHaveText(contentJa.layers.find((l) => l.id === 'auction')?.title ?? '');
    await expect(section.locator('.act-card-lead')).toHaveText(plainRole('auction'));
    // The four beats, each on its own stretch of scroll, with its sentence and labels built on the client.
    const seen: string[] = [];
    for (let t = 0.19; t < 0.68; t += 0.02) {
      await go(t);
      await page.waitForTimeout(450);
      const b = (await section.getAttribute('data-beat')) ?? '';
      if (seen[seen.length - 1] !== b) seen.push(b);
    }
    expect(seen.filter((b) => b !== '0')).toEqual(['1', '2', '3', '4']);
    await expect(section.locator('.act-labels li')).toHaveCount(Object.keys(contentJa.cinema.acts.auction.labels ?? {}).length);
    // §13.2: the result stays put across its whole stretch of scroll (16 % of the act), wherever the scroll rests in it.
    for (const t of [0.69, 0.75, 0.82]) {
      await go(t);
      await page.waitForTimeout(600);
      await expect(section).toHaveAttribute('data-result', '');
      await expect(section.locator('.act-result')).toHaveCSS('opacity', '1');
      expect(await section.evaluate((el) => getComputedStyle(el).getPropertyValue('--reveal').trim())).toBe('1.000');
    }
    // Back a little: the bars are part-grown again (the result is written by the scroll, both ways).
    await go(0.655);
    await page.waitForTimeout(600);
    const partly = Number(await section.evaluate((el) => getComputedStyle(el).getPropertyValue('--reveal')));
    expect(partly).toBeGreaterThan(0);
    expect(partly).toBeLessThan(1);
    // §13.3: leaving the act records its result on the navigator's band.
    await go(0.93);
    await expect(page.locator('[data-nav-band="auction"]')).toHaveAttribute('data-recorded', '', { timeout: 30_000 });
    await expect(page.locator('[data-nav-band="auction"] .core-result')).toContainText(contentJa.metrics.find((m) => m.id === 'auction-errors')?.display ?? '—');
  });


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

  test('v2.5 §9: the picture is tied to the scroll — it stops within 0.3 s of the scroll stopping, and plays back', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await startStage(page);
    const surface = () => page.evaluate(() => (window as unknown as { __world: { acts?: { surface: number } } }).__world.acts?.surface ?? 0);
    // The brush of light: the strokes of every mark, in writing order, added by the cinema (§10-B).
    await expect(page.locator('.act-kanji svg.kanji-strokes')).toHaveCount(11);
    await expect(page.locator('section[data-act="genten"] .kanji-strokes path')).toHaveCount(12);
    await scrollToAct(page, 'surface', 0.25);
    await expect.poll(surface, { timeout: 30_000 }).toBeGreaterThan(0.2);
    // Every scroll position has its own picture: the same position gives the same progress, forward and back.
    const at: number[] = [];
    for (const t of [0.2, 0.45, 0.6, 0.45, 0.2]) {
      await scrollToAct(page, 'surface', t);
      await page.waitForTimeout(700);
      const a = await surface();
      // Nothing moves any more: the picture came to rest with the scroll.
      await page.waitForTimeout(500);
      expect(await surface()).toBe(a);
      at.push(a);
    }
    expect(at[1]).toBeGreaterThan(at[0] as number);
    expect(at[2]).toBeGreaterThan(at[1] as number);
    expect(at[3]).toBeCloseTo(at[1] as number, 6);
    expect(at[4]).toBeCloseTo(at[0] as number, 6);
    // The extraction of the core has its own range of scroll (30–70 %): half-way through the range it is half done, not finished.
    await scrollToAct(page, 'surface', 0.5);
    await page.waitForTimeout(700);
    expect(await surface()).toBeCloseTo(0.5, 2);
    // How long the picture keeps moving after a jump of the scroll: under 0.3 s (plus one slow frame of this machine).
    const settle = await page.evaluate(async () => {
      const w = (window as unknown as { __world: { acts?: { surface: number } } }).__world;
      const el = document.querySelector<HTMLElement>('[data-act="surface"]') as HTMLElement;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * 0.62);
      const start = performance.now();
      let last = w.acts?.surface ?? 0;
      let lastChange = start;
      let frames = 0;
      let slowest = 0;
      let prev = start;
      while (performance.now() - start < 1500) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        slowest = Math.max(slowest, now - prev);
        prev = now;
        frames += 1;
        const v = w.acts?.surface ?? 0;
        if (v !== last) {
          last = v;
          lastChange = now;
        }
      }
      return { ms: lastChange - start, slowest, frames };
    });
    expect(settle.ms, JSON.stringify(settle)).toBeLessThanOrEqual(300 + 2 * settle.slowest);
  });

  test('§9-4: ?debug=scroll shows the tuning panel; a slider changes the page and is remembered', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=scroll');
    await startStage(page);
    const panel = page.locator('.scroll-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('input[type="range"]')).toHaveCount(7);
    const height = () => page.locator('section[data-act="genten"]').evaluate((el) => (el as HTMLElement).offsetHeight / window.innerHeight);
    const before = await height();
    await panel.locator('input[data-tune="length"]').fill('2');
    await expect.poll(height).toBeGreaterThan(before * 1.2);
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('gt-scroll-tune-2') ?? '{}').length)).toBe(2);
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
