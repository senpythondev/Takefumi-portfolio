import { getTranslations } from 'next-intl/server';
import type { Layer } from '@/content';
import { CONFIDENCE_SYMBOL } from '@/components/evidence/MetricLink';
import { BlockView } from '@/components/layers/Blocks';
import type { RichContext } from '@/components/layers/RichText';

/**
 * Act 7: what the empty band holds when it slides open like a drawer (STORYBOARD v2.1 §4) — the
 * terms, the contact, the links, the 30-second summary and the legend of the confidence labels.
 * It is ordinary HTML in the normal flow after the pinned frame, so it reads the same with or
 * without JavaScript; with the cinema on, the director opens the 3D band as it scrolls in.
 */
export async function FinaleDrawer({ next, surface, ctx }: { next: Layer; surface: Layer; ctx: RichContext }) {
  const t = await getTranslations('cinema');
  const te = await getTranslations('evidence');
  const tc = await getTranslations('confidence');
  const summary = surface.blocks.filter((b) => b.kind === 'summary');
  return (
    <div id="finale-drawer" className="finale-drawer" data-act-drawer="" aria-labelledby="finale-drawer-title">
      <h3 id="finale-drawer-title" className="finale-drawer-title">
        {t('drawerTitle')}
      </h3>
      <div className="finale-drawer-grid">
        {next.blocks.map((block, i) => (
          <BlockView key={i} block={block} ctx={ctx} id={`finale-b${i}`} />
        ))}
      </div>
      {summary.map((block, i) => (
        <BlockView key={`s${i}`} block={block} ctx={ctx} id={`finale-s${i}`} />
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
    </div>
  );
}
