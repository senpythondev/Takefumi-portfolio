import { getTranslations } from 'next-intl/server';
import type { Metric } from '@/content';
import type { Chart } from '@/content/charts';
import type { ChartKind } from '@/content/schema';
import { evidenceDialogId } from './MetricButton';

/** Minimal HTML escaping for text and double-quoted attribute values. */
function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** Horizontal bar chart as an SVG string (viewBox units ≈ px). Labelled for screen readers. */
function chartSvg(chart: Chart): string {
  const width = 320;
  const rowH = 40;
  const height = chart.bars.length * rowH + 4;
  const summary = `${chart.caption}: ${chart.bars.map((b) => `${b.label} ${b.display}`).join(', ')}`;
  const rows = chart.bars
    .map((b, i) => {
      const y = i * rowH;
      const w = Math.max(2, (b.value / chart.max) * (width - 70));
      return (
        `<text class="chart-label" x="0" y="${y + 12}">${esc(b.label)}</text>` +
        `<rect class="chart-bar"${b.highlight ? ' data-highlight=""' : ''} x="0" y="${y + 18}" width="${w.toFixed(1)}" height="14" rx="2"></rect>` +
        `<text class="chart-value" x="${(w + 6).toFixed(1)}" y="${y + 30}">${esc(b.display)}</text>`
      );
    })
    .join('');
  return `<figure class="evidence-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}">${rows}</svg><figcaption>${esc(chart.caption)}</figcaption></figure>`;
}


/**
 * One native <dialog> per metric, rendered on the server as real HTML (readable by search
 * engines and screen readers; no evidence data shipped as JS).
 *
 * Performance: the dialogs have no event handlers — they open through the `command` attribute
 * and close through <form method="dialog"> — so React never needs to manage them. They are
 * emitted as a static HTML string, which keeps ~40% of the page's DOM out of hydration
 * (measured: TBT on /ja was 106–262 ms before this change; see docs/WORKLOG.md).
 * All values are escaped; the content comes only from src/content (validated at build time).
 */
export async function EvidenceDialogs({ metrics, charts = {} }: { metrics: Metric[]; charts?: Partial<Record<ChartKind, Chart>> }) {
  const t = await getTranslations('evidence');
  const tc = await getTranslations('confidence');
  const ts = await getTranslations('source');

  const row = (term: string, detail: string) => `<div><dt>${esc(term)}</dt><dd>${detail}</dd></div>`;

  const html = metrics
    .map((m) => {
      const id = evidenceDialogId(m.id);
      const badge = `<span class="metric-badge" data-confidence="${m.confidence}">${esc(tc(m.confidence))}</span>`;
      const facts = [
        row(t('confidence'), `<strong>${esc(tc(m.confidence))}</strong> — ${esc(tc(`${m.confidence}Def`))}`),
        row(t('statement'), esc(m.evidence.statement)),
        m.evidence.method ? row(t('method'), esc(m.evidence.method)) : '',
        row(t('source'), esc(ts(m.evidence.source))),
        m.evidence.note ? row(t('note'), esc(m.evidence.note)) : '',
      ].join('');
      return (
        `<dialog id="${id}" class="evidence" aria-labelledby="${id}-title" closedby="any">` +
        `<div class="evidence-panel">` +
        `<form method="dialog" class="evidence-close"><button type="submit">${esc(t('close'))}</button></form>` +
        `<p class="evidence-eyebrow">${esc(t('eyebrow'))}</p>` +
        `<h2 id="${id}-title" class="evidence-title">${esc(m.label)}</h2>` +
        `<p class="evidence-value"><span class="evidence-figure">${esc(m.display)}</span>${badge}</p>` +
        `<dl class="evidence-facts">${facts}</dl>` +
        (m.evidence.chart && charts[m.evidence.chart] ? chartSvg(charts[m.evidence.chart] as Chart) : '') +
        `<p class="evidence-share"><button type="button" class="evidence-copy" data-copy-evidence="${id}" data-copied-label="${esc(t('copied'))}" hidden>${esc(t('copyLink'))}</button></p>` +
        `</div></dialog>`
      );
    })
    .join('');

  return <div className="evidence-dialogs" dangerouslySetInnerHTML={{ __html: html }} />;
}
