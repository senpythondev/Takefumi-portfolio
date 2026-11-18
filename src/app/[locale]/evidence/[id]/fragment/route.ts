import { getContent, type Locale } from '@/content';
import { buildCharts } from '@/content/charts';
import { evidenceHtml, getEvidenceLabels } from '@/components/evidence/evidence-html';
import { evidencePath, EVIDENCE_TITLE_ID } from '@/components/evidence/ids';
import { allEvidenceParams } from '../params';

/**
 * The evidence of one metric as a bare HTML fragment (no document, no scripts), generated at build
 * time. EvidenceController fetches it into the page's dialog; the same renderer builds the
 * standalone page, so both always show the same content.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allEvidenceParams();
}

export async function GET(_request: Request, { params }: RouteContext<'/[locale]/evidence/[id]/fragment'>) {
  const { locale, id } = await params;
  const content = getContent(locale as Locale);
  const metric = content.metrics.find((m) => m.id === id);
  if (!metric) return new Response('Not found', { status: 404 });
  const chart = metric.evidence.chart ? buildCharts(content)[metric.evidence.chart] : undefined;
  const html = evidenceHtml(metric, {
    labels: await getEvidenceLabels(locale as Locale),
    chart,
    heading: 'h2',
    titleId: EVIDENCE_TITLE_ID,
    copyPath: evidencePath(locale, id),
  });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
