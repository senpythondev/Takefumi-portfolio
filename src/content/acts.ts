/**
 * The acts of the cinematic home (docs/STORYBOARD.md v2.1 §2, §8.1, §8.3). Locale-free and zod-free:
 * imported by the server components (section heights, kanji) and by the 3D director (beats).
 *
 * - `len`: scroll length in viewport heights while the act's frame is pinned (svh on phones),
 *   including `pause`.
 * - `pause`: the "ma" after the result (§8.1): this much of the act, just before the return, holds
 *   the result while only the motes drift.
 * - `side`: where the headline sits next to the world's object (alternating, Sixfold).
 * - `kanji`: the one-character mark of the section (§8.3).
 */
import type { LayerId } from './layer-ids.ts';

export type ActId = 'surface' | 'explode' | Exclude<LayerId, 'surface'>;
export type Act = { id: ActId; layer: LayerId | null; len: number; pause: number; side: 'L' | 'R' | null; kanji: string | null };

export const ACTS: readonly Act[] = [
  { id: 'surface', layer: 'surface', len: 200, pause: 0, side: 'L', kanji: '掘' },
  { id: 'explode', layer: null, len: 150, pause: 0, side: null, kanji: null },
  { id: 'current', layer: 'current', len: 175, pause: 25, side: 'R', kanji: '照' },
  { id: 'genten', layer: 'genten', len: 325, pause: 25, side: 'L', kanji: '証' },
  { id: 'site-migration', layer: 'site-migration', len: 275, pause: 25, side: 'R', kanji: '流' },
  { id: 'php-audit', layer: 'php-audit', len: 325, pause: 25, side: 'L', kanji: '繕' },
  { id: 'auction', layer: 'auction', len: 305, pause: 25, side: 'R', kanji: '冷' },
  { id: 'patent', layer: 'patent', len: 275, pause: 25, side: 'L', kanji: '透' },
  { id: 'deep', layer: 'deep', len: 220, pause: 20, side: 'R', kanji: '積' },
  { id: 'catchup', layer: 'catchup', len: 140, pause: 20, side: 'L', kanji: '速' },
  { id: 'bedrock', layer: 'bedrock', len: 140, pause: 20, side: 'R', kanji: '礎' },
  { id: 'next', layer: 'next', len: 150, pause: 0, side: 'L', kanji: '次' },
];

/** The acts that enter a world through a band's cut face (STORYBOARD §3). */
export const WORLD_ACTS = ACTS.filter((a) => a.layer && a.layer !== 'surface').map((a) => a.id as Exclude<LayerId, 'surface'>);

/** Layers with a case-study page (/[locale]/work/[id]): the long texts moved off the home. */
export const WORK_IDS = ['current', 'genten', 'site-migration', 'php-audit', 'auction', 'patent', 'deep', 'catchup'] as const satisfies readonly LayerId[];
export type WorkId = (typeof WORK_IDS)[number];

export function isWorkId(id: string): id is WorkId {
  return (WORK_IDS as readonly string[]).includes(id);
}

/** The one-character mark of a layer (§8.3). */
export function kanjiOf(layer: LayerId): string {
  return ACTS.find((a) => a.layer === layer)?.kanji ?? '';
}

/**
 * Beats of a world act, as fractions of its progress (STORYBOARD §3): entry 0–15 %, the story,
 * the pause holding the result, return 85–100 %.
 */
export function beatsOf(act: Act) {
  const pause = act.len > 0 ? act.pause / act.len : 0;
  return { entry: 0.15, result: 0.85 - pause, ret: 0.85 };
}

/**
 * The four beats of an act (STORYBOARD v2.4 §12.2): ① problem, ② investigation, ③ action, ④ result.
 * Where ②, ③ and ④ begin, as fractions of the story (0 = the end of the entry, 1 = the result),
 * placed where each world's own picture changes (src/three/worlds/<id>).
 */
const BEAT_CUTS: Partial<Record<ActId, readonly [number, number, number]>> = {
  current: [0.1, 0.5, 0.66],
  genten: [0.17, 0.34, 0.86],
  'site-migration': [0.2, 0.5, 0.92],
  'php-audit': [0.2, 0.6, 0.98],
  auction: [0.36, 0.7, 0.92],
  patent: [0.12, 0.6, 0.8],
};

export const hasBeats = (id: string): boolean => id in BEAT_CUTS;

/** Where the four beats begin and where the last one ends, as fractions of the act's progress; null without beats. */
export function beatEdges(act: Act): readonly [number, number, number, number, number] | null {
  const cuts = BEAT_CUTS[act.id];
  if (!cuts) return null;
  const { entry, result } = beatsOf(act);
  const at = (q: number) => entry + q * (result - entry);
  return [entry, at(cuts[0]), at(cuts[1]), at(cuts[2]), result];
}

/** The beat at progress `p`: 0 before the story starts (the title card), then 1–4. */
export function beatAt(act: Act, p: number): number {
  const edges = beatEdges(act);
  if (!edges || p <= edges[0] + 1e-4 || p > 0.85) return 0;
  for (let b = 3; b >= 1; b -= 1) if (p > (edges[b] as number) + 1e-4) return b + 1;
  return 1;
}

/**
 * From the scroll to the story (STORYBOARD v2.5 §9). Everything on screen is decided by the scroll
 * position: an act's scroll fraction `s` (0–1 over its pinned length) maps to its progress `p`
 * through a few ranges, each with its own share of the scroll:
 *
 * - a key moment (the extraction of the core, the split, an entry, a beat, a return…) crosses its
 *   part of the story with an eased curve — it starts and ends gently, and a longer range makes the
 *   same motion slower;
 * - a hold (the title card after the entry, §12.1; the result, §13.2) is a range of scroll in which
 *   the story does not move.
 *
 * Nothing is timed: stop scrolling and the picture stops; scroll back and it plays back.
 */
type Range = { s0: number; s1: number; p0: number; p1: number; eased: boolean };

/** Shares of a world act's scroll: entry, title card, story (the beats), the held result, return. */
export const SHARES = { entry: 0.13, card: 0.05, story: 0.5, hold: 0.16, ret: 0.16 } as const;

/** Mostly an S-curve, a little linear: the motion eases at both ends but never quite stalls under the wheel. */
const ease = (t: number) => 0.3 * t + 0.7 * (t * t * t * (t * (6 * t - 15) + 10));

const rangesCache = new Map<ActId, Range[]>();

function rangesOf(act: Act): Range[] {
  const cached = rangesCache.get(act.id);
  if (cached) return cached;
  const out: Range[] = [];
  // Acts 1, 2 and the finale: the key moments keep their place; the rest follows the scroll one to one.
  const inPlace = (moments: [number, number][]) => {
    let at = 0;
    for (const [a, b] of moments) {
      if (a > at) out.push({ s0: at, s1: a, p0: at, p1: a, eased: false });
      out.push({ s0: a, s1: b, p0: a, p1: b, eased: true });
      at = b;
    }
    if (at < 1) out.push({ s0: at, s1: 1, p0: at, p1: 1, eased: false });
  };
  if (act.id === 'surface') inPlace([[0.3, 0.7], [0.7, 1]]);
  else if (act.id === 'explode') inPlace([[0, 0.5], [0.85, 1]]);
  else if (act.id === 'next') inPlace([[0.02, 0.5]]);
  else {
    const { entry, result, ret } = beatsOf(act);
    const a = SHARES.entry;
    const b = a + SHARES.card;
    const c = b + SHARES.story;
    const d = c + SHARES.hold;
    out.push({ s0: 0, s1: a, p0: 0, p1: entry, eased: true });
    out.push({ s0: a, s1: b, p0: entry, p1: entry, eased: false });
    const edges = beatEdges(act);
    if (edges) {
      // Each beat gets scroll in proportion to how much of the story it tells, and never less than a sixth.
      const spans = [0, 1, 2, 3].map((k) => Math.max(1 / 6, ((edges[k + 1] as number) - (edges[k] as number)) / (result - entry)));
      const total = spans.reduce((x, y) => x + y, 0);
      let at = b;
      for (let k = 0; k < 4; k += 1) {
        const next = at + ((spans[k] as number) / total) * SHARES.story;
        out.push({ s0: at, s1: next, p0: edges[k] as number, p1: edges[k + 1] as number, eased: true });
        at = next;
      }
    } else out.push({ s0: b, s1: c, p0: entry, p1: result, eased: false });
    out.push({ s0: c, s1: d, p0: result, p1: ret, eased: false });
    out.push({ s0: d, s1: 1, p0: ret, p1: 1, eased: true });
  }
  rangesCache.set(act.id, out);
  return out;
}

/** The act's progress for a scroll fraction `s` (0–1). */
export function storyAt(act: Act, s: number): number {
  const x = Math.min(1, Math.max(0, s));
  for (const r of rangesOf(act)) {
    if (x <= r.s1) {
      const t = r.s1 > r.s0 ? (x - r.s0) / (r.s1 - r.s0) : 1;
      return r.p0 + (r.p1 - r.p0) * (r.eased ? ease(t) : t);
    }
  }
  return 1;
}

/** The scroll fraction at which the act's progress reaches `p` (flights, tests, screenshots). */
export function scrollAt(act: Act, p: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (storyAt(act, mid) < p) lo = mid;
    else hi = mid;
  }
  return hi;
}
