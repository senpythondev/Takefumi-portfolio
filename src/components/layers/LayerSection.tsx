import { getTranslations } from 'next-intl/server';
import type { Layer } from '@/content';
import { displayHost, isPegasusLinkEnabled, LINKS } from '@/content/links';
import { BlockView } from './Blocks';
import { RichText, type RichContext } from './RichText';

export function layerAnchor(id: string): string {
  return `layer-${id}`;
}

/**
 * HTML-only rendering of one layer (stratum). This is the fallback every tier relies on:
 * the 3D stage added in Phase 3 is an aria-hidden decoration on top of it.
 */
export async function LayerSection({ layer, index, ctx }: { layer: Layer; index: number; ctx: RichContext }) {
  const t = await getTranslations('depth');
  const anchor = layerAnchor(layer.id);
  // The client's domain is shown only after their consent (NEXT_PUBLIC_ENABLE_PEGASUS_LINK).
  const titleUrl = layer.titleLink && (layer.titleLink !== 'pegasus' || isPegasusLinkEnabled()) ? LINKS[layer.titleLink] : null;

  return (
    <section id={anchor} className="layer" data-layer={layer.id} aria-labelledby={`${anchor}-title`}>
      <header className="layer-header">
        <p className="layer-depth">
          <span>{t('label', { index })}</span>
          {layer.period ? <span className="layer-period">{layer.period}</span> : null}
        </p>
        <h2 id={`${anchor}-title`}>
          {layer.title}
          {titleUrl ? (
            <>
              {' '}
              <a className="title-link" href={titleUrl} target="_blank" rel="noopener noreferrer">
                {displayHost(titleUrl)}
              </a>
            </>
          ) : null}
        </h2>
        <p className="layer-lead">
          <RichText text={layer.lead} ctx={ctx} />
        </p>
      </header>
      <div className="layer-body">
        {layer.blocks.map((block, i) => (
          <BlockView key={i} block={block} ctx={ctx} id={`${anchor}-b${i}`} />
        ))}
      </div>
    </section>
  );
}
