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
