import { expect, test } from '@playwright/test';
import { startStage } from './stage-helpers';

/** The world behind the page (docs/concept/ART_DIRECTION.md): poster first, then the 3D wall. */
test.describe('world backdrop', () => {
  test('before any interaction the hero shows the poster, and the LCP-relevant text is HTML', async ({ page }) => {
    await page.goto('/ja');
    const world = page.locator('.world');
    const box = await world.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width).toBe(viewport?.width);
    expect(box?.height).toBe(viewport?.height);
    await expect(world).toHaveAttribute('aria-hidden', 'true');
    const poster = await page.locator('.world-poster').evaluate((el) => ({ image: getComputedStyle(el).backgroundImage, opacity: getComputedStyle(el).opacity }));
    expect(poster.image).toMatch(/poster-(wide|tall)\.webp/);
    expect(poster.opacity).toBe('1');
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('the static tier keeps the poster on the hero and drops it below', async ({ page }) => {
    await page.goto('/ja?quality=static');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'off');
    await expect(page.locator('.world-poster')).toHaveCSS('opacity', '1');
    await page.locator('section[data-layer="genten"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.locator('.world-poster')).toHaveCSS('opacity', '0');
  });

  test('Japanese headings break at phrase boundaries (<wbr>), never mid-phrase', async ({ page }) => {
    await page.goto('/ja');
    const copy = page.locator('.hero-copy');
    expect(await copy.locator('wbr').count()).toBeGreaterThan(1);
    expect(await copy.evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
    // Every rendered line must end where a phrase ends.
    const ok = await copy.evaluate((el) => {
      const phrases: string[] = [];
      let current = '';
      for (const node of el.childNodes) {
        if (node.nodeName === 'WBR') {
          phrases.push(current);
          current = '';
        } else current += node.textContent ?? '';
      }
      phrases.push(current);
      const range = document.createRange();
      let lastTop: number | null = null;
      let offsetInPhrase = 0;
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) {
          if (node.nodeName === 'WBR') offsetInPhrase = 0;
          continue;
        }
        const text = node.textContent ?? '';
        for (let i = 0; i < text.length; i += 1) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const top = Math.round(range.getBoundingClientRect().top);
          if (lastTop !== null && top > lastTop + 4 && offsetInPhrase !== 0) return false; // a line began inside a phrase
          lastTop = top;
          offsetInPhrase += 1;
        }
      }
      return phrases.length > 1;
    });
    expect(ok).toBe(true);
  });

  test('hero chips show the confidence as a labelled symbol', async ({ page }) => {
    await page.goto('/ja');
    const symbol = page.locator('.chips .metric-symbol').first();
    await expect(symbol).toHaveAttribute('role', 'img');
    await expect(symbol).toHaveAttribute('aria-label', /概算|確認済み|再現/);
    await expect(page.locator('.chips .metric-badge')).toHaveCount(0);
  });

  test('rock textures load only with the 3D; lower tiers are compiled ahead of a step-down', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
    test.setTimeout(180_000);
    const rock: string[] = [];
    page.on('request', (r) => r.url().includes('/media/rock') && rock.push(r.url()));
    await page.goto('/ja?quality=medium&dpr=0.3&debug=1', { waitUntil: 'networkidle' });
    expect(rock, 'no texture request with the initial page').toEqual([]);
    await startStage(page);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    await expect.poll(() => rock.length, { timeout: 60_000 }).toBe(1);
    // The low tier's wall shader exists before any step-down (PM decision: no compile while frames drop).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __world: { tiers?: string[] } }).__world.tiers ?? []), { timeout: 120_000 })
      .toEqual(expect.arrayContaining(['medium', 'low']));
  });

  test('live: one canvas, the wall follows the scroll, the lantern is on the hero only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'stage tests run once, on the desktop project');
    test.setTimeout(120_000);
    await page.goto('/ja?quality=low&dpr=0.4&debug=1');
    await startStage(page);
    await expect(page.locator('html')).toHaveAttribute('data-world', 'live', { timeout: 60_000 });
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('.world-poster')).toHaveCSS('opacity', '0');
    const read = () => page.evaluate(() => (window as unknown as { __world: { depth: number; beam: number } }).__world);
    await page.mouse.move(700, 400);
    await expect.poll(async () => (await read()).beam, { timeout: 30_000 }).toBeGreaterThan(0.5);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3));
    await expect.poll(async () => (await read()).depth, { timeout: 30_000 }).toBeGreaterThan(2.5);
    await expect.poll(async () => (await read()).beam, { timeout: 30_000 }).toBeLessThan(0.05);
  });
});
