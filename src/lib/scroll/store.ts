/**
 * Shared scroll / stage state. Imported by the initial islands AND by the lazily loaded
 * effects/stage chunks, so it must stay dependency-free and tiny.
 *
 * - `scrollStore` holds low-frequency state (current layer, passed layers, quality) and notifies
 *   React subscribers through useSyncExternalStore.
 * - `scrollLive` holds per-frame values (progress 0–1 per layer). It is mutated in place and read
 *   inside the render loop; it never triggers React renders.
 */
import { useSyncExternalStore } from 'react';

export type Quality = 'high' | 'medium' | 'low' | 'static';

export type ScrollState = {
  /** Index into the layer order (0 = surface). */
  index: number;
  layerId: string;
  /** Layers the visitor has reached, in order (drives the boring-core rings). */
  passed: readonly string[];
  /** 'pending' until the stage decides; 'static' when no 3D runs. */
  quality: Quality | 'pending';
};

let state: ScrollState = { index: 0, layerId: 'surface', passed: ['surface'], quality: 'pending' };
const listeners = new Set<() => void>();

export const scrollStore = {
  get: (): ScrollState => state,
  set(partial: Partial<ScrollState>): void {
    const next = { ...state, ...partial };
    if (
      next.index === state.index &&
      next.layerId === state.layerId &&
      next.quality === state.quality &&
      next.passed.length === state.passed.length
    ) {
      return;
    }
    state = next;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const scrollLive: { progress: Record<string, number> } = { progress: {} };

export function useScrollState<T>(select: (s: ScrollState) => T): T {
  return useSyncExternalStore(
    scrollStore.subscribe,
    () => select(scrollStore.get()),
    () => select(scrollStore.get()),
  );
}
