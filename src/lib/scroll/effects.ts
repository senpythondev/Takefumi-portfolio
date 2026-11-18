/**
 * Deferred effects bundle: Lenis + GSAP ScrollTrigger, driven by ONE requestAnimationFrame loop
 * (gsap.ticker) that also advances the R3F stage (Phase 3 plan, design point 6).
 * Never loaded for reduced motion or the static tier.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { scrollLive } from './store';

export type FrameListener = (timeMs: number) => void;

export type Effects = {
  lenis: Lenis;
  addFrameListener: (fn: FrameListener) => () => void;
  destroy: () => void;
};

export function startEffects(): Effects {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Touch devices keep native scrolling (syncTouch off): iOS momentum and performance first.
  const lenis = new Lenis({ autoRaf: false, syncTouch: false, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);

  const frameListeners = new Set<FrameListener>();
  const tick = (timeSeconds: number) => {
    const ms = timeSeconds * 1000;
    lenis.raf(ms);
    for (const fn of frameListeners) fn(ms);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // Progress 0–1 per layer, read by the scenes every frame. No pinning: the sticky layout is CSS.
  const triggers = [...document.querySelectorAll<HTMLElement>('section.layer[data-layer]')].map((section) => {
    const id = section.dataset.layer as string;
    return ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        scrollLive.progress[id] = self.progress;
      },
    });
  });

  return {
    lenis,
    addFrameListener(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    destroy() {
      gsap.ticker.remove(tick);
      for (const t of triggers) t.kill();
      lenis.destroy();
    },
  };
}
