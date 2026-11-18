import { expect, test } from '@playwright/test';

/**
 * Until launch every response carries X-Robots-Tag: noindex, nofollow (PM_REVIEW_07 §5-1).
 * Only a build with SITE_LAUNCHED=true drops it (Phase 7); the test build never sets it.
 */
test.describe('pre-launch headers', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'server headers: one project is enough'));

  for (const path of ['/', '/ja', '/en', '/icon.svg', '/does-not-exist', '/lab/city']) {
    test(`${path} is marked noindex, nofollow`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
    });
  }

  test('graphics labs are not part of production builds', async ({ request }) => {
    expect((await request.get('/lab/city')).status()).toBe(404);
  });
});
