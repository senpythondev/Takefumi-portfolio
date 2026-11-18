/**
 * The evidence for one metric as an HTML string — the single renderer behind both
 *   - the standalone page  /[locale]/evidence/[id]            (works without JS; shareable URL)
 *   - the dialog fragment  /[locale]/evidence/[id]/fragment   (fetched into the page's dialog)
 * so the two can never drift apart. Server-only: content comes from src/content (validated at build
 * time) and every value is escaped.
 */
import { getTranslations } from 'next-intl/server';
import type { Confidence, Locale, Metric, Source } from '@/content';
import type { Chart } from '@/content/charts';

export type EvidenceLabels = {
  eyebrow: string;
  confidence: string;
  statement: string;
  method: string;
  source: string;
  note: string;
  copyLink: string;
  copied: string;
  levels: Record<Confidence, { name: string; definition: string }>;
  sources: Record<Source, string>;
};

export async function getEvidenceLabels(locale: Locale): Promise<EvidenceLabels> {
  const t = await getTranslations({ locale, namespace: 'evidence' });
  const tc = await getTranslations({ locale, namespace: 'confidence' });
  const ts = await getTranslations({ locale, namespace: 'source' });
  const level = (c: Confidence) => ({ name: tc(c), definition: tc(`${c}Def`) });
  return {
    eyebrow: t('eyebrow'),
    confidence: t('confidence'),
    statement: t('statement'),
    method: t('method'),
    source: t('source'),
    note: t('note'),
    copyLink: t('copyLink'),
    copied: t('copied'),
    levels: { measured: level('measured'), approx: level('approx'), reconstructed: level('reconstructed') },
    sources: { records: ts('records'), eval: ts('eval'), article: ts('article'), ci: ts('ci') },
  };
}

/** Minimal HTML escaping for text and double-quoted attribute values. */
export function esc(value: string): string {
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

export type EvidenceHtmlOptions = {
  labels: EvidenceLabels;
  chart?: Chart;
  /** h1 on the standalone page, h2 inside the page's dialog. */
  heading: 'h1' | 'h2';
  titleId: string;
  /** Dialog only: the "copy a link" button (the standalone page has its own URL in the address bar). */
  copyPath?: string;
};

export function evidenceHtml(m: Metric, { labels, chart, heading, titleId, copyPath }: EvidenceHtmlOptions): string {
  const level = labels.levels[m.confidence];
  const badge = `<span class="metric-badge" data-confidence="${m.confidence}">${esc(level.name)}</span>`;
  const row = (term: string, detail: string) => `<div><dt>${esc(term)}</dt><dd>${detail}</dd></div>`;
  const facts = [
    row(labels.confidence, `<strong>${esc(level.name)}</strong> — ${esc(level.definition)}`),
    row(labels.statement, esc(m.evidence.statement)),
    m.evidence.method ? row(labels.method, esc(m.evidence.method)) : '',
    row(labels.source, esc(labels.sources[m.evidence.source])),
    m.evidence.note ? row(labels.note, esc(m.evidence.note)) : '',
  ].join('');
  return (
    `<p class="evidence-eyebrow">${esc(labels.eyebrow)}</p>` +
    `<${heading} id="${titleId}" class="evidence-title">${esc(m.label)}</${heading}>` +
    `<p class="evidence-value"><span class="evidence-figure">${esc(m.display)}</span>${badge}</p>` +
    `<dl class="evidence-facts">${facts}</dl>` +
    (chart ? chartSvg(chart) : '') +
    (copyPath
      ? `<p class="evidence-share"><button type="button" class="evidence-copy" data-copy-evidence="${esc(copyPath)}" data-copied-label="${esc(labels.copied)}">${esc(labels.copyLink)}</button></p>`
      : '')
  );
}
