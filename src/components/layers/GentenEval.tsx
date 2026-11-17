import { getTranslations } from 'next-intl/server';
import type { Block } from '@/content';
import { gentenEval, gentenGrid } from '@/content/facts';
import { MetricButton } from '@/components/evidence/MetricButton';
import { plainText, RichText, type RichContext } from './RichText';

type GentenBlock = Extract<Block, { kind: 'genten-eval' }>;

/**
 * Static (HTML-only) version of the 25-question race: the summary table plus the per-question grid.
 * Per-question data comes straight from docs/facts/genten-eval.json — nothing is invented.
 * Phase 5 animates this; the table stays as the accessible fallback.
 */
export async function GentenEval({ block, ctx, headingId }: { block: GentenBlock; ctx: RichContext; headingId: string }) {
  const t = await getTranslations('genten');
  const grid = gentenGrid(gentenEval);

  return (
    <div className="genten-eval">
      <h3 id={headingId}>{block.heading}</h3>
      <p>
        <RichText text={block.intro} ctx={ctx} />
      </p>

      <div className="table-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
        <table className="eval-table">
          <thead>
            <tr>
              <td />
              {block.configs.map((c) => (
                <th key={c.id} scope="col" data-config={c.id}>
                  <RichText text={c.label} ctx={ctx} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {block.configs.map((c) => {
                  const metric = ctx.metrics.get(row.metrics[c.id]);
                  return (
                    <td key={c.id} data-config={c.id}>
                      {metric ? <MetricButton metric={metric} labels={ctx.labels} /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="takeaway">
        <RichText text={block.takeaway} ctx={ctx} />
      </p>

      <figure className="eval-grid">
        <figcaption id={`${headingId}-grid`}>{block.gridCaption}</figcaption>
        <div className="table-scroll" role="region" aria-labelledby={`${headingId}-grid`} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('setup')}</th>
                {grid.map((_, i) => (
                  <th key={i} scope="col">
                    <span aria-hidden="true">{i + 1}</span>
                    <span className="sr-only">
                      {t('question')} {i + 1}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.configs.map((c) => (
                <tr key={c.id} data-config={c.id}>
                  <th scope="row">{plainText(c.label, ctx)}</th>
                  {grid.map((row, i) => {
                    const ok = row[c.id];
                    return (
                      <td key={i} className={ok ? 'is-correct' : 'is-incorrect'}>
                        <span aria-hidden="true">{ok ? '○' : '×'}</span>
                        <span className="sr-only">{ok ? t('correct') : t('incorrect')}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    </div>
  );
}
