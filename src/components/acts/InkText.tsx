import { Fragment, type ReactNode } from 'react';
import type { Metric } from '@/content';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { phrases } from '@/components/text/Phrase';

const TOKEN = /(\{\{[a-z0-9-]+\}\})/;

/**
 * An act headline (STORYBOARD v2.1 §8.2). In the HTML it is plain text: Japanese phrases separated
 * by <wbr> (BudouX), so lines break only between phrases, horizontally and vertically; metrics are
 * real Metric links.
 *
 * With the cinema on, the headline appears one character at a time, as ink bleeding into paper:
 * for that, the scroll effects wrap every character (English: every word) in a span on the client
 * (src/lib/scroll/cinema-ui.ts). The static page does not carry those spans — several hundred
 * elements that only the cinema uses, and that every layout of the page had to visit.
 */
export function InkText({ text, ctx }: { text: string; ctx: RichContext }) {
  const out: ReactNode[] = [];
  for (const [p, part] of text.split(TOKEN).entries()) {
    if (!part) continue;
    if (TOKEN.test(part)) {
      const metric = ctx.metrics.get(part.slice(2, -2)) as Metric;
      out.push(<MetricLink key={p} metric={metric} labels={ctx.labels} locale={ctx.locale} compact upright />);
    } else out.push(<Fragment key={p}>{phrases(part)}</Fragment>);
  }
  return <Fragment>{out}</Fragment>;
}
