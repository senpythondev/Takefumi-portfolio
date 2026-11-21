import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { WORK_IDS } from '../../src/content/acts.ts';
import { contentEn } from '../../src/content/layers.en.ts';
import { contentJa } from '../../src/content/layers.ja.ts';
import { ALLOWED_URLS } from '../../src/content/links.ts';
import { startStage } from './stage-helpers';

/**
 * Final QA before the first publish (2026-11-20): axe on every page, every link and every evidence
 * link, the keyboard through every section and the index, what a screen reader is told, the
 * security headers, and the pieces a link preview and a crawler read.
 */
const LOCALES = ['ja', 'en'] as const;
const CONTENT = { ja: contentJa, en: contentEn } as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'final QA runs once, on the desktop project'));

test('axe: no WCAG 2.2 AA violation on any page (home, static home, every case study, every evidence page, 404)', async ({ page }) => {
  test.setTimeout(900_000);
  const pages = LOCALES.flatMap((l) => [`/${l}`, `/${l}?quality=static`, ...WORK_IDS.map((id) => `/${l}/work/${id}`), ...CONTENT[l].metrics.map((m) => `/${l}/evidence/${m.id}`)]);
  pages.push('/no-such-page');
  const failures: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    const scan = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const v of scan.violations) failures.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  }
  expect(failures).toEqual([]);
  expect(pages.length).toBeGreaterThan(160);
});

test('every link on every page goes somewhere: internal links answer 200, external ones are on the allow-list, every number has its evidence page', async ({ page, request }) => {
  test.setTimeout(600_000);
  const internal = new Set<string>();
  for (const locale of LOCALES) {
    const content = CONTENT[locale];
    for (const path of [`/${locale}?quality=static`, ...WORK_IDS.map((id) => `/${locale}/work/${id}`), `/${locale}/evidence/genten-acc-genten`]) {
      await page.goto(path);
      const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((a) => a.getAttribute('href') as string));
      for (const href of hrefs) {
        if (href.startsWith('#') || href.startsWith('mailto:')) continue;
        if (/^https?:/.test(href)) expect(ALLOWED_URLS, `${path} → ${href}`).toContain(href);
        else internal.add(href.split('#')[0] as string);
      }
      // An anchor on the same page must exist.
      for (const href of hrefs.filter((h) => h.startsWith('#') && h.length > 1)) expect(await page.locator(`[id="${href.slice(1)}"]`).count(), `${path} ${href}`).toBe(1);
    }
    // Every metric shown anywhere has an evidence page that states it.
    for (const m of content.metrics) {
      const res = await request.get(`/${locale}/evidence/${m.id}`);
      expect(res.status(), m.id).toBe(200);
      expect(await res.text(), m.id).toContain(m.display.replace(/&/g, '&amp;'));
      expect((await request.get(`/${locale}/evidence/${m.id}/fragment`)).status(), `${m.id} fragment`).toBe(200);
    }
  }
  expect(internal.size).toBeGreaterThan(20);
  for (const href of internal) expect((await request.get(href)).status(), href).toBe(200);
});

test('what a screen reader is told: landmarks, names, one h1, decoration hidden', async ({ page }) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}?quality=static`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    // Every navigation and every section has a name.
    for (const nav of await page.locator('nav').all()) expect(((await nav.getAttribute('aria-label')) ?? (await nav.getAttribute('aria-labelledby'))) || '').not.toBe('');
    for (const section of await page.locator('main section[data-act]').all()) {
      const id = await section.getAttribute('aria-labelledby');
      expect(id, (await section.getAttribute('data-act')) ?? '').toBeTruthy();
      expect(((await page.locator(`[id="${id}"]`).textContent()) ?? '').trim().length).toBeGreaterThan(0);
    }
    // Headings never skip a level going down.
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((els) => els.filter((e) => !e.closest('dialog')).map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i += 1) expect((levels[i] as number) - (levels[i - 1] as number), `heading ${i}`).toBeLessThanOrEqual(1);
    // Every number says what it is and how sure it is; every control has a name.
    for (const link of await page.locator('a.metric').all()) await expect(link.locator('.metric-symbol, .metric-badge').first()).toBeAttached();
    for (const control of await page.locator('button, input, select').all()) {
      const named = await control.evaluate((el) => !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent?.trim() || el.closest('label')?.textContent?.trim() || (el as HTMLInputElement).labels?.length));
      expect(named, await control.evaluate((el) => el.outerHTML.slice(0, 120))).toBe(true);
    }
    // Decoration is hidden from assistive technology.
    for (const sel of ['.world', '.act-kanji', '.act-still']) for (const el of await page.locator(sel).all()) expect(await el.evaluate((e) => !!e.closest('[aria-hidden="true"]')), sel).toBe(true);
  }
  // With the cinema: the canvas is decoration too.
  await page.goto('/ja?quality=low&dpr=0.4');
  await startStage(page);
  expect(await page.locator('canvas').evaluate((c) => !!c.closest('[aria-hidden="true"]'))).toBe(true);
});

test('keyboard only, with the cinema: Tab reaches the index and every section, and what has focus can be seen', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/ja?quality=low&dpr=0.4');
  await startStage(page);
  const reached = new Set<string>();
  const unseen: string[] = [];
  let bands = 0;
  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(320);
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      let opacity = 1;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      return { what: `${el.tagName}.${el.className.toString().slice(0, 30)} "${(el.textContent ?? '').trim().slice(0, 24)}"`, section: el.closest('section[data-act]')?.getAttribute('data-act') ?? null, band: !!el.closest('.band-labels'), footer: !!el.closest('footer'), seen: onScreen && opacity > 0.5 };
    });
    if (!info) continue;
    if (info.section) reached.add(info.section);
    if (info.band) bands += 1;
    if (!info.seen) unseen.push(info.what);
    if (info.footer) break;
  }
  expect(unseen, 'focus on something that cannot be seen').toEqual([]);
  expect(bands, 'the index: one link per layer').toBe(11);
  for (const id of ['surface', 'explode', 'current', 'genten', 'site-migration', 'php-audit', 'auction', 'patent', 'deep', 'catchup', 'next']) expect([...reached], id).toContain(id);
});

test('security headers on every kind of response; the pages run inside the Content-Security-Policy', async ({ page, request }) => {
  test.setTimeout(180_000);
  for (const path of ['/ja', '/en/work/genten', '/ja/evidence/php-files', '/no-such-page', '/media/og/ja.jpg']) {
    const h = (await request.get(path)).headers();
    const csp = h['content-security-policy'] ?? '';
    for (const part of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'", "font-src 'self'"]) expect(csp, `${path}: ${part}`).toContain(part);
    expect(csp, 'no eval, no remote script host').not.toMatch(/unsafe-eval|https?:/);
    expect(h['strict-transport-security'], path).toContain('max-age=63072000');
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy'], path).toContain('camera=()');
  }
  // Nothing the site does is refused by its own policy: the cinema, a world, the evidence dialog.
  const refused: string[] = [];
  page.on('console', (m) => /Content Security Policy|Refused to/.test(m.text()) && refused.push(m.text().slice(0, 200)));
  await page.goto('/ja?quality=low&dpr=0.4');
  await startStage(page);
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('section[data-act="auction"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * 0.75);
  });
  await expect(page.locator('section[data-act="auction"]')).toHaveAttribute('data-result', '', { timeout: 60_000 });
  await page.locator('section[data-act="auction"] .act-result a.metric').first().click();
  await expect(page.locator('dialog#evidence-dialog .evidence-panel')).toBeVisible();
  expect(refused).toEqual([]);
});

test('link previews and crawlers: OGP and X cards with a real image, Person data, sitemap, robots, 404', async ({ page, request }) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const meta = (p: string) => page.locator(`meta[property="${p}"], meta[name="${p}"]`).first().getAttribute('content');
    expect(await meta('og:title')).toBe(await page.title());
    expect(((await meta('og:description')) ?? '').length).toBeGreaterThan(40);
    expect(await meta('og:description')).toBe(await meta('description'));
    expect(await meta('og:locale')).toBe(locale === 'ja' ? 'ja_JP' : 'en_US');
    expect(await meta('twitter:card')).toBe('summary_large_image');
    const image = new URL((await meta('og:image')) as string);
    expect(image.pathname).toBe(`/media/og/${locale}.jpg`);
    const res = await request.get(image.pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/jpeg');
    expect((await res.body()).length).toBeGreaterThan(50_000);
    expect(await meta('og:image:width')).toBe('1200');
    // Person: the public facts only — no e-mail address.
    const person = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as Record<string, unknown>;
    expect(person['@type']).toBe('Person');
    expect(person.name).toBe(CONTENT[locale].person.name);
    expect(person.sameAs).toEqual(ALLOWED_URLS.filter((u) => /github\.com|dev\.to\/kaze001$/.test(u)));
    expect(JSON.stringify(person)).not.toContain('@gmail');
    await expect(page.locator(`link[rel="alternate"][hreflang="${locale === 'ja' ? 'en' : 'ja'}"]`)).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const locale of LOCALES) {
    expect(sitemap).toContain(`/${locale}</loc>`);
    for (const id of WORK_IDS) expect(sitemap).toContain(`/${locale}/work/${id}</loc>`);
    for (const m of CONTENT[locale].metrics) expect(sitemap).toContain(`/${locale}/evidence/${m.id}</loc>`);
  }
  expect(sitemap).not.toContain('/fragment');
  // Before launch the crawlers are kept out (SITE_LAUNCHED is not set in the test build).
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow: \/\s*$/m);
  const missing = await request.get('/ja/no-such-page');
  expect(missing.status()).toBe(404);
  await page.goto('/ja/no-such-page');
  await expect(page.locator('section[lang="ja"] h1')).toBeVisible();
  await expect(page.locator('section[lang="en"] a')).toHaveAttribute('href', '/en');
});

test('the three counts written in interface labels match what they count', async ({ page }) => {
  // Numbers in the content are checked against the fact sheet by `npm run validate`; these three sit
  // in labels (messages/*.json) and are checked here against the lists they name.
  for (const locale of LOCALES) {
    await page.goto(`/${locale}?quality=static`);
    const counted = async (list: string, items: string) => {
      const label = (await page.locator(list).getAttribute('aria-label')) ?? '';
      const words: Record<string, number> = { four: 4, eight: 8 };
      const n = /\d+/.exec(label)?.[0] ?? Object.entries(words).find(([w]) => label.toLowerCase().includes(w))?.[1];
      expect(Number(n), `${locale} ${list}: "${label}"`).toBe(await page.locator(`${list} ${items}`).count());
    };
    await counted('section[data-act="genten"] ol.gates', '> li');
    await counted('section[data-act="patent"] ol.stations', '> li');
    await counted('section[data-act="deep"] ol.deep-cards', '> li');
  }
});
