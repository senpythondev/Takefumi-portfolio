/**
 * How each act shows and records its result (docs/STORYBOARD.md v2.4 §13). Locale-free: metric ids
 * only; every value on screen is still a Metric from the fact sheet, nothing here is a new number.
 */
import type { ActId } from './acts.ts';

/**
 * §13.1: the result as a comparison.
 * - `bars`: one bar per metric. `to` (and `from` for a range) is the bar's length as a fraction of
 *   the longest, worked out from the metrics' own values:
 *   - site-migration: the estimate of 2–4 hours is 120–240 minutes (0.5–1 of the bar); 20 minutes is 20/240.
 *   - patent: "3 months or more" is the full bar, open-ended; "within 2 months" is 2/3.
 * - `groups`: bars of percentages, read from each metric's display (76% → 0.76).
 * - `change`: before and after, where the "before" has no number (auction).
 * - `risks`: the list of risks and the staged plan (PHP audit).
 * - `gates`: the two reviews a change passes (current work; no numbers).
 */
export type Compare =
  | { kind: 'bars'; rows: readonly { metric: string; to: number; from?: number; open?: boolean; win?: boolean }[] }
  | { kind: 'groups'; groups: readonly (readonly string[])[] }
  | { kind: 'change' }
  | { kind: 'risks'; plan: string }
  | { kind: 'gates' };

export const COMPARE: Partial<Record<ActId, Compare>> = {
  current: { kind: 'gates' },
  genten: {
    kind: 'groups',
    groups: [
      ['genten-acc-closed', 'genten-acc-keyword', 'genten-acc-genten'],
      ['genten-cite-closed', 'genten-cite-keyword', 'genten-cite-genten'],
    ],
  },
  'site-migration': {
    kind: 'bars',
    rows: [
      { metric: 'site-migration-estimate', from: 0.5, to: 1 },
      { metric: 'site-migration-downtime', to: 20 / 240, win: true },
    ],
  },
  'php-audit': { kind: 'risks', plan: 'php-plan' },
  auction: { kind: 'change' },
  patent: {
    kind: 'bars',
    rows: [
      { metric: 'patent-typical', to: 1, open: true },
      { metric: 'patent-duration', to: 2 / 3, win: true },
    ],
  },
};

/** The metrics a comparison already shows (the act's other big numbers follow it, smaller). */
export function compareMetrics(id: ActId): string[] {
  const c = COMPARE[id];
  if (!c) return [];
  if (c.kind === 'bars') return c.rows.map((r) => r.metric);
  if (c.kind === 'groups') return c.groups.flat();
  if (c.kind === 'change') return ['auction-bids', 'auction-errors'];
  if (c.kind === 'risks') return [c.plan];
  return [];
}

/**
 * §13.3: the results ledger — the numbers each act leaves on its band of the navigator, and the
 * list beside the rebuilt core in the finale. An act without numbers records its result sentence.
 */
export const LEDGER: readonly { act: ActId; metrics: readonly string[] }[] = [
  { act: 'current', metrics: [] },
  { act: 'genten', metrics: ['genten-acc-genten', 'genten-cite-genten'] },
  { act: 'site-migration', metrics: ['site-migration-downtime', 'site-migration-posts'] },
  { act: 'php-audit', metrics: ['php-files', 'php-plan'] },
  { act: 'auction', metrics: ['auction-bids', 'auction-errors'] },
  { act: 'patent', metrics: ['patent-duration'] },
  { act: 'deep', metrics: ['api-speedup', 'deploy-speedup'] },
];

/** A percentage (or a range of them) in a metric's display, as fractions: "約30〜40%短縮" → [0.3, 0.4]. */
export function percentOf(display: string): [number, number] | null {
  const m = /(\d+(?:\.\d+)?)(?:\s*[〜~–-]\s*(\d+(?:\.\d+)?))?\s*%/.exec(display);
  if (!m) return null;
  const a = Number(m[1]) / 100;
  const b = m[2] ? Number(m[2]) / 100 : a;
  return [Math.min(a, b), Math.max(a, b)];
}
