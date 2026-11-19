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
/** Compact form (hero chips, PM_REVIEW_08 §3-c): the confidence is a small symbol; its name is the accessible label. */
export const CONFIDENCE_SYMBOL: Record<Confidence, string> = { measured: '✓', approx: '≈', reconstructed: '↺' };

/**
 * `upright`: inside a vertical headline (STORYBOARD v2.1 §8.2) a run of one or two digits stands
 * upright in the column (tate-chu-yoko, `.tcy`); in horizontal text the spans change nothing.
 */
function uprightDigits(display: string) {
  return display.split(/(?<![\d,.])(\d{1,2})(?![\d,.])/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="tcy">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function MetricLink({
  metric,
  labels,
  locale,
  compact = false,
  upright = false,
}: {
  metric: Metric;
  labels: MetricLabels;
  locale: Locale;
  compact?: boolean;
  upright?: boolean;
}) {
  return (
    <a
      className="metric"
      href={evidencePath(locale, metric.id)}
      data-confidence={metric.confidence}
      data-metric={metric.id}
      aria-haspopup="dialog"
      aria-describedby={METRIC_HINT_ID}
    >
      <span className="metric-value">{upright ? uprightDigits(metric.display) : metric.display}</span>
      {compact ? (
        <span className="metric-symbol" role="img" aria-label={labels.confidence[metric.confidence]} title={labels.confidence[metric.confidence]}>
          {CONFIDENCE_SYMBOL[metric.confidence]}
        </span>
      ) : (
        <span className="metric-badge">{labels.confidence[metric.confidence]}</span>
      )}
    </a>
  );
}
