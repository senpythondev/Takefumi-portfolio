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

/** Next idle moment after `load` (Safari has no requestIdleCallback). */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 400);
  return () => window.clearTimeout(id);
}

/** How far the act-0 borehole is drilled when each loading step completes (boot/Stage marks). */
const DRILL_STEPS: Record<string, number> = { 'stage:start': 0.12, 'stage:effects': 0.3, 'stage:3d': 0.52, 'stage:scenes': 0.72, 'stage:live': 0.88 };

function setDrill(value: number) {
  // On the small fixed backdrop, never on <html>: a custom property changed on the root makes the
  // browser recompute the style of every element of this long page (measured on CI: +80 ms of
  // style and layout at 4× on the static page).
  const world = document.querySelector<HTMLElement>('.world');
  world?.style.setProperty('--drill', value.toFixed(3));
  // §10-A: the borehole is not drilled step by step any more — the strata are laid down while the
  // page loads, and the hole is driven down in one go when loading is done.
  world?.style.setProperty('--bore', value >= 0.88 ? value.toFixed(3) : '0');
  const pct = document.querySelector<HTMLElement>('[data-drill-pct]');
  if (pct) pct.textContent = `${Math.round(value * 100)}%`;
}

/**
 * The stills of the stacked version (src/components/acts/ActStill.tsx) load only as they come near
 * the viewport (`data-near`). Never during the page load: a request started by script before the
 * LCP made Lighthouse's simulation count all the JS before it as part of the LCP (4.4 s instead of
 * 0.9 s). On the 3D path the stills are not displayed, so they are never near and never load.
 */
function watchStills(): () => void {
  if (!('IntersectionObserver' in window)) {
    for (const el of document.querySelectorAll<HTMLElement>('.act-still')) el.dataset.near = '';
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.near = '';
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px 15% 0px' },
  );
  for (const el of document.querySelectorAll('.act-still')) io.observe(el);
  return () => io.disconnect();
}

/**
 * Decides whether and when to load the 3D stage. Part of the initial bundle, so it stays tiny:
 * it imports nothing from three.js / R3F / drei.
 *
 * - Never loads under prefers-reduced-motion, Save-Data, or ?quality=static (CLAUDE.md §4): the
 *   page stays the stacked, poster-and-HTML version of the story (`data-stage="off"`).
 * - Otherwise the 3D starts preparing right after `load`, at the next idle moment — it does not
 *   wait for an interaction (STORYBOARD §3-2). An earlier interaction starts it sooner. The
 *   cinematic layout (`<html data-cinema>`: pinned acts) is switched on by boot.ts only once the
 *   quality decision says the 3D will run: a device that falls back to the static tier never
 *   toggles it (switching it off again is reported by Chrome as a full-screen layout shift).
 * - Act 0: the borehole on the poster is drilled as the loading steps complete (`--drill` 0–1, with
 *   the real percentage); when the wall is drawn it takes over from there.
 * - `<html data-stage>`: `off`, `armed` (waiting), `loading`, then `live` (set by the stage).
 */
export function StageLoader() {
  useEffect(() => watchStills(), []);
  useEffect(() => {
    const root = document.documentElement;
    const forced = new URLSearchParams(window.location.search).get('quality');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (forced === 'static' || (!forced && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || saveData))) {
      root.dataset.stage = 'off';
      setDrill(1);
      return;
    }

    setDrill(0.04);
    let drilled = 0.04;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const step = DRILL_STEPS[entry.name];
          if (step && step > drilled) setDrill((drilled = step));
        }
      });
      observer.observe({ type: 'mark', buffered: true });
    } catch {
      // no PerformanceObserver: the borehole simply appears with the wall
    }

    let started = false;
    let cancelIdle = () => {};
    const cleanup = () => {
      for (const t of TRIGGERS) window.removeEventListener(t, start);
      window.removeEventListener('load', onLoad);
      cancelIdle();
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
    function onLoad() {
      cancelIdle = whenIdle(start);
    }
    for (const t of TRIGGERS) window.addEventListener(t, start, { once: true, passive: true });
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    root.dataset.stage = 'armed';
    return () => {
      cleanup();
      observer?.disconnect();
      if (root.dataset.stage === 'armed') delete root.dataset.stage;
    };
  }, []);

  return null;
}
