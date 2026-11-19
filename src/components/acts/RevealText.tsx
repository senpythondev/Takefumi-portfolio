import { Fragment, type CSSProperties } from 'react';
import type { Metric } from '@/content';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { phraseChunks } from '@/components/text/Phrase';

const TOKEN = /(\{\{[a-z0-9-]+\}\})/;

/**
 * A headline whose phrases light up one after another as an act progresses (dim → bright; the
 * director sets `--reveal` 0–1 on the element). Every phrase is a span with its index; metrics stay
 * real Metric links (evidence, confidence symbol). Without the director the text is simply shown.
 */
export function RevealText({ text, ctx }: { text: string; ctx: RichContext }) {
  const units: { key: string; node: React.ReactNode }[] = [];
  for (const [i, part] of text.split(TOKEN).entries()) {
    if (!part) continue;
    if (TOKEN.test(part)) {
      const metric = ctx.metrics.get(part.slice(2, -2)) as Metric;
      units.push({ key: `m${i}`, node: <MetricLink metric={metric} labels={ctx.labels} locale={ctx.locale} compact /> });
    } else {
      for (const [j, chunk] of phraseChunks(part).entries()) units.push({ key: `t${i}-${j}`, node: chunk });
    }
  }
  return (
    <>
      {units.map((u, i) => (
        // <wbr>: with `word-break: keep-all` Japanese lines break only between phrases.
        <Fragment key={u.key}>
          {i > 0 ? <wbr /> : null}
          <span className="reveal-unit" style={{ '--i': i, '--n': units.length } as CSSProperties}>
            {u.node}
          </span>
        </Fragment>
      ))}
    </>
  );
}
