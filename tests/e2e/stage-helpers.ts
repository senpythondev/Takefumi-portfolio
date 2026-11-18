import { expect, type Page } from '@playwright/test';

/**
 * Time for the 3D stage to go live after the first interaction. CI runners render WebGL in
 * software and run tests in parallel; 15 s was occasionally not enough there (CI run 7).
 */
export const STAGE_LIVE_TIMEOUT = 45_000;

/**
 * Starts the 3D stage the way a visitor does — with an interaction — but only once StageLoader is
 * listening (`data-stage="armed"`, i.e. after hydration). Interacting earlier reaches no listener:
 * on CI that left the stage unstarted and the test waiting for nothing (run 8, from the trace).
 */
export async function startStage(page: Page, interact: (page: Page) => Promise<void> = (p) => p.mouse.move(20, 20)): Promise<void> {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-stage', /^(armed|loading|live)$/, { timeout: 30_000 });
  await interact(page);
  await expect(html).toHaveAttribute('data-stage', 'live', { timeout: STAGE_LIVE_TIMEOUT });
}

/** The page decided not to load 3D at all (static tier, reduced motion, Save-Data). */
export async function expectStageOff(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'off', { timeout: 30_000 });
}
