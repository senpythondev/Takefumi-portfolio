import type { CSSProperties, ReactNode } from 'react';
import { KanjiMark } from '@/components/acts/KanjiMark';
import { getTranslations } from 'next-intl/server';
import { kanjiOf, type Act as ActDef } from '@/content/acts';
import { compareMetrics } from '@/content/results';
import type { ActCopy, Layer, Metric } from '@/content';
import { MetricLink } from '@/components/evidence/MetricLink';
import { RichText, type RichContext } from '@/components/layers/RichText';
import { layerName, type LayerColorId } from '@/styles/tokens';
import { ActStill } from './ActStill';
import { layerAnchor, workPath } from './anchors';
import { InkText } from './InkText';
import { StaticHtml } from '@/lib/static-html';

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

/**
 * The title card of an act (STORYBOARD v2.4 §12.1): which layer, its one-character mark, the project,
 * its period and one line about it (the role, where the PM gave one; otherwise the layer's lead) —
 * shown in the centre once the entry is over.
 */
export async function ActCard({ layer, index, ctx, role }: { layer: Layer; index: number; ctx: RichContext; role?: string }) {
  const td = await getTranslations('depth');
  return (
    <p className="act-card">
      <span className="act-card-top">
        <span className="act-card-depth">{td('label', { index })}</span>
        {layer.period ? <span className="act-card-period">{layer.period}</span> : null}
      </span>
      <span className="act-card-kanji" aria-hidden="true">
        {kanjiOf(layer.id)}
      </span>
      <span className="act-card-title">{layer.title}</span>
      <span className="act-card-lead">
        <RichText text={role ?? layer.lead} ctx={ctx} compact />
      </span>
    </p>
  );
}

/**
 * The four beats of an act (§12.2): ① problem ② investigation ③ action ④ result, one plain sentence
 * each. With the cinema on, the four names are a small scale at the bottom of the screen with the
 * current one lit, and only the current sentence shows; stacked, it is an ordinary ordered list.
 */
export async function ActBeats({ beats, ctx }: { beats: readonly string[]; ctx: RichContext }) {
  const t = await getTranslations('cinema');
  const names = t.raw('beatNames') as string[];
  return (
    <ol className="act-beats" aria-label={t('beats')}>
      {beats.map((text, i) => (
        <li key={i} className="act-beat" data-beat-item={i + 1}>
          <span className="act-beat-name">
            <span className="act-beat-no" aria-hidden="true">
              {'①②③④'[i]}
            </span>
            {names[i]}
          </span>
          <span className="act-beat-text">
            <RichText text={text} ctx={ctx} compact />
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The labels on the objects of the act's world (§12.2), as data: they only exist over the 3D, so the
 * director builds their elements on the client when the cinema runs (the static page does not carry
 * them; the sentences of the beats say the same things in the HTML).
 */
export function labelData(labels: Record<string, string>, ctx: RichContext): string {
  return JSON.stringify(Object.fromEntries(Object.entries(labels).map(([key, text]) => [key, text.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id: string) => ctx.metrics.get(id)?.display ?? '')])));
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
  compare,
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
  /** §13.1: the result as a comparison; the act's other numbers follow it. */
  compare?: ReactNode;
}) {
  const rest = compare ? copy.metrics.filter((id) => !compareMetrics(act.id).includes(id)) : copy.metrics;
  const t = await getTranslations('cinema');
  const anchor = layerAnchor(layer.id);
  return (
    <section
      id={anchor}
      className={`act act-world act-${layer.id}`}
      data-act={act.id}
      data-layer={layer.id}
      data-side={act.side ?? undefined}
      data-labels={copy.labels ? labelData(copy.labels, ctx) : undefined}
      aria-labelledby={`${anchor}-title`}
      style={{ '--len': act.len, '--tint': `var(--color-layer-${layer.id})` } as CSSProperties}
    >
      {/* Server-only HTML: one string for React, not a tree to describe again and hydrate (src/lib/static-html.tsx). */}
      <StaticHtml className="act-frame">
        {act.kanji ? <KanjiMark kanji={act.kanji} /> : null}
        {act.id !== 'next' ? <ActCard layer={layer} index={index} ctx={ctx} role={copy.role} /> : null}
        <div className="act-head">
          <ActEyebrow layer={layer} index={index} locale={ctx.locale} />
          <h2 className="act-headline" id={`${anchor}-title`} tabIndex={-1} data-act-headline={act.id}>
            <InkText text={copy.headline} ctx={ctx} />
          </h2>
        </div>
        {copy.beats ? <ActBeats beats={copy.beats} ctx={ctx} /> : null}
        {children ? <div className="act-extras">{children}</div> : null}
        <div className="act-result" data-compare={compare ? '' : undefined}>
          {compare}
          <ActMetrics ids={rest} ctx={ctx} captions={captions} className={compare ? 'act-metrics-minor' : ''} />
          {copy.then && !compare ? <ActMetrics ids={copy.then} ctx={ctx} className="act-metrics-then" /> : null}
          {work ? (
            <a className="act-case" href={workPath(ctx.locale, layer.id)}>
              {t('readCase')} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      </StaticHtml>
      {/* An act with content after its frame (the finale's drawer): the pinned part ends here. */}
      {after ? <div className="act-spacer" data-act-end="" aria-hidden="true" /> : null}
      {after}
      <ActStill name={act.id} />
    </section>
  );
}
