import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContent, metricLayers } from '@/content';
import { buildCharts } from '@/content/charts';
import { routing } from '@/i18n/routing';
import { evidenceHtml, getEvidenceLabels } from '@/components/evidence/evidence-html';
import { evidencePath, EVIDENCE_TITLE_ID } from '@/components/evidence/ids';
import { layerAnchor } from '@/components/layers/LayerSection';
import { SiteFooter } from '@/components/layout/SiteChrome';
import { evidenceParams } from './params';

/**
 * One static page per metric (PM_REVIEW_07 §2-1): every number has its own URL, readable without
 * JS. The site's metric links point here; with JS the same content opens in a dialog instead.
 */
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return evidenceParams(params.locale);
}

export async function generateMetadata({ params }: PageProps<'/[locale]/evidence/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const content = getContent(locale);
  const metric = content.metrics.find((m) => m.id === id);
  if (!metric) return {};
  const t = await getTranslations({ locale, namespace: 'evidence' });
  return {
    title: `${t('pageTitle', { label: metric.label })} — ${content.person.name}`,
    description: metric.evidence.statement,
    alternates: {
      canonical: evidencePath(locale, id),
      languages: Object.fromEntries(routing.locales.map((l) => [l, evidencePath(l, id)])),
    },
  };
}

export default async function EvidencePage({ params }: PageProps<'/[locale]/evidence/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const content = getContent(locale);
  const metric = content.metrics.find((m) => m.id === id);
  if (!metric) notFound();
  const chart = metric.evidence.chart ? buildCharts(content)[metric.evidence.chart] : undefined;
  const html = evidenceHtml(metric, { labels: await getEvidenceLabels(locale), chart, heading: 'h1', titleId: EVIDENCE_TITLE_ID });
  const layer = metricLayers(content).get(id);
  const t = await getTranslations('evidence');
  const tn = await getTranslations('nav');
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <>
      <header className="site-header">
        <a className="skip-link" href="#main">
          {tn('skip')}
        </a>
        <a className="site-brand" href={`/${locale}`}>
          {content.person.name}
        </a>
        <nav className="site-actions" aria-label={content.person.name}>
          <a className="action-lang" href={evidencePath(other, id)} hrefLang={other} lang={other}>
            {tn('switchLanguage')}
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="evidence-page">
        <article className="evidence-panel" aria-labelledby={EVIDENCE_TITLE_ID} dangerouslySetInnerHTML={{ __html: html }} />
        <p className="evidence-back">
          <a href={layer ? `/${locale}#${layerAnchor(layer)}` : `/${locale}`}>{t('back')}</a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
