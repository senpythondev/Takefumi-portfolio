'use client';

import { useEffect } from 'react';

const TRIGGERS = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'] as const;

/**
 * Runs `fn` only after the browser has painted its response to the current interaction
 * (PM_REVIEW_07 §3-1): the frame callback runs just before that paint, and the task it schedules
 * runs after it, so loading and evaluating the 3D code can never delay the visitor's first
 * interaction (INP). Priority 'user-visible', not 'background': measured (mobile, CPU 4×, warm
 * cache) both give a first-interaction INP of 16–32 ms, but 'background' showed the 3D ~300 ms
 * later (803–917 ms vs 574–600 ms after the tap) because other page work kept starving it.
 */
function afterNextPaint(fn: () => void): void {
  requestAnimationFrame(() => {
    const scheduler = (globalThis as { scheduler?: { postTask?: (cb: () => void, o: { priority: string }) => Promise<unknown> } }).scheduler;
    if (scheduler?.postTask) void scheduler.postTask(fn, { priority: 'user-visible' });
    else setTimeout(fn, 0);
  });
}

/**
 * Decides whether and when to load the 3D stage. Part of the initial bundle, so it stays tiny:
 * it imports nothing from three.js / R3F / drei.
 *
 * - Never loads under prefers-reduced-motion, Save-Data, or ?quality=static (CLAUDE.md §4).
 * - `<html data-stage>` says where it is: `off` (will not load), `armed` (listening for the first
 *   interaction), `loading`, then `live` (set by the stage). Tests interact only once it is `armed`:
 *   an interaction before hydration reaches no listener (seen on CI: the stage never started).
 * - Loads on the first interaction only (pointer, touch, wheel, key, scroll).
 *   Loading on idle after `load` was measured at TBT ≈ 1.1 s (Lighthouse, 3D forced on), 5× the
 *   200 ms budget, so per the Phase 3 plan (design point 2) the idle trigger was dropped.
 *   The cost of the 3D path itself is measured separately (docs/WORKLOG.md).
 */
export function StageLoader() {
  useEffect(() => {
    const root = document.documentElement;
    const forced = new URLSearchParams(window.location.search).get('quality');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (forced === 'static' || (!forced && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || saveData))) {
      root.dataset.stage = 'off';
      return;
    }

    let started = false;
    const cleanup = () => {
      for (const t of TRIGGERS) window.removeEventListener(t, start);
    };
    function start() {
      if (started) return;
      started = true;
      cleanup();
      root.dataset.stage = 'loading';
      // Budget tests split JS into initial / 3D at this mark (tests/budget/*.spec.ts).
      performance.mark('stage:start');
      afterNextPaint(() => void import('./boot').then(({ boot }) => boot(forced)));
    }
    for (const t of TRIGGERS) window.addEventListener(t, start, { once: true, passive: true });
    root.dataset.stage = 'armed';
    return () => {
      cleanup();
      if (root.dataset.stage === 'armed') delete root.dataset.stage;
    };
  }, []);

  return null;
}
