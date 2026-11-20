/**
 * Deferred effects bundle: Lenis + GSAP ScrollTrigger, driven by ONE requestAnimationFrame loop
 * (gsap.ticker) that also advances the R3F stage (Phase 3 plan, design point 6).
 * Never loaded for reduced motion or the static tier.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { scrollLive } from './store';
import { loadTune, tune } from './tune';

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
  // Desktop (STORYBOARD v2.5 §9-2): no inertia — the page moves with the wheel and stops with it
  // (lerp 1: every wheel event is applied at once) — and a shorter distance for each step of the
  // wheel, read from the tuning every time so the ?debug=scroll panel changes it live.
  // Lenis stays for the flights (scrollTo with an easing) and for the anchors.
  loadTune();
  const lenis = new Lenis({
    autoRaf: false,
    syncTouch: false,
    anchors: true,
    lerp: 1,
    virtualScroll: (data) => {
      if (data.event.type === 'wheel') {
        data.deltaX *= tune.wheel;
        data.deltaY *= tune.wheel;
      }
      return true;
    },
  });
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
  const triggers = [...document.querySelectorAll<HTMLElement>('section[data-layer]')].map((section) => {
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

  // Acts of the cinematic home: pinned sections (position: sticky in CSS), 0–1 over their scroll length.
  for (const section of document.querySelectorAll<HTMLElement>('[data-act]')) {
    const id = section.dataset.act as string;
    // An act with content after its pinned part (the finale's drawer) ends at its spacer.
    const endTrigger = section.querySelector<HTMLElement>('[data-act-end]') ?? section;
    triggers.push(
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        endTrigger,
        end: 'bottom bottom',
        onUpdate: (self) => {
          scrollLive.acts[id] = self.progress;
        },
      }),
    );
  }
  // The finale's drawer (STORYBOARD v2.1 act 7): the empty band opens as its content rises.
  const drawer = document.querySelector<HTMLElement>('[data-act-drawer]');
  if (drawer) {
    triggers.push(
      ScrollTrigger.create({
        trigger: drawer,
        start: 'top bottom',
        end: 'top 35%',
        onUpdate: (self) => {
          scrollLive.acts.drawer = self.progress;
        },
      }),
    );
  }

  // The acts change height when the cinema switches on or off: re-measure the triggers.
  let refreshTimer = 0;
  const resize = new ResizeObserver(() => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 120);
  });
  resize.observe(document.body);

  return {
    lenis,
    addFrameListener(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    destroy() {
      gsap.ticker.remove(tick);
      resize.disconnect();
      for (const t of triggers) t.kill();
      lenis.destroy();
    },
  };
}
