import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContent, metricMap } from '@/content';
import { routing } from '@/i18n/routing';
import { EvidenceController } from '@/components/evidence/EvidenceController';
import { EvidenceDialog } from '@/components/evidence/EvidenceDialog';
import { METRIC_HINT_ID } from '@/components/evidence/ids';
import { Hero } from '@/components/layers/Hero';
import { layerAnchor, LayerSection } from '@/components/layers/LayerSection';
import type { RichContext } from '@/components/layers/RichText';
import { LayerIndex, SiteFooter, SiteHeader } from '@/components/layout/SiteChrome';
import { StageLoader } from '@/three/StageLoader';
import { LayerTracker } from '@/lib/scroll/LayerTracker';
import { layer as layerColor, type LayerColorId } from '@/styles/tokens';
import { CoreNav } from '@/components/layout/CoreNav';
import { DebugHudLoader } from '@/components/debug/DebugHudLoader';

/**
 * One page, surface → bedrock. Everything here is server-rendered HTML; the only client code is
 * EvidenceController (evidence dialog) and EmailReveal (address assembled in the browser).
 * Each metric's evidence lives on its own static page (/[locale]/evidence/[id]), not in this HTML.
 */
export default async function Page({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const content = getContent(locale);
  const tc = await getTranslations('confidence');
  const tn = await getTranslations('nav');
  const td = await getTranslations('depth');
  const te = await getTranslations('evidence');
  const ctx: RichContext = {
    locale,
    metrics: metricMap(content),
    labels: {
      confidence: { measured: tc('measured'), approx: tc('approx'), reconstructed: tc('reconstructed') },
    },
  };

  const [surface, ...rest] = content.layers;
  if (!surface || !rest[0]) throw new Error('content must contain the surface layer and at least one more');

  return (
    <>
      <SiteHeader locale={locale} person={content.person} />
      <main id="main" tabIndex={-1}>
        <Hero layer={surface} person={content.person} ctx={ctx} nextAnchor={layerAnchor(rest[0].id)} />
        <LayerIndex layers={content.layers} />
        {rest.map((layer, i) => (
          <LayerSection key={layer.id} layer={layer} index={i + 1} ctx={ctx} />
        ))}
      </main>
      <SiteFooter />
      <CoreNav
        label={tn('core')}
        layers={content.layers.map((l, index) => ({ id: l.id, depth: td('label', { index }), title: l.title, color: layerColor[l.id as LayerColorId] }))}
      />
      <span id={METRIC_HINT_ID} hidden>
        {te('open')}
      </span>
      <EvidenceDialog />
      <EvidenceController />
      <LayerTracker />
      <StageLoader />
      <DebugHudLoader />
    </>
  );
}
