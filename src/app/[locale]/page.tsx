import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getContent, metricLayers, metricMap, type Layer } from '@/content';
import { ACTS, isWorkId, kanjiOf, type Act as ActDef } from '@/content/acts';
import { routing } from '@/i18n/routing';
import { EvidenceController } from '@/components/evidence/EvidenceController';
import { EvidenceDialog } from '@/components/evidence/EvidenceDialog';
import { METRIC_HINT_ID } from '@/components/evidence/ids';
import { Hero } from '@/components/layers/Hero';
import type { RichContext } from '@/components/layers/RichText';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteChrome';
import { Act } from '@/components/acts/Act';
import { ActIndex } from '@/components/acts/ActIndex';
import { AuctionExtras, BedrockExtras, CatchupExtras, CurrentExtras, DeepExtras, GentenExtras, PatentExtras, PhpExtras } from '@/components/acts/ActExtras';
import { FinaleDrawer } from '@/components/acts/FinaleDrawer';
import { StageLoader } from '@/three/StageLoader';
import { LayerTracker } from '@/lib/scroll/LayerTracker';
import { layer as layerColor, type LayerColorId } from '@/styles/tokens';
import { CoreNav } from '@/components/layout/CoreNav';
import { DebugHudLoader } from '@/components/debug/DebugHudLoader';

/**
 * The cinematic home (docs/STORYBOARD.md v2.1): acts only. The hero (acts 0–1), the split core as
 * the index (act 2), then one act per layer — each a pinned frame with its headline, two or three
 * big numbers and the link to its case study (/[locale]/work/[id], where the long texts live).
 * Everything here is server-rendered HTML; the 3D worlds behind are aria-hidden decoration.
 * Each metric's evidence lives on its own static page (/[locale]/evidence/[id]).
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
  const tcin = await getTranslations('cinema');
  const ctx: RichContext = {
    locale,
    metrics: metricMap(content),
    labels: {
      confidence: { measured: tc('measured'), approx: tc('approx'), reconstructed: tc('reconstructed') },
    },
  };

  const layers = new Map(content.layers.map((l) => [l.id, l]));
  const layerAt = (id: string) => layers.get(id as Layer['id']) as Layer;
  const surface = layerAt('surface');
  // Catch-up: each duration is captioned with the project it belongs to.
  const firstLayer = metricLayers(content);
  const projectCaptions = Object.fromEntries(
    content.cinema.acts.catchup.metrics.map((id) => {
      const metric = ctx.metrics.get(id);
      const project = layerAt(firstLayer.get(id) ?? 'catchup');
      return [id, `${project.title}：${metric?.label ?? ''}`];
    }),
  );

  const extras = (act: ActDef, layer: Layer): ReactNode => {
    switch (act.id) {
      case 'current':
        return <CurrentExtras />;
      case 'genten':
        return <GentenExtras layer={layer} clash={content.cinema.gentenClash} />;
      case 'php-audit':
        return <PhpExtras />;
      case 'auction':
        return <AuctionExtras />;
      case 'patent':
        return <PatentExtras />;
      case 'deep':
        return <DeepExtras layer={layer} ctx={ctx} />;
      case 'catchup':
        return <CatchupExtras layer={layer} />;
      case 'bedrock':
        return <BedrockExtras layer={layer} />;
      case 'next':
        return (
          <a className="act-drawer-open" href="#finale-drawer">
            {tcin('openDrawer')} <span aria-hidden="true">↓</span>
          </a>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* The world behind the page: a poster until the 3D wall is drawn over it (src/three/world). */}
      <div className="world" data-world-slot="" aria-hidden="true">
        <div className="world-poster" />
        {/* §10-A: while the page loads, the strata are laid down from the oldest up (CSS only). */}
        <div className="world-sediment">
          <div className="world-sediment-cover" />
        </div>
        {/* Act 0: the borehole is drilled as the 3D loads (StageLoader sets --drill 0–1). */}
        <div className="world-drill" />
        <span className="world-drill-meter">
          {tcin('drilling')} <span data-drill-pct="">0%</span>
        </span>
      </div>
      <SiteHeader locale={locale} person={content.person} />
      {/* §10-H: sound is optional and off; the audio code is fetched only when this is switched on. */}
      <button type="button" className="sound-toggle needs-cinema" data-sound-toggle="" aria-pressed="false" aria-label={tcin('soundLabel')}>
        <span aria-hidden="true" className="sound-toggle-bars">
          <i />
          <i />
          <i />
        </span>
        {tcin('sound')}
      </button>
      <main id="main" tabIndex={-1} data-cursor-enter={tcin('enter')} data-cursor-read={tcin('read')}>
        <Hero layer={surface} person={content.person} ctx={ctx} nextAnchor="index" coreHeadline={content.cinema.coreHeadline} />
        <ActIndex layers={content.layers} guide={content.cinema.indexGuide} locale={locale} />
        {ACTS.filter((a) => a.layer && a.layer !== 'surface').map((act) => {
          const layer = layerAt(act.layer as string);
          const index = content.layers.indexOf(layer);
          return (
            <Act
              key={act.id}
              act={act}
              layer={layer}
              index={index}
              copy={content.cinema.acts[act.id as keyof typeof content.cinema.acts]}
              ctx={ctx}
              captions={act.id === 'catchup' ? projectCaptions : undefined}
              work={isWorkId(act.id)}
              after={act.id === 'next' ? <FinaleDrawer next={layer} surface={surface} ctx={ctx} /> : undefined}
            >
              {extras(act, layer)}
            </Act>
          );
        })}
      </main>
      <SiteFooter />
      <CoreNav
        label={tn('core')}
        layers={content.layers.map((l, index) => ({ id: l.id, depth: td('label', { index }), title: l.title, color: layerColor[l.id as LayerColorId], kanji: kanjiOf(l.id) }))}
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
