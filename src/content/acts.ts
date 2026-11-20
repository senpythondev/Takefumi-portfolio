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
  { id: 'pegasus', layer: 'pegasus', len: 275, pause: 25, side: 'R', kanji: '流' },
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
export const WORK_IDS = ['current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent', 'deep', 'catchup'] as const satisfies readonly LayerId[];
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
  pegasus: [0.2, 0.5, 0.92],
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
 * The key moments of an act (STORYBOARD v2.3 §9-2): ranges of its progress that are not scrubbed by
 * the scroll but played at a fixed tempo once the scroll crosses into them (and played back the
 * same way). `dur` is in seconds at tempo 1. Everything between them follows the scroll softly.
 * `hold`: seconds the picture rests at the end of the moment before it may go on (v2.4: the title
 * card after the entry, §12.1; the result, §13.2). `maxBoost`: a fast scroll hurries a beat by at most
 * this much, so its sentence stays up for 1.5 s or more (§12.2).
 */
export type ActCue = { from: number; to: number; dur: number; hold?: number; maxBoost?: number };

/** How long the title card and the result stay before the story may go on (seconds). */
export const CARD_HOLD = 1.8;
export const RESULT_HOLD = 2.6;

export function cuesOf(act: Act): ActCue[] {
  // Act 1: the core is pulled out of the borehole, then turned onto its side.
  if (act.id === 'surface') return [{ from: 0.3, to: 0.7, dur: 3.0 }, { from: 0.7, to: 1, dur: 2.6 }];
  // Act 2: the bands come apart; at the end, the first band turns its cut face forward.
  if (act.id === 'explode') return [{ from: 0, to: 0.5, dur: 2.8 }, { from: 0.85, to: 1, dur: 1.4 }];
  // The finale: the bands close and their seams turn gold.
  if (act.id === 'next') return [{ from: 0.02, to: 0.5, dur: 3.8 }];
  const { entry, result, ret } = beatsOf(act);
  const cues: ActCue[] = [{ from: 0, to: entry, dur: 2.4, hold: CARD_HOLD }, { from: ret, to: 1, dur: 2.2 }];
  // The four beats: each plays at its own tempo once the scroll reaches it, then waits for the scroll.
  const edges = beatEdges(act);
  if (edges) {
    for (let b = 0; b < 4; b += 1) {
      const from = edges[b] as number;
      const to = edges[b + 1] as number;
      const span = (to - from) / (result - entry);
      cues.push({ from, to, dur: Math.min(5.5, Math.max(b === 3 ? 1.6 : 2.4, span * 12)), hold: b === 3 ? RESULT_HOLD : 0.6, maxBoost: 1.6 });
    }
  }
  return cues;
}
