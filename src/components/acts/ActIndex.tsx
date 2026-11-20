import { StaticHtml } from '@/lib/static-html';
import { getTranslations } from 'next-intl/server';
import type { Layer } from '@/content';
import { kanjiOf } from '@/content/acts';
import { layerName, type LayerColorId } from '@/styles/tokens';
import { ActStill } from './ActStill';
import { layerAnchor } from './anchors';

/**
 * Act 2 (STORYBOARD v2.1 §1, §4): the core comes apart into its 11 bands and becomes the index of
 * the whole site. The labels are the index: one real link per band, read as 「第N層 期間 案件名」
 * (the kanji mark and the colour name are decoration). With the cinema on, the director floats
 * each label over its band, and hovering or focusing a link — or pointing at the band itself —
 * brings that band forward; following the link flies into the band's world (src/lib/scroll/cinema-ui.ts).
 * Without it this is a plain list after a still of the split core.
 */
export async function ActIndex({ layers, guide, locale }: { layers: Layer[]; guide: string; locale: string }) {
  const t = await getTranslations('nav');
  const td = await getTranslations('depth');
  return (
    <section id="index" className="act act-explode" data-act="explode" aria-labelledby="layer-index-title">
      <StaticHtml className="act-frame">
        <nav className="band-labels layer-index" aria-labelledby="layer-index-title">
          <h2 id="layer-index-title">{t('layers')}</h2>
          <ol>
            {layers.map((layer, index) => {
              const name = layerName[layer.id as LayerColorId];
              return (
                <li key={layer.id} data-band={index} data-layer={layer.id}>
                  <a href={`#${layerAnchor(layer.id)}`} data-band-link={layer.id}>
                    <span className="band-label-head" data-decode="">
                      <span className="band-label-depth">{td('label', { index })}</span>
                      <span className="band-label-mark" aria-hidden="true">
                        {kanjiOf(layer.id)} {locale === 'ja' ? name.ja : name.romaji}
                      </span>
                    </span>
                    {layer.period ? <span className="band-label-period">{layer.period}</span> : null}
                    <span className="band-label-title">{layer.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="index-guide">{guide}</p>
      </StaticHtml>
      <ActStill name="explode" />
    </section>
  );
}
