import { getTranslations } from 'next-intl/server';
import { ActStill } from '@/components/acts/ActStill';
import type { Layer, SiteContent } from '@/content';
import { RevealText } from '@/components/acts/RevealText';
import { phrases } from '@/components/text/Phrase';
import { BlockView } from './Blocks';
import { layerAnchor } from './LayerSection';
import { RichText, type RichContext } from './RichText';

/**
 * Layer 0 (surface) = acts 0–1 of the cinematic home (docs/STORYBOARD.md).
 *
 * - The catch copy is the LCP element: plain server-rendered text, no JS.
 * - With the cinema on (`html[data-cinema]`) the section is tall. The hero text scrolls away in the
 *   normal flow (it may be taller than a phone screen, so it is never pinned) and fades as it goes
 *   (`--hero-fade`); behind it the core is pulled out of the borehole. The act frame is pinned and
 *   holds only the act headline, which lights up phrase by phrase (`--reveal`). The director drives
 *   both (src/three/director).
 * - Without it (no JS, reduced motion, static tier) the same story is stacked: hero, act headline,
 *   a still of the core.
 */
export async function Hero({ layer, person, ctx, nextAnchor, coreHeadline }: { layer: Layer; person: SiteContent['person']; ctx: RichContext; nextAnchor: string; coreHeadline: string }) {
  const tn = await getTranslations('nav');
  const anchor = layerAnchor(layer.id);
  const firstView = layer.blocks.filter((b) => b.kind === 'chips' || b.kind === 'availability');

  return (
    <section id={anchor} className="layer layer-surface act act-surface" data-layer={layer.id} data-act="surface" aria-labelledby={`${anchor}-title`}>
      <div className="hero-content" data-hero-content="">
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
          <p className="hero-copy">{phrases(layer.title)}</p>
          <p className="hero-lead">
            <RichText text={layer.lead} ctx={ctx} />
          </p>
        </header>
        <div className="hero-body">
          {firstView.map((block, i) => (
            <BlockView key={i} block={block} ctx={ctx} id={`${anchor}-b${i}`} />
          ))}
        </div>
        <p className="dig">
          <a href={`#${nextAnchor}`}>
            {tn('dig')} <span aria-hidden="true">↓</span>
          </a>
        </p>
      </div>
      <div className="act-frame">
        <h2 className="act-headline" id="act-core-title" data-act-headline="core">
          <RevealText text={coreHeadline} ctx={ctx} />
        </h2>
      </div>
      <ActStill name="core" />
    </section>
  );
}
