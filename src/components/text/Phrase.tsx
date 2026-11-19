import { Fragment, type ReactNode } from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

/**
 * Japanese has no spaces, so browsers break lines anywhere — in the middle of a word or phrase
 * (PM_REVIEW_08 §3-a). BudouX splits the text into phrases at build time and a <wbr> goes between
 * them; with `word-break: keep-all` (globals.css) lines then break only at phrase boundaries.
 * Server-only: nothing of BudouX reaches the browser.
 */
const parser = loadDefaultJapaneseParser();
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** The phrases of a text (Japanese: BudouX; other text: words, keeping their spaces). */
export function phraseChunks(text: string): string[] {
  if (JAPANESE.test(text)) return parser.parse(text);
  return text.split(/(?<=\s)/);
}

export function phrases(text: string): ReactNode {
  if (!JAPANESE.test(text)) return text;
  const chunks = parser.parse(text);
  return chunks.map((chunk, i) => (
    <Fragment key={i}>
      {i > 0 ? <wbr /> : null}
      {chunk}
    </Fragment>
  ));
}
