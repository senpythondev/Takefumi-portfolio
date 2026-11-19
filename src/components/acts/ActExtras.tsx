import { getTranslations } from 'next-intl/server';
import type { Block, Layer, Metric, SiteContent } from '@/content';
import { gentenGrid } from '@/content/facts';
import { LINKS } from '@/content/links';
import { clashAmounts } from '@/content/validate';
import { MetricLink } from '@/components/evidence/MetricLink';
import type { RichContext } from '@/components/layers/RichText';
import { workPath } from './anchors';

/**
 * The controls and small HTML pieces of each act (STORYBOARD v2.1 §4, §5). They sit in the act's
 * pinned frame next to the 3D world, which reads them (data attributes, input values) — the facts
 * stay in the HTML. Controls that only make sense with the 3D (sliders, the watermark input) are
 * shown only with the cinema on (globals.css `.needs-cinema`).
 */

const blocksOf = <K extends Block['kind']>(layer: Layer, kind: K) => layer.blocks.filter((b): b is Extract<Block, { kind: K }> => b.kind === kind);

/** 3-1: the two gates a change passes (the result is shown by the world). */
export async function CurrentExtras() {
  const t = await getTranslations('cinema');
  const gates = t.raw('currentGates') as string[];
  return (
    <ol className="act-steps current-gates" data-steps="">
      {gates.map((g, i) => (
        <li key={g} data-step={i}>
          {g}
        </li>
      ))}
    </ol>
  );
}

/** 3-2: the quoted clash of two amounts, and the 25 gates (one button per question). */
export async function GentenExtras({ layer, clash }: { layer: Layer; clash: SiteContent['cinema']['gentenClash'] }) {
  const t = await getTranslations('cinema');
  const lanes = t.raw('lanes') as string[];
  const citation = blocksOf(layer, 'citation')[0]?.citation;
  const [leftAmount, rightAmount] = citation ? clashAmounts(citation.quote) : [];
  const mark = (ok: boolean) => (ok ? t('correctShort') : t('incorrectShort'));
  return (
    <>
      {citation && leftAmount && rightAmount ? (
        <figure className="clash" data-clash="">
          <p className="clash-side" data-side="left">
            <span className="clash-who">{clash.left}</span>
            <span className="clash-amount">{leftAmount}</span>
          </p>
          <p className="clash-side" data-side="right">
            <span className="clash-who">{clash.right}</span>
            <span className="clash-amount">{rightAmount}</span>
          </p>
          <figcaption className="clash-source">
            {t('quoteSource')}：
            <a href={LINKS[citation.sourceLink]} target="_blank" rel="noopener noreferrer">
              {citation.sourceLabel}
              <span aria-hidden="true"> ↗</span>
            </a>
          </figcaption>
        </figure>
      ) : null}
      <ol className="gates" aria-label={t('gates')} data-lanes={lanes.join('|')}>
        {gentenGrid().map((row, i) => {
          const n = i + 1;
          const bits = [row['closed-book'], row['keyword-search'], row.genten];
          return (
            <li key={n}>
              <button
                type="button"
                className="gate"
                data-gate={n}
                data-r={bits.map((b) => (b ? 1 : 0)).join('')}
                aria-pressed="false"
                aria-label={t('gateResult', { n, a: mark(bits[0] as boolean), b: mark(bits[1] as boolean), c: mark(bits[2] as boolean) })}
              >
                {n}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** 3-4: the reconstruction notice for the whole section, the threshold slider, the two-colour notes. */
export async function PhpExtras() {
  const t = await getTranslations('cinema');
  const tc = await getTranslations('confidence');
  return (
    <>
      <p className="act-badge" role="note">
        <span className="metric-badge" data-confidence="reconstructed">
          {tc('reconstructed')}
        </span>
        {t('reconstructedNote')}
      </p>
      <label className="act-slider needs-cinema">
        <span>{t('threshold')}</span>
        <input type="range" min={0} max={100} defaultValue={18} data-control="threshold" />
      </label>
      <ul className="php-notes">
        <li data-tone="confirmed">
          <span className="php-note-tag">{t('confirmed')}</span>
          {t('confirmedNote')}
        </li>
        <li data-tone="inferred">
          <span className="php-note-tag">{t('inferred')}</span>
          {t('inferredNote')}
        </li>
      </ul>
    </>
  );
}

/** 3-5: the bidders slider (no numbers: fewer ↔ more) and the button that cannot be pressed. */
export async function AuctionExtras() {
  const t = await getTranslations('cinema');
  return (
    <>
      <label className="act-slider needs-cinema">
        <span>{t('bidders')}</span>
        <span className="act-slider-row">
          <span aria-hidden="true">{t('fewer')}</span>
          <input type="range" min={0} max={100} defaultValue={35} data-control="bidders" aria-valuetext={t('bidders')} />
          <span aria-hidden="true">{t('more')}</span>
        </span>
      </label>
      <button type="button" className="act-dead-button needs-cinema" disabled data-falls="">
        {t('moreServers')}
      </button>
    </>
  );
}

/** 3-6: the four stations, and the name that becomes the watermark (never sent or stored). */
export async function PatentExtras() {
  const t = await getTranslations('cinema');
  const stations = t.raw('patentStations') as string[];
  return (
    <>
      <ol className="act-steps stations" aria-label={t('stations')} data-steps="">
        {stations.map((s, i) => (
          <li key={s} data-step={i}>
            {s}
          </li>
        ))}
      </ol>
      <div className="watermark needs-cinema">
        <label>
          <span>{t('yourName')}</span>
          <input type="text" maxLength={40} autoComplete="off" spellCheck={false} data-control="watermark" />
        </label>
        <p className="watermark-note">{t('nameNote')}</p>
      </div>
    </>
  );
}

/** 4: the eight thin-section cards: a link to each project's case study and its own figure. */
export async function DeepExtras({ layer, ctx }: { layer: Layer; ctx: RichContext }) {
  const t = await getTranslations('cinema');
  const projects = blocksOf(layer, 'projects')[0]?.projects ?? [];
  const firstMetric = (texts: string[]) => texts.join(' ').match(/\{\{([a-z0-9-]+)\}\}/)?.[1];
  return (
    <ol className="deep-cards" aria-label={t('cards')}>
      {projects.map((p, i) => {
        const id = firstMetric(p.results);
        const metric = id ? (ctx.metrics.get(id) as Metric) : null;
        return (
          <li key={p.id} data-card={i}>
            <a className="deep-card" href={`${workPath(ctx.locale, 'deep')}#project-${p.id}`}>
              <span className="deep-card-industry">{p.industry}</span>
              <span className="deep-card-title">{p.title}</span>
              <span className="deep-card-period">{p.period}</span>
              <span className="deep-card-tech">{p.tech.slice(0, 3).join(' · ')}</span>
            </a>
            {metric ? (
              <span className="deep-card-figure">
                <MetricLink metric={metric} labels={ctx.labels} locale={ctx.locale} compact />
                <span className="act-metric-caption">{metric.label}</span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** 5: the years the AI tools came into use (plain dates, no confidence label). */
export async function CatchupExtras({ layer }: { layer: Layer }) {
  const t = await getTranslations('cinema');
  const timeline = blocksOf(layer, 'timeline')[0];
  if (!timeline) return null;
  return (
    <ol className="ai-years" aria-label={t('aiYears')}>
      {timeline.items.map((item) => (
        <li key={item.what}>
          <span className="ai-years-when">{item.when}</span>
          <span className="ai-years-what">{item.what}</span>
        </li>
      ))}
    </ol>
  );
}

/** 6: the three creeds carved in the bedrock, and the line from Helsinki. */
export async function BedrockExtras({ layer }: { layer: Layer }) {
  const t = await getTranslations('cinema');
  const creeds = blocksOf(layer, 'creeds')[0]?.items ?? [];
  return (
    <>
      <ol className="creeds" aria-label={t('creeds')}>
        {creeds.map((c, i) => (
          <li key={c} data-creed={i}>
            {c}
          </li>
        ))}
      </ol>
      <p className="bedrock-line">{layer.lead}</p>
    </>
  );
}
