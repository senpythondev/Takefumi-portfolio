/**
 * The one-character mark of an act (STORYBOARD §8.3). In the HTML it is the plain glyph, standing
 * faintly behind the act. With the cinema on, a brush of light writes it stroke by stroke in its
 * correct order as the scroll enters the act (v2.3 §10-B, v2.5 §9-3): those strokes are only
 * needed there, so the scroll effects add them on the client (src/lib/scroll/cinema-ui.ts, stroke
 * data: KanjiVG, CC BY-SA 3.0 — credited in the footer) and the static page does not carry them.
 * Decorative: aria-hidden.
 */
export function KanjiMark({ kanji }: { kanji: string }) {
  return (
    <span className="act-kanji" aria-hidden="true" data-kanji={kanji}>
      <span className="kanji-glyph">{kanji}</span>
    </span>
  );
}
