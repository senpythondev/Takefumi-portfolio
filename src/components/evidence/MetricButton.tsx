import type { Confidence, Metric } from '@/content';

export type MetricLabels = {
  confidence: Record<Confidence, string>;
};

/** One shared description ("show evidence") for every metric button, rendered once per page. */
export const METRIC_HINT_ID = 'metric-hint';

export function evidenceDialogId(metricId: string): string {
  return `ev-${metricId}`;
}

/**
 * Every number on the site renders through this button (CLAUDE.md §3).
 * It opens the matching evidence <dialog> natively via Invoker Commands;
 * EvidenceController adds a fallback for browsers without them.
 */
export function MetricButton({ metric, labels }: { metric: Metric; labels: MetricLabels }) {
  return (
    <button
      type="button"
      className="metric"
      data-confidence={metric.confidence}
      data-metric={metric.id}
      commandfor={evidenceDialogId(metric.id)}
      command="show-modal"
      aria-haspopup="dialog"
      aria-describedby={METRIC_HINT_ID}
    >
      <span className="metric-value">{metric.display}</span>
      <span className="metric-badge">{labels.confidence[metric.confidence]}</span>
    </button>
  );
}
