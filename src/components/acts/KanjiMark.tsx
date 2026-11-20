import type { CSSProperties } from 'react';
import { KANJI_STROKES } from '@/content/kanji-strokes';

/**
 * The one-character mark of an act (STORYBOARD §8.3), written by a brush of light (v2.3 §10-B): with
 * the cinema on, a cyan line draws the character stroke by stroke in its correct order (stroke data:
 * KanjiVG, CC BY-SA 3.0 — credited in the footer), presses at the end of each stroke, and once
 * written it bleeds and sinks into the background like ink. A key moment: it plays at its own
 * tempo when the act enters, and back when the act is left (CSS, globals.css `.kanji-strokes`).
 * Without the cinema the plain glyph stands faintly behind the act. Decorative: aria-hidden.
 */
export function KanjiMark({ kanji }: { kanji: string }) {
  const strokes = KANJI_STROKES[kanji] ?? [];
  return (
    <span className="act-kanji" aria-hidden="true" style={{ '--n': strokes.length } as CSSProperties}>
      <span className="kanji-glyph">{kanji}</span>
      {strokes.length > 0 ? (
        <svg className="kanji-strokes" viewBox="0 0 109 109" focusable="false">
          {strokes.map((d, i) => (
            <path key={i} d={d} pathLength={1} style={{ '--i': i } as CSSProperties} />
          ))}
        </svg>
      ) : null}
    </span>
  );
}
