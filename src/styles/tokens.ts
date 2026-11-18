/**
 * Design tokens — the single source for colour, type, spacing and motion (CLAUDE.md §2).
 *
 * - CSS: scripts/build-tokens.ts writes src/styles/tokens.generated.css (Tailwind `@theme` + `:root`);
 *   `npm run validate` fails when that file is stale or when the layer palette breaks the rules below.
 * - 3D: import the values directly (three.js takes the hex strings).
 *
 * Rules (PM_REVIEW_08 §2):
 * - Signal colours (evidence cyan, crisis red-orange, convergence green) are only for glowing or
 *   emphasis — never a layer colour.
 * - Layer colours are muted earth and rock tones, defined in OKLCH (comment) and stored as sRGB hex.
 *   Neighbouring layers alternate lighter/darker so their bands stay distinct in the core:
 *   contrast ratio between neighbours ≥ LAYER_NEIGHBOUR_MIN_CONTRAST (checked by build-tokens).
 */

export const base = {
  ground: '#13110f', // page background: warm black, underground
  stratum: '#1b1815', // panels, chips, the evidence drawer
  seam: '#34302a', // hairlines between layers
  ink: '#ece6dd', // body text — 15.2:1 on ground
  inkMuted: '#b3aa9f', // secondary text — 8.2:1 on ground
} as const;

export const signal = {
  evidence: '#8fcbd0', // cold cyan: evidence, links to evidence, glow of a passed layer
  crisis: '#e26943', // red-orange: incidents, the contaminated files in the city — the only warm accent
  ok: '#9cc9a0', // calm green: convergence, "available"
} as const;

/** Badge colours per confidence level (display names: 確認済み/Verified, 概算/Approx., 再現/Reconstructed). */
export const confidence = {
  measured: signal.evidence,
  approx: '#ddb877',
  reconstructed: '#d3b9a6',
} as const;

/** One colour per stratum, top (surface) to bottom (next). OKLCH source in the comments. */
export const layer = {
  surface: '#988979', // oklch(0.64 0.030 70)  weathered topsoil
  current: '#4c6970', // oklch(0.50 0.035 215) slate
  genten: '#8c9b7e', // oklch(0.67 0.045 130) sage
  pegasus: '#5a677e', // oklch(0.51 0.040 262) blue slate
  'php-audit': '#9d7665', // oklch(0.60 0.055 45) muted rust — kept clear of the crisis red-orange
  auction: '#b2a381', // oklch(0.72 0.050 88)  sandstone
  patent: '#5c6e7c', // oklch(0.53 0.030 240) grey shale
  deep: '#8f7f97', // oklch(0.62 0.040 315) mauve mudstone
  catchup: '#4a645b', // oklch(0.48 0.035 170) green-grey
  bedrock: '#86776c', // oklch(0.58 0.025 60)  umber
  next: '#4d463f', // oklch(0.40 0.015 70)  not yet excavated
} as const;

export type LayerColorId = keyof typeof layer;

/** Minimum WCAG contrast ratio between neighbouring layer colours (bands must read apart in the core). */
export const LAYER_NEIGHBOUR_MIN_CONTRAST = 1.4;

/** The city (layer 4, Phase 5): cold blue-grey buildings so the contaminated files are the only warm colour. */
export const city = {
  building: '#444e59', // oklch(0.42 0.022 250)
  buildingLit: '#667380', // oklch(0.55 0.025 248) upper floors / far fog blend
  pulse: signal.crisis,
  fog: base.ground,
} as const;

/** Font stacks. Phase 4-2 puts the self-hosted subset fonts in front of these system fallbacks. */
export const font = {
  sans: ["'Hiragino Sans'", "'Hiragino Kaku Gothic ProN'", "'Noto Sans JP'", "'Noto Sans CJK JP'", "'Yu Gothic UI'", "'Meiryo'", 'system-ui', 'sans-serif'],
  mono: ['ui-monospace', "'SFMono-Regular'", "'Menlo'", "'Consolas'", "'Hiragino Sans'", "'Noto Sans JP'", "'Noto Sans CJK JP'", "'Yu Gothic UI'", 'sans-serif'],
} as const;

export const space = {
  gutter: 'clamp(1rem, 4vw, 3rem)',
  measure: '46rem',
} as const;

/** Motion: heavy and physical (BRIEF §7) — slow out, no bounce. */
export const motion = {
  ease: {
    strata: 'cubic-bezier(0.2, 0.7, 0.2, 1)', // settling under pressure (drawer, reveals)
    drill: 'cubic-bezier(0.6, 0, 0.4, 1)', // resistance, then through
  },
  duration: {
    quick: '160ms',
    base: '220ms',
    slow: '400ms',
  },
} as const;
