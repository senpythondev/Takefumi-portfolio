/**
 * Lazy entry point of the effects/3D layer, imported by StageLoader.
 * Loads in three separate steps (separate chunks, separate tasks) so no single long task is
 * created: quality decision → effects bundle (Lenis + GSAP) → 3D base (three + R3F + drei).
 * The performance marks let tests attribute every chunk to its budget.
 */
import { scrollStore } from '@/lib/scroll/store';
import { decideQuality } from './quality';

/** Give the main thread back between steps so each step is its own, shorter task. */
function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}

export async function boot(forced: string | null): Promise<void> {
  const decision = decideQuality(forced);
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { __qualityDecision: unknown }).__qualityDecision = decision;
  }
  if (decision.quality === 'static') {
    scrollStore.set({ quality: 'static' });
    document.documentElement.dataset.stage = 'off';
    return;
  }

  await yieldToMain();
  performance.mark('stage:effects');
  const { startEffects } = await import('@/lib/scroll/effects');
  await yieldToMain();
  const effects = startEffects();

  await yieldToMain();
  performance.mark('stage:3d');
  // One import on purpose: importing 'three' on its own pulls in the whole namespace and defeats
  // tree-shaking (measured: 3D base 195.2 KB → 257.6 KB). A module's evaluation cannot be split.
  const { mountStage } = await import('./Stage');
  await yieldToMain();
  performance.mark('stage:scenes');
  // A forced tier (?quality=) is pinned for testing/debugging; add &adaptive=1 to let it adapt.
  const params = new URLSearchParams(window.location.search);
  const adaptive = forced === null || params.has('adaptive');
  await mountStage({ quality: decision.quality, adaptive, addFrameListener: effects.addFrameListener });
}
