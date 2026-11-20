/**
 * The feel of the cinematic home (docs/STORYBOARD.md v2.3 §9): how long the acts are, how the wheel
 * scrolls, how slowly the picture follows the scroll, and how fast the key moments play.
 *
 * One mutable object read every frame by the scroll effects and the director. The defaults are the
 * site's values; `?debug=scroll` (src/components/debug/scroll-panel.ts) lets the owner change them
 * with sliders, kept in this browser's localStorage and applied only while that parameter is in
 * the URL. Dependency-free: imported by the effects chunk and the 3D chunks.
 */
export type Tune = {
  /** Scroll length of every act, as a multiple of its `len` (src/content/acts.ts). */
  length: number;
  /** Wheel sensitivity on desktop (1 = the browser's own step). */
  wheel: number;
  /** Inertia of the desktop scroll: Lenis's lerp per frame at 60 fps (smaller glides longer). */
  inertia: number;
  /** Seconds for the picture to cover 63 % of the way to where the scroll is (critically damped). */
  smooth: number;
  /** Speed of the key moments (1 = the durations in acts.ts; 2 = twice as fast). */
  tempo: number;
};

export const TUNE_DEFAULTS: Readonly<Tune> = { length: 1.5, wheel: 0.7, inertia: 0.07, smooth: 0.7, tempo: 1 };
export const TUNE_RANGES: Readonly<Record<keyof Tune, readonly [min: number, max: number, step: number]>> = {
  length: [1, 2.5, 0.05],
  wheel: [0.3, 1.5, 0.05],
  inertia: [0.03, 0.15, 0.005],
  smooth: [0.2, 1.5, 0.05],
  tempo: [0.5, 2, 0.05],
};
export const TUNE_KEY = 'gt-scroll-tune';

export const tune: Tune = { ...TUNE_DEFAULTS };

/** Angular frequency of a critically damped spring that covers 63 % of a step in `seconds`. */
export const omegaFor = (seconds: number) => 2.146 / Math.max(0.05, seconds);

/** Apply the saved values (only with ?debug=scroll) and the act length to the page. */
export function loadTune(): void {
  if (new URLSearchParams(window.location.search).get('debug') === 'scroll') {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TUNE_KEY) ?? '{}') as Partial<Tune>;
      for (const key of Object.keys(TUNE_DEFAULTS) as (keyof Tune)[]) {
        const v = saved[key];
        const [min, max] = TUNE_RANGES[key];
        if (typeof v === 'number' && Number.isFinite(v)) tune[key] = Math.min(max, Math.max(min, v));
      }
    } catch {
      // No storage (private window): the defaults stand.
    }
  }
  applyLength();
}

/** The acts' pinned length is CSS (`--act-scale`); the scroll triggers re-measure on the resize. */
export function applyLength(): void {
  document.documentElement.style.setProperty('--act-scale', String(tune.length));
}
