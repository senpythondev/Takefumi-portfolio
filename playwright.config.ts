import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

/**
 * Three required projects (CLAUDE.md §7): desktop / mobile / reduced-motion.
 * `budget` measures the initial-JS budget (CLAUDE.md §4) and runs separately (`npm run budget`).
 * Requires a production build (`npm run build`) — the web server is `next start`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  projects: [
    { name: 'desktop', testDir: './tests/e2e', use: desktop },
    { name: 'mobile', testDir: './tests/e2e', use: { ...devices['Pixel 7'] } },
    { name: 'reduced-motion', testDir: './tests/e2e', use: { ...desktop, contextOptions: { reducedMotion: 'reduce' } } },
    { name: 'budget', testDir: './tests/budget', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/ja`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
