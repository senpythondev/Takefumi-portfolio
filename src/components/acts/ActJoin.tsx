import { getTranslations } from 'next-intl/server';
import type { Layer } from '@/content';
import { CONFIDENCE_SYMBOL } from '@/components/evidence/MetricLink';
import { BlockView } from '@/components/layers/Blocks';
import type { RichContext } from '@/components/layers/RichText';

/**
 * Where the cinematic acts hand over to the layer panels (`[data-act-join]`). While it scrolls in,
 * the director closes the core, flies it to the navigator at the edge and descends the borehole to
 * the first layer — so the panels arrive on the same wall, with no cut. Holds the 30-second summary
 * and the legend of the confidence labels.
 */
export async function ActJoin({ surface, ctx }: { surface: Layer; ctx: RichContext }) {
  const te = await getTranslations('evidence');
  const tc = await getTranslations('confidence');
  const summary = surface.blocks.filter((b) => b.kind === 'summary');
  return (
    <section className="act-join" data-act-join="" aria-label={te('legendTitle')}>
      {summary.map((block, i) => (
        <BlockView key={i} block={block} ctx={ctx} id={`act-join-b${i}`} />
      ))}
      <aside className="legend" aria-labelledby="legend-title">
        <h2 id="legend-title">{te('legendTitle')}</h2>
        <p>{te('legend')}</p>
        <dl>
          {(['measured', 'approx', 'reconstructed'] as const).map((c) => (
            <div key={c}>
              <dt>
                <span className="metric-symbol" data-confidence={c} aria-hidden="true">
                  {CONFIDENCE_SYMBOL[c]}
                </span>
                <span className="metric-badge" data-confidence={c}>
                  {tc(c)}
                </span>
              </dt>
              <dd>{tc(`${c}Def`)}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </section>
  );
}
