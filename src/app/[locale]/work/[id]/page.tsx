import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { getContent, metricMap, type Layer } from '@/content';
import { isWorkId, kanjiOf, WORK_IDS } from '@/content/acts';
import { displayHost, isPegasusLinkEnabled, LINKS } from '@/content/links';
import { routing } from '@/i18n/routing';
import { layerAnchor, workPath } from '@/components/acts/anchors';
import { EvidenceController } from '@/components/evidence/EvidenceController';
import { EvidenceDialog } from '@/components/evidence/EvidenceDialog';
import { METRIC_HINT_ID } from '@/components/evidence/ids';
import { BlockView } from '@/components/layers/Blocks';
import { RichText, type RichContext } from '@/components/layers/RichText';
import { SiteFooter } from '@/components/layout/SiteChrome';
import { layer as layerColor, layerName, type LayerColorId } from '@/styles/tokens';

/**
 * One case study per project layer (STORYBOARD v2.1 §6-1): the long text that used to sit in the
 * layer panels of the home. Static HTML, readable without JS, like the evidence pages; every
 * number is a Metric link to its evidence (opened in the dialog when JS runs).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return WORK_IDS.map((id) => ({ id }));
}

function layerOf(locale: string, id: string): Layer | undefined {
  if (!hasLocale(routing.locales, locale) || !isWorkId(id)) return undefined;
  return getContent(locale).layers.find((l) => l.id === id);
}

export async function generateMetadata({ params }: PageProps<'/[locale]/work/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  const layer = layerOf(locale, id);
  if (!layer || !hasLocale(routing.locales, locale)) return {};
  const content = getContent(locale);
  const metrics = metricMap(content);
  const lead = layer.lead.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, m: string) => metrics.get(m)?.display ?? '');
  return {
    title: `${layer.title} — ${content.person.name}`,
    description: lead,
    alternates: {
      canonical: workPath(locale, id),
      languages: Object.fromEntries(routing.locales.map((l) => [l, workPath(l, id)])),
    },
  };
}

export default async function WorkPage({ params }: PageProps<'/[locale]/work/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const layer = layerOf(locale, id);
  if (!layer) notFound();
  setRequestLocale(locale);

  const content = getContent(locale);
  const tc = await getTranslations('confidence');
  const tn = await getTranslations('nav');
  const td = await getTranslations('depth');
  const te = await getTranslations('evidence');
  const t = await getTranslations('cinema');
  const ctx: RichContext = {
    locale,
    metrics: metricMap(content),
    labels: { confidence: { measured: tc('measured'), approx: tc('approx'), reconstructed: tc('reconstructed') } },
  };
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
  const index = content.layers.indexOf(layer);
  const name = layerName[layer.id as LayerColorId];
  const at = WORK_IDS.indexOf(layer.id as (typeof WORK_IDS)[number]);
  const prev = at > 0 ? content.layers.find((l) => l.id === WORK_IDS[at - 1]) : undefined;
  const next = at < WORK_IDS.length - 1 ? content.layers.find((l) => l.id === WORK_IDS[at + 1]) : undefined;
  // The client's domain is shown only after their consent (NEXT_PUBLIC_ENABLE_PEGASUS_LINK).
  const titleUrl = layer.titleLink && (layer.titleLink !== 'pegasus' || isPegasusLinkEnabled()) ? LINKS[layer.titleLink] : null;

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
          <a className="action-lang" href={workPath(other, layer.id)} hrefLang={other} lang={other}>
            {tn('switchLanguage')}
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="work-page">
        <article className="work" aria-labelledby="work-title" data-layer={layer.id} style={{ '--layer': layerColor[layer.id as LayerColorId] } as CSSProperties}>
          <header className="work-header">
            <p className="work-eyebrow">
              <span>{td('label', { index })}</span>
              <span className="work-eyebrow-mark" aria-hidden="true">
                {kanjiOf(layer.id)} {locale === 'ja' ? name.ja : name.romaji}
              </span>
              {layer.period ? <span>{layer.period}</span> : null}
            </p>
            <h1 id="work-title">
              {layer.title}
              {titleUrl ? (
                <>
                  {' '}
                  <a className="title-link" href={titleUrl} target="_blank" rel="noopener noreferrer">
                    {displayHost(titleUrl)}
                  </a>
                </>
              ) : null}
            </h1>
            <p className="work-lead">
              <RichText text={layer.lead} ctx={ctx} />
            </p>
          </header>
          <div className="work-body">
            {layer.blocks.map((block, i) => (
              <BlockView key={i} block={block} ctx={ctx} id={`work-b${i}`} level={2} />
            ))}
          </div>
        </article>
        <nav className="work-nav" aria-label={t('workIndex')}>
          <a className="work-back" href={`/${locale}#${layerAnchor(layer.id)}`}>
            <span aria-hidden="true">← </span>
            {t('back')}
          </a>
          <span className="work-steps">
            {prev ? (
              <a href={workPath(locale, prev.id)} rel="prev">
                <span className="work-step-label">{t('prev')}</span>
                {prev.title}
              </a>
            ) : null}
            {next ? (
              <a href={workPath(locale, next.id)} rel="next">
                <span className="work-step-label">{t('next')}</span>
                {next.title}
              </a>
            ) : null}
          </span>
        </nav>
      </main>
      <SiteFooter />
      <span id={METRIC_HINT_ID} hidden>
        {te('open')}
      </span>
      <EvidenceDialog />
      <EvidenceController />
    </>
  );
}
