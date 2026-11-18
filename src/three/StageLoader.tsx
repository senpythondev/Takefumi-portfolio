'use client';

import { useEffect } from 'react';

const TRIGGERS = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'] as const;

/**
 * Decides whether and when to load the 3D stage. Part of the initial bundle, so it stays tiny:
 * it imports nothing from three.js / R3F / drei.
 *
 * - Never loads under prefers-reduced-motion, Save-Data, or ?quality=static (CLAUDE.md §4).
 * - Loads on the first interaction only (pointer, touch, wheel, key, scroll).
 *   Loading on idle after `load` was measured at TBT ≈ 1.1 s (Lighthouse, 3D forced on), 5× the
 *   200 ms budget, so per the Phase 3 plan (design point 2) the idle trigger was dropped.
 *   The cost of the 3D path itself is measured separately (docs/WORKLOG.md).
 */
export function StageLoader() {
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('quality');
    if (forced === 'static') return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!forced && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || saveData)) return;

    let started = false;
    const cleanup = () => {
      for (const t of TRIGGERS) window.removeEventListener(t, start);
    };
    function start() {
      if (started) return;
      started = true;
      cleanup();
      // Budget tests split JS into initial / 3D at this mark (tests/budget/*.spec.ts).
      performance.mark('stage:start');
      void import('./boot').then(({ boot }) => boot(forced));
    }
    for (const t of TRIGGERS) window.addEventListener(t, start, { once: true, passive: true });
    return cleanup;
  }, []);

  return null;
}
