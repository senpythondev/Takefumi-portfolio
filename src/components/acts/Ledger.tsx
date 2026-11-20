import { getTranslations } from 'next-intl/server';
import type { Layer, Metric, SiteContent } from '@/content';
import { kanjiOf } from '@/content/acts';
import { LEDGER } from '@/content/results';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { layerAnchor } from './anchors';

export type LedgerRow = { layer: Layer; metrics: Metric[]; sentence: string | null; text: string };

const plain = (text: string, ctx: RichContext) => text.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id: string) => ctx.metrics.get(id)?.display ?? '');

/**
 * The results ledger (docs/STORYBOARD.md v2.4 §13.3): for each act, the numbers of its result — or,
 * where the result has no number, its result sentence. `text` is the same as one plain line (what a
 * band of the navigator shows once the act has been seen).
 */
export function ledgerRows(content: SiteContent, ctx: RichContext): LedgerRow[] {
  const layers = new Map(content.layers.map((l) => [l.id as string, l]));
  return LEDGER.flatMap(({ act, metrics }) => {
    const layer = layers.get(act);
    if (!layer) return [];
    const list = metrics.map((id) => ctx.metrics.get(id) as Metric);
    const beats = content.cinema.acts[act as keyof SiteContent['cinema']['acts']].beats;
    const sentence = list.length === 0 && beats ? plain(beats[3], ctx) : null;
    const text = sentence ?? list.map((m) => (ctx.locale === 'ja' ? `${m.display}（${m.label}）` : `${m.display} (${m.label})`)).join(ctx.locale === 'ja' ? '、' : '; ');
    return [{ layer, metrics: list, sentence, text }];
  });
}

/**
 * "What was dug up": every act's result in one list beside the rebuilt core (the finale). Each
 * number opens its evidence; the list is plain, tidy HTML, so a screenshot of it can be passed on.
 */
export async function Ledger({ rows, ctx }: { rows: LedgerRow[]; ctx: RichContext }) {
  const t = await getTranslations('cinema');
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <h3 id="ledger-title" className="ledger-title">
        {t('ledger')}
      </h3>
      <ul className="ledger-list">
        {rows.map((row) => (
          <li key={row.layer.id} className="ledger-row" data-ledger={row.layer.id}>
            <a className="ledger-project" href={`#${layerAnchor(row.layer.id)}`}>
              <span className="ledger-kanji" aria-hidden="true">
                {kanjiOf(row.layer.id)}
              </span>
              {row.layer.title}
            </a>
            {row.sentence ? (
              <span className="ledger-sentence">{row.sentence}</span>
            ) : (
              <span className="ledger-values">
                {row.metrics.map((m) => (
                  <span key={m.id} className="ledger-value">
                    <MetricLink metric={m} labels={ctx.labels} locale={ctx.locale} compact />
                    <span className="ledger-label">{m.label}</span>
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
