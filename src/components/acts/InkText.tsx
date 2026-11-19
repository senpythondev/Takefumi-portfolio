import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { Metric } from '@/content';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { phraseChunks } from '@/components/text/Phrase';

const TOKEN = /(\{\{[a-z0-9-]+\}\})/;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/**
 * An act headline that appears one character at a time, as ink bleeding into paper
 * (STORYBOARD v2.1 §8.2): every character (English: every word) is an inline span with its index;
 * CSS runs the reveal 35 ms apart once the director marks the act `data-lit`. Inline spans keep
 * the line-breaking rules and the vertical punctuation (vert) of the text around them.
 *
 * Metrics stay real Metric links, revealed as one unit. Japanese phrases are separated by <wbr>
 * (BudouX), so lines break only between phrases, horizontally and vertically.
 */
export function InkText({ text, ctx }: { text: string; ctx: RichContext }) {
  const out: ReactNode[] = [];
  let i = 0;
  const unit = (node: ReactNode, key: string, cls = 'ink') => {
    out.push(
      <span key={key} className={cls} style={{ '--i': i } as CSSProperties}>
        {node}
      </span>,
    );
    i += 1;
  };
  for (const [p, part] of text.split(TOKEN).entries()) {
    if (!part) continue;
    if (TOKEN.test(part)) {
      const metric = ctx.metrics.get(part.slice(2, -2)) as Metric;
      unit(<MetricLink metric={metric} labels={ctx.labels} locale={ctx.locale} compact upright />, `m${p}`, 'ink ink-metric');
      continue;
    }
    if (!JAPANESE.test(part)) {
      for (const [w, word] of part.split(/(?<=\s)/).entries()) if (word) unit(word, `w${p}-${w}`);
      continue;
    }
    for (const [c, chunk] of phraseChunks(part).entries()) {
      if (c > 0) out.push(<wbr key={`b${p}-${c}`} />);
      for (const [g, { segment }] of [...graphemes.segment(chunk)].entries()) unit(segment, `g${p}-${c}-${g}`);
    }
  }
  return <Fragment>{out}</Fragment>;
}
