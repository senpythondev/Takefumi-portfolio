import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import type { Layer, Metric, SiteContent } from '@/content';
import type { ActId } from '@/content/acts';
import { COMPARE, percentOf } from '@/content/results';
import { MetricLink } from '@/components/evidence/MetricLink';
import { RichText, type RichContext } from '@/components/layers/RichText';

/**
 * The result of an act as a comparison (docs/STORYBOARD.md v2.4 §13.1): bars, before and after, or a
 * list — whatever lets the number be read against something. Every value is a Metric link from the
 * fact sheet; the bars' lengths come from those same values (src/content/results.ts).
 */
export async function ActCompare({ id, layer, cinema, ctx }: { id: ActId; layer: Layer; cinema: SiteContent['cinema']; ctx: RichContext }) {
  const compare = COMPARE[id];
  if (!compare) return null;
  const t = await getTranslations('cinema');
  const metric = (m: string) => ctx.metrics.get(m) as Metric;
  const link = (m: string) => <MetricLink metric={metric(m)} labels={ctx.labels} locale={ctx.locale} compact />;
  const bar = (from: number, to: number, open = false) => (
    <span className="compare-bar" aria-hidden="true" data-open={open ? '' : undefined} style={{ '--from': from.toFixed(4), '--to': to.toFixed(4) } as CSSProperties}>
      <i />
    </span>
  );

  if (compare.kind === 'bars') {
    return (
      <div className="compare compare-bars">
        {compare.rows.map((row) => (
          <div key={row.metric} className="compare-row" data-win={row.win ? '' : undefined}>
            <span className="compare-label">{metric(row.metric).label}</span>
            {bar(row.from ?? row.to, row.to, row.open)}
            <span className="compare-value">{link(row.metric)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (compare.kind === 'groups') {
    const lanes = t.raw('lanes') as string[];
    const titles = t.raw('compareGroups') as string[];
    return (
      <div className="compare compare-groups">
        {compare.groups.map((group, g) => (
          <div key={g} className="compare-group" role="group" aria-label={titles[g]}>
            <p className="compare-title">{titles[g]}</p>
            {group.map((m, i) => (
              <div key={m} className="compare-row" data-win={i === group.length - 1 ? '' : undefined}>
                <span className="compare-label">{lanes[i]}</span>
                {bar(percentOf(metric(m).display)?.[1] ?? 0, percentOf(metric(m).display)?.[1] ?? 0)}
                <span className="compare-value">{link(m)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (compare.kind === 'change') {
    return (
      <div className="compare compare-change">
        <p className="compare-side" data-side="before">
          <span className="compare-tag">{t('before')}</span>
          <span className="compare-state">{t('beforeErrors')}</span>
        </p>
        <span className="compare-arrow" aria-hidden="true">
          →
        </span>
        <p className="compare-side" data-side="after" data-win="">
          <span className="compare-tag">{t('after')}</span>
          <span className="compare-state">
            <RichText text={cinema.auctionAfter} ctx={ctx} compact />
          </span>
        </p>
      </div>
    );
  }

  if (compare.kind === 'risks') {
    // The third list of the layer is the risks found (same structure in ja and en: `npm run validate`).
    const risks = layer.blocks.filter((b) => b.kind === 'list')[2];
    const stages = Number.parseInt(/\d+/.exec(metric(compare.plan).display)?.[0] ?? '0', 10);
    return (
      <div className="compare compare-risks">
        {risks?.kind === 'list' ? (
          <div className="compare-group">
            <p className="compare-title">{risks.heading}</p>
            <ul className="compare-list">
              {risks.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="compare-group">
          <p className="compare-title">
            {t('plan')} <span className="compare-value">{link(compare.plan)}</span>
          </p>
          <ol className="compare-stairs" aria-label={t('planOrder')}>
            {Array.from({ length: stages }, (_, i) => (
              <li key={i} style={{ '--i': i } as CSSProperties}>
                {t('planStage', { n: i + 1 })}
              </li>
            ))}
          </ol>
          <p className="compare-note" aria-hidden="true">
            {t('planOrder')}
          </p>
        </div>
      </div>
    );
  }

  const gates = t.raw('currentGates') as string[];
  return (
    <ol className="compare compare-gates">
      {gates.map((g) => (
        <li key={g}>
          <span aria-hidden="true">✓</span> {g}
        </li>
      ))}
    </ol>
  );
}
