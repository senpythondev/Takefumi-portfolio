/**
 * The feel of the cinematic home (docs/STORYBOARD.md v2.5 §9, §11.1): how long the acts are, how far
 * one step of the wheel goes, how briefly the picture is smoothed behind the scroll, and how
 * present the stardust is.
 *
 * One mutable object read every frame by the scroll effects and the director. The defaults are the
 * site's values; `?debug=scroll` (src/components/debug/scroll-panel.ts) lets the owner change them
 * with sliders, kept in this browser's localStorage and applied only while that parameter is in
 * the URL. Dependency-free: imported by the effects chunk and the 3D chunks.
 */
export type Tune = {
  /** Scroll length of every act, as a multiple of its `len` (src/content/acts.ts). */
  length: number;
  /** Distance of one wheel step on desktop, as a multiple of the browser's own (no inertia: the page stops with the wheel). */
  wheel: number;
  /** Seconds the picture is smoothed behind the scroll (63 % of a step; 0 = none). Only to take out judder. */
  smooth: number;
  /** Stardust (§11.1): how many grains (1 = the default amount), how bright, how far the pointer draws them (fraction of the width). */
  stars: number;
  starLight: number;
  starPull: number;
};

export const TUNE_DEFAULTS: Readonly<Tune> = { length: 1.5, wheel: 0.5, smooth: 0.12, stars: 1, starLight: 1, starPull: 0.025 };
export const TUNE_RANGES: Readonly<Record<keyof Tune, readonly [min: number, max: number, step: number]>> = {
  length: [1, 2.5, 0.05],
  wheel: [0.2, 1, 0.05],
  smooth: [0, 0.3, 0.01],
  stars: [0, 2, 0.05],
  starLight: [0, 2, 0.05],
  starPull: [0, 0.05, 0.0025],
};
/** A new key: the values saved by the v2.3 panel (inertia, tempo) no longer mean anything. */
export const TUNE_KEY = 'gt-scroll-tune-2';

export const tune: Tune = { ...TUNE_DEFAULTS };

/** After the scroll has stopped, the picture comes to rest within this long (§9-1). */
export const REST_SECONDS = 0.28;

/** Angular frequency of a critically damped spring that covers 63 % of a step in `seconds`. */
export const omegaFor = (seconds: number) => 2.146 / Math.max(0.01, seconds);

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
