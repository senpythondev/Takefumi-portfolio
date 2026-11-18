import { expect, test } from '@playwright/test';
import { createQualityGovernor } from '../../src/three/quality';

/**
 * Tier changes from PerformanceMonitor signals, checked without a browser (the frame rate on a test
 * machine is too close to the thresholds to drive these cases reliably). Runs once, in `desktop`.
 */
test.describe('quality governor', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pure logic: one project is enough'));

  test('a smooth desktop at high stays at high (inclines at the top tier change nothing)', () => {
    const g = createQualityGovernor('high');
    for (let i = 0; i < 20; i++) expect(g.step(1)).toBeNull();
    expect(g.get()).toBe('high');
  });

  test('sustained load still reaches static after any number of earlier inclines', () => {
    // The 3-10 regression: drei counted these inclines toward its fallback and pinned the tier at low.
    const g = createQualityGovernor('high');
    for (let i = 0; i < 4; i++) g.step(1);
    expect([g.step(-1), g.step(-1), g.step(-1)]).toEqual(['medium', 'low', 'static']);
    expect(g.step(-1)).toBeNull();
  });

  test('oscillation stops climbing but never blocks a decline', () => {
    const g = createQualityGovernor('medium');
    expect([g.step(1), g.step(-1), g.step(1)]).toEqual(['high', 'medium', 'high']); // two reversals
    expect(g.step(1)).toBeNull();
    expect(g.step(-1)).toBe('medium');
    expect(g.step(1)).toBeNull(); // settled: no more climbing
    expect([g.step(-1), g.step(-1)]).toEqual(['low', 'static']);
  });
});
