import { Fragment } from 'react';
import type { Locale, Metric } from '@/content';
import { MetricLink, type MetricLabels } from '@/components/evidence/MetricLink';

export type RichContext = {
  locale: Locale;
  metrics: Map<string, Metric>;
  labels: MetricLabels;
};

const TOKEN = /(\{\{[a-z0-9-]+\}\})/;

function metricFor(token: string, ctx: RichContext): Metric {
  const id = token.slice(2, -2);
  const metric = ctx.metrics.get(id);
  // Validation guarantees every token resolves; this is a safety net, not a code path.
  if (!metric) throw new Error(`Unknown metric token ${token}`);
  return metric;
}

/** Renders text with {{metric-id}} tokens as clickable metrics. */
export function RichText({ text, ctx }: { text: string; ctx: RichContext }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) =>
        TOKEN.test(part) ? (
          <MetricLink key={i} metric={metricFor(part, ctx)} labels={ctx.labels} locale={ctx.locale} />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Same text with tokens replaced by their display value (for places where a link would be repeated). */
export function plainText(text: string, ctx: RichContext): string {
  return text
    .split(TOKEN)
    .map((part) => (TOKEN.test(part) ? metricFor(part, ctx).display : part))
    .join('');
}
