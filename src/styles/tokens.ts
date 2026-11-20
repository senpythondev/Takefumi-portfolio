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

/**
 * The nearest traditional Japanese colour name for each stratum (STORYBOARD v2.1 §8.8), shown small
 * on the band labels and the case-study headers. A name, not a new value: the hex above stays the
 * single source and keeps the neighbour-contrast rule.
 */
export const layerName: Record<LayerColorId, { ja: string; romaji: string }> = {
  surface: { ja: '胡桃染', romaji: 'kurumizome' },
  current: { ja: '藍鼠', romaji: 'ainezu' },
  genten: { ja: '青磁色', romaji: 'seiji-iro' },
  pegasus: { ja: '紺鼠', romaji: 'konnezu' },
  'php-audit': { ja: '錆色', romaji: 'sabi-iro' },
  auction: { ja: '黄土色', romaji: 'ōdo-iro' },
  patent: { ja: '藍鉄色', romaji: 'aitetsu-iro' },
  deep: { ja: '鳩羽色', romaji: 'hatoba-iro' },
  catchup: { ja: '鉄色', romaji: 'tetsu-iro' },
  bedrock: { ja: '煤竹色', romaji: 'susutake-iro' },
  next: { ja: '墨色', romaji: 'sumi-iro' },
};

/**
 * Kintsugi gold (STORYBOARD v2.1 §8.4): used in exactly two places, the sealed cracks of the PHP
 * audit and the seams of the rebuilt core in the finale. Not a CSS variable on purpose; a unit test
 * fails (`npm run validate`, scripts/build-tokens.ts) if any other module uses it.
 */
export const kintsugi = '#d4a94e'; // oklch(0.75 0.11 82)

/** Minimum WCAG contrast ratio between neighbouring layer colours (bands must read apart in the core). */
export const LAYER_NEIGHBOUR_MIN_CONTRAST = 1.4;

/** The city (layer 4, Phase 5): cold blue-grey buildings so the contaminated files are the only warm colour. */
export const city = {
  building: '#444e59', // oklch(0.42 0.022 250)
  buildingLit: '#667380', // oklch(0.55 0.025 248) upper floors / far fog blend
  pulse: signal.crisis,
  fog: base.ground,
} as const;

/**
 * Font stacks. The self-hosted subset faces (src/fonts/active.ts, via next/font: --font-face-*) come
 * first; each var() has a fallback so the stack stays valid where they are not defined.
 * - Japanese in the mono stack falls through to the sans face, never to an OS-wide fallback search
 *   (that search made /ja's layout 2.5× /en's on CI — PM_REVIEW_07 §2-3).
 * - The sans stack lists the mono face after the sans face for symbols the Japanese face lacks (≈ ✓ ↺).
 */
const systemJa = ["'Hiragino Sans'", "'Hiragino Kaku Gothic ProN'", "'Noto Sans JP'", "'Noto Sans CJK JP'", "'Yu Gothic UI'", "'Meiryo'"];
export const font = {
  sans: ['var(--font-face-sans, system-ui)', 'var(--font-face-mono, system-ui)', ...systemJa, 'system-ui', 'sans-serif'],
  // The hero headline's own small face first (the only preloaded one): same design as the heading face.
  heading: ['var(--font-face-hero, var(--font-face-sans, system-ui))', 'var(--font-face-heading, var(--font-face-sans, system-ui))', 'var(--font-face-sans, system-ui)', ...systemJa, 'system-ui', 'sans-serif'],
  mono: ['var(--font-face-mono, ui-monospace)', 'ui-monospace', "'SFMono-Regular'", "'Menlo'", "'Consolas'", 'var(--font-face-sans, system-ui)', ...systemJa, 'monospace'],
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
