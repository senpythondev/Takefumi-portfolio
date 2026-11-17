import { getTranslations } from 'next-intl/server';
import type { Metric } from '@/content';
import { evidenceDialogId } from './MetricButton';

/** Minimal HTML escaping for text and double-quoted attribute values. */
function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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
export async function EvidenceDialogs({ metrics }: { metrics: Metric[] }) {
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
        `</div></dialog>`
      );
    })
    .join('');

  return <div className="evidence-dialogs" dangerouslySetInnerHTML={{ __html: html }} />;
}
