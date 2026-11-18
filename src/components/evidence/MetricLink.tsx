import type { Confidence, Locale, Metric } from '@/content';
import { evidencePath, METRIC_HINT_ID } from './ids';

export type MetricLabels = {
  confidence: Record<Confidence, string>;
};

/**
 * Every number on the site renders through this link (CLAUDE.md §3). Without JS it is a plain link
 * to the metric's evidence page; with JS, EvidenceController opens the same content in the page's
 * evidence dialog instead (PM_REVIEW_07 §2-1).
 */
export function MetricLink({ metric, labels, locale }: { metric: Metric; labels: MetricLabels; locale: Locale }) {
  return (
    <a
      className="metric"
      href={evidencePath(locale, metric.id)}
      data-confidence={metric.confidence}
      data-metric={metric.id}
      aria-haspopup="dialog"
      aria-describedby={METRIC_HINT_ID}
    >
      <span className="metric-value">{metric.display}</span>
      <span className="metric-badge">{labels.confidence[metric.confidence]}</span>
    </a>
  );
}
