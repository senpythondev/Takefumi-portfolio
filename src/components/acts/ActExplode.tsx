import { getTranslations } from 'next-intl/server';
import { ActStill } from '@/components/acts/ActStill';
import type { Layer } from '@/content';
import { layerAnchor } from '@/components/layers/LayerSection';
import { phrases } from '@/components/text/Phrase';

/**
 * Act 2 (docs/STORYBOARD.md): the core comes apart into its 11 bands; above each band a thin line
 * rises to a small label (period and project). The labels are the layer index: real links to each
 * layer, keyboard usable. The director places them over their bands (`--x`, `--y`, `--on`);
 * without it they are a plain list after a still of the exploded core.
 */
export async function ActExplode({ layers }: { layers: Layer[] }) {
  const t = await getTranslations('nav');
  const td = await getTranslations('depth');
  return (
    <section className="act act-explode" data-act="explode" aria-labelledby="layer-index-title">
      <div className="act-frame">
        <nav className="band-labels layer-index" aria-labelledby="layer-index-title">
          <h2 id="layer-index-title">{t('layers')}</h2>
          <ol>
            {layers.map((layer, index) => (
              <li key={layer.id} data-band={index} data-layer={layer.id}>
                <a href={`#${layerAnchor(layer.id)}`}>
                  <span className="layer-index-depth">
                    <span className="layer-index-depth-text">{layer.period ?? td('label', { index })}</span>
                    {/* The director rolls the digits here for a moment when the label appears; the real text stays in the DOM. */}
                    <span className="layer-index-scramble" aria-hidden="true" />
                  </span>
                  <span className="layer-index-title">{phrases(layer.title)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>
      <ActStill name="explode" />
    </section>
  );
}
