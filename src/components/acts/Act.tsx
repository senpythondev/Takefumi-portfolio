import type { CSSProperties, ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { kanjiOf, type Act as ActDef } from '@/content/acts';
import type { ActCopy, Layer, Metric } from '@/content';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { layerName, type LayerColorId } from '@/styles/tokens';
import { ActStill } from './ActStill';
import { layerAnchor, workPath } from './anchors';
import { InkText } from './InkText';

/** The small mono label over a headline: depth, kanji, colour name, period (STORYBOARD v2.1 §8.3, §8.8). */
export async function ActEyebrow({ layer, index, locale }: { layer: Layer; index: number; locale: string }) {
  const td = await getTranslations('depth');
  const name = layerName[layer.id as LayerColorId];
  return (
    <p className="act-eyebrow" data-decode="">
      <span className="act-eyebrow-depth">{td('label', { index })}</span>
      <span className="act-eyebrow-mark" aria-hidden="true">
        {kanjiOf(layer.id)}
        <span className="act-eyebrow-colour">{locale === 'ja' ? name.ja : name.romaji}</span>
      </span>
      {layer.period ? <span className="act-eyebrow-period">{layer.period}</span> : null}
    </p>
  );
}

/** The big numbers of an act: 2–3 Metric links, each with its one-line caption (STORYBOARD §3). */
export function ActMetrics({ ids, ctx, className = '', captions }: { ids: readonly string[]; ctx: RichContext; className?: string; captions?: Record<string, string> }) {
  if (ids.length === 0) return null;
  return (
    <ul className={`act-metrics ${className}`.trim()}>
      {ids.map((id) => {
        const metric = ctx.metrics.get(id) as Metric;
        return (
          <li key={id} className="act-metric" data-count={metric.id}>
            <MetricLink metric={metric} labels={ctx.labels} locale={ctx.locale} compact />
            <span className="act-metric-caption">{captions?.[id] ?? metric.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One act of the cinematic home after the index (STORYBOARD v2.1 §3–§4): a tall section whose
 * frame is pinned while its world plays (`html[data-cinema]`). The frame holds only the act's
 * kanji mark, its headline, its big numbers and the case-study link, plus the act's own controls
 * (`children`). Everything is server-rendered HTML; the 3D world behind is aria-hidden.
 *
 * Without the cinema (no JS, reduced motion, static tier) the same content is stacked, with a still
 * of the scene.
 */
export async function Act({
  act,
  layer,
  index,
  copy,
  ctx,
  children,
  after,
  captions,
  work = true,
}: {
  act: ActDef;
  layer: Layer;
  index: number;
  copy: ActCopy;
  ctx: RichContext;
  children?: ReactNode;
  after?: ReactNode;
  captions?: Record<string, string>;
  work?: boolean;
}) {
  const t = await getTranslations('cinema');
  const anchor = layerAnchor(layer.id);
  return (
    <section
      id={anchor}
      className={`act act-world act-${layer.id}`}
      data-act={act.id}
      data-layer={layer.id}
      data-side={act.side ?? undefined}
      aria-labelledby={`${anchor}-title`}
      style={{ '--len': act.len } as CSSProperties}
    >
      <div className="act-frame">
        <span className="act-kanji" aria-hidden="true">
          {act.kanji}
        </span>
        <div className="act-head">
          <ActEyebrow layer={layer} index={index} locale={ctx.locale} />
          <h2 className="act-headline" id={`${anchor}-title`} tabIndex={-1} data-act-headline={act.id}>
            <InkText text={copy.headline} ctx={ctx} />
          </h2>
        </div>
        {children ? <div className="act-extras">{children}</div> : null}
        <div className="act-result">
          <ActMetrics ids={copy.metrics} ctx={ctx} captions={captions} />
          {copy.then ? <ActMetrics ids={copy.then} ctx={ctx} className="act-metrics-then" /> : null}
          {work ? (
            <a className="act-case" href={workPath(ctx.locale, layer.id)}>
              {t('readCase')} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      </div>
      {/* An act with content after its frame (the finale's drawer): the pinned part ends here. */}
      {after ? <div className="act-spacer" data-act-end="" aria-hidden="true" /> : null}
      {after}
      <ActStill name={act.id} />
    </section>
  );
}
