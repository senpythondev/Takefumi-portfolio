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

export const scrollLive: {
  /** Per layer: 0 when its top enters the bottom of the viewport, 1 when its bottom leaves the top. */
  progress: Record<string, number>;
  /**
   * Per act of the cinematic home (docs/STORYBOARD.md): 0–1 across its pinned scroll length
   * (`[data-act]`: top of the section at the top of the viewport → bottom at the bottom), and
   * `join`: 0–1 while the section after the acts scrolls in (`[data-act-join]`).
   */
  acts: Record<string, number>;
  /** 0–1: the navigator's 3D core steps back while the hero core owns the screen (set by the director). */
  navOpacity: number;
  /** The director's springs are still moving: the low tier keeps drawing until they settle. */
  settling: boolean;
  /** Index of the band pointed at in 3D (the director's raycast), or -1. */
  pointerBand: number;
  /** Where that band is on screen (px): the cursor's ring is drawn toward it (§11.2). */
  pointerBandAt: [number, number] | null;
  /** Index of the band whose link is hovered or focused (src/lib/scroll/cinema-ui.ts), or -1. */
  linkBand: number;
  /** Set by a flight to an act (cinema-ui): the index of the act; the director snaps there instead of sweeping through the acts between (−1: none). */
  jumpTo: number;
  /** The split core is on screen and can be chosen from (act 2 and the moments between worlds). */
  hub: boolean;
  /** Bare rock is on screen (the wall of acts 0–1, the bedrock): a click on it drills (§11.4). */
  rock: boolean;
  /** The layer of the act on screen (the numbers a drilled hole prefers). */
  layer: string;
  /** §10-C: the big number under the pointer (screen px, and a number that tells the numbers apart), or null. */
  thread: { x: number; y: number; seed: number } | null;
  /** §10-C: when a number was clicked (performance.now()), 0 otherwise: the camera follows its thread. */
  threadFollow: number;
  /** §9-3: how far the result of the act on screen has been revealed by the scroll (0–1), and which act. */
  reveal: number;
  revealAct: string;
  /** A sealing in gold is playing (3-4, the finale): the optional sound rings once (§10-H). */
  gold: boolean;
} = { progress: {}, acts: {}, navOpacity: 1, settling: false, pointerBand: -1, pointerBandAt: null, linkBand: -1, jumpTo: -1, hub: false, rock: false, layer: 'surface', thread: null, threadFollow: 0, reveal: 0, revealAct: '', gold: false };

export function useScrollState<T>(select: (s: ScrollState) => T): T {
  return useSyncExternalStore(
    scrollStore.subscribe,
    () => select(scrollStore.get()),
    () => select(scrollStore.get()),
  );
}
