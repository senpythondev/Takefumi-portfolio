import { getTranslations } from 'next-intl/server';
import type { Layer, SiteContent } from '@/content';
import { BlockView } from './Blocks';
import { layerAnchor } from './LayerSection';
import { RichText, type RichContext } from './RichText';

/** Layer 0 (surface). Its catch copy is the LCP element: plain server-rendered text, no JS. */
export async function Hero({ layer, person, ctx, nextAnchor }: { layer: Layer; person: SiteContent['person']; ctx: RichContext; nextAnchor: string }) {
  const tn = await getTranslations('nav');
  const te = await getTranslations('evidence');
  const tc = await getTranslations('confidence');
  const anchor = layerAnchor(layer.id);

  return (
    <section id={anchor} className="layer layer-surface" data-layer={layer.id} aria-labelledby={`${anchor}-title`}>
      <div className="hero-stage" data-stage-slot={layer.id} aria-hidden="true" />
      <header className="hero-header">
        <h1 id={`${anchor}-title`}>
          <span className="hero-name">{person.name}</span>
          {person.name !== person.nameLatin ? (
            <span className="hero-name-latin" lang="en">
              {person.nameLatin}
            </span>
          ) : null}
          <span className="hero-role">{person.role}</span>
        </h1>
        <p className="hero-copy">{layer.title}</p>
        <p className="hero-lead">
          <RichText text={layer.lead} ctx={ctx} />
        </p>
      </header>
      <div className="hero-body">
        {layer.blocks.map((block, i) => (
          <BlockView key={i} block={block} ctx={ctx} id={`${anchor}-b${i}`} />
        ))}
        <aside className="legend" aria-labelledby={`${anchor}-legend`}>
          <h2 id={`${anchor}-legend`}>{te('legendTitle')}</h2>
          <p>{te('legend')}</p>
          <dl>
            {(['measured', 'approx', 'reconstructed'] as const).map((c) => (
              <div key={c}>
                <dt>
                  <span className="metric-badge" data-confidence={c}>
                    {tc(c)}
                  </span>
                </dt>
                <dd>{tc(`${c}Def`)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
      <p className="dig">
        <a href={`#${nextAnchor}`}>
          {tn('dig')} <span aria-hidden="true">↓</span>
        </a>
      </p>
    </section>
  );
}
