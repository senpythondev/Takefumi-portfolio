/**
 * Content validation shared by the page loader (src/content/index.ts) and the CLI
 * (scripts/validate-content.ts). Pure functions only — no fs, no Next.js imports —
 * so it runs both under Next.js and under Node's built-in type stripping.
 */
import { LAYER_IDS, METRIC_TOKEN, SiteContentSchema } from './schema.ts';
import type { Block, Layer, SiteContent, SiteContentInput } from './schema.ts';
import { gentenEval } from './facts.ts';

export class ContentError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Content validation failed:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/** Every human-readable string in a layer, tagged with whether it may contain {{tokens}}. */
export function* layerStrings(layer: Layer): Generator<{ path: string; text: string; rich: boolean; citation?: boolean }> {
  const base = `layers.${layer.id}`;
  yield { path: `${base}.title`, text: layer.title, rich: false };
  if (layer.period) yield { path: `${base}.period`, text: layer.period, rich: false };
  yield { path: `${base}.lead`, text: layer.lead, rich: true };
  for (const [i, block] of layer.blocks.entries()) {
    yield* blockStrings(block, `${base}.blocks[${i}]`);
  }
}

function* blockStrings(block: Block, path: string): Generator<{ path: string; text: string; rich: boolean; citation?: boolean }> {
  switch (block.kind) {
    case 'paragraph':
      yield { path: `${path}.text`, text: block.text, rich: true };
      break;
    case 'list':
    case 'chips':
    case 'summary':
      if ('heading' in block && block.heading) yield { path: `${path}.heading`, text: block.heading, rich: false };
      for (const [i, item] of block.items.entries()) yield { path: `${path}.items[${i}]`, text: item, rich: true };
      break;
    case 'tech':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      // Technology names (e.g. "Python 3.10", "Java 11") are identifiers, not metrics.
      break;
    case 'availability':
    case 'notice':
      yield { path: `${path}.text`, text: block.text, rich: false };
      break;
    case 'timeline':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      for (const [i, item] of block.items.entries()) {
        yield { path: `${path}.items[${i}].when`, text: item.when, rich: false };
        yield { path: `${path}.items[${i}].what`, text: item.what, rich: false };
      }
      break;
    case 'projects':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      for (const [i, p] of block.projects.entries()) {
        const pp = `${path}.projects[${i}]`;
        yield { path: `${pp}.period`, text: p.period, rich: false };
        yield { path: `${pp}.title`, text: p.title, rich: false };
        yield { path: `${pp}.industry`, text: p.industry, rich: false };
        yield { path: `${pp}.summary`, text: p.summary, rich: false };
        yield { path: `${pp}.role`, text: p.role, rich: false };
        yield { path: `${pp}.team`, text: p.team, rich: true };
        for (const [j, r] of p.results.entries()) yield { path: `${pp}.results[${j}]`, text: r, rich: true };
      }
      break;
    case 'skills':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      for (const [i, level] of block.levels.entries()) {
        if (level.description) yield { path: `${path}.levels[${i}].description`, text: level.description, rich: false };
        for (const [j, item] of level.items.entries()) yield { path: `${path}.levels[${i}].items[${j}]`, text: item, rich: true };
      }
      break;
    case 'genten-eval':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      yield { path: `${path}.intro`, text: block.intro, rich: true };
      for (const [i, c] of block.configs.entries()) yield { path: `${path}.configs[${i}].label`, text: c.label, rich: true };
      for (const [i, r] of block.rows.entries()) yield { path: `${path}.rows[${i}].label`, text: r.label, rich: false };
      yield { path: `${path}.takeaway`, text: block.takeaway, rich: true };
      yield { path: `${path}.gridCaption`, text: block.gridCaption, rich: false };
      break;
    case 'creeds':
      for (const [i, item] of block.items.entries()) yield { path: `${path}.items[${i}]`, text: item, rich: false };
      break;
    case 'contact':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      break;
    case 'citation':
      // Quoted figures belong to the source, not to the fact sheet (PM_REVIEW_03 §6).
      yield { path: `${path}.quote`, text: block.citation.quote, rich: false, citation: true };
      if (block.citation.context) yield { path: `${path}.context`, text: block.citation.context, rich: false, citation: true };
      yield { path: `${path}.sourceLabel`, text: block.citation.sourceLabel, rich: false };
      if (block.citation.basis) yield { path: `${path}.basis`, text: block.citation.basis, rich: false };
      break;
    case 'links':
      yield { path: `${path}.heading`, text: block.heading, rich: false };
      for (const [i, l] of block.links.entries()) yield { path: `${path}.links[${i}].label`, text: l.label, rich: false };
      break;
  }
}

/** Metric ids referenced by a block outside of {{tokens}} (genten-eval rows). */
export function blockMetricRefs(block: Block): string[] {
  if (block.kind !== 'genten-eval') return [];
  return block.rows.flatMap((r) => Object.values(r.metrics));
}

export function tokensIn(text: string): string[] {
  return [...text.matchAll(METRIC_TOKEN)].map((m) => m[1] as string);
}

/**
 * Numbers as written, normalised: "45,000" → 45000, "3.2" → 3.2, "1/6" → [1, 6], "35〜45%" → [35, 45].
 * Japanese 万 / English million are not used in metric displays yet; add normalisation when they are.
 */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number((m[0] as string).replaceAll(',', '')));
}

/** Amounts with their unit words resolved: 「600万円」→ 6000000, "¥18 million" → 18000000. */
export function amountsIn(text: string): number[] {
  return [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(万|億|million|billion|thousand)?/g)].map((m) => {
    const n = Number((m[1] as string).replaceAll(',', ''));
    const unit = { 万: 1e4, 億: 1e8, thousand: 1e3, million: 1e6, billion: 1e9 }[m[2] as string] ?? 1;
    return n * unit;
  });
}

function sortedNumbers(text: string): string {
  return numbersIn(text)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Digits that may appear in prose outside {{tokens}}: dates and periods (BRIEF §6 — plain text,
 * no confidence label), identifiers such as "SHA-256", "GA4", "Web3", and a short list of
 * non-metric terms. Anything left over is a number that should have been a Metric.
 */
const PROSE_ALLOWED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:19|20)\d{2}(?:\.\d{1,2})?/g, reason: 'year or year.month (date, BRIEF §6 ラベルなし)' },
  { pattern: /\d{1,2}月(?:\d{1,2}日)?(?:[〜~–-]\d{1,2}日)?/g, reason: 'Japanese month/day (date)' },
  {
    pattern: /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:[–-]\d{1,2})?/g,
    reason: 'English month/day (date)',
  },
  { pattern: /[〜–-]\s?\d{1,2}(?![\d%.])/g, reason: 'end of a date range, e.g. 2026.05〜09' },
  { pattern: /[A-Za-z]+-?\d+[A-Za-z\d.]*/g, reason: 'identifier containing digits (SHA-256, GA4, Web3, EC2)' },
  { pattern: /Contact Form 7/g, reason: 'product name' },
  { pattern: /\b301\b|301(?=転送)/g, reason: 'HTTP status code name (301 redirect), not a metric' },
  { pattern: /30秒|30-second/g, reason: 'name of the 「30秒で見る」 UI feature (BRIEF §4), not a claim' },
  { pattern: /月180h|180 hours a month/g, reason: 'availability term (月180h以内, BRIEF §6 / PM_REVIEW_03 §5), not a performance claim' },
];

export function strayDigits(text: string): string[] {
  let rest = text.replace(METRIC_TOKEN, ' ');
  for (const { pattern } of PROSE_ALLOWED) rest = rest.replace(pattern, ' ');
  return [...rest.matchAll(/\d+/g)].map((m) => m[0] as string);
}

/** Facts derived from the content structure itself; checked against the structure. */
export function derivedFactProblems(c: SiteContent): string[] {
  const problems: string[] = [];
  const projectLayers = ['current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent'].length;
  const deep = c.layers.find((l) => l.id === 'deep');
  const deepProjects = deep?.blocks.find((b) => b.kind === 'projects');
  const deepCount = deepProjects && deepProjects.kind === 'projects' ? deepProjects.projects.length : 0;
  const deepMetric = c.metrics.find((m) => m.id === 'deep-count');
  if (!deepMetric || !numbersIn(deepMetric.display).includes(deepCount)) {
    problems.push(`[${c.locale}] deep-count must equal the ${deepCount} projects listed in the deep layer`);
  }
  const projectCount = c.metrics.find((m) => m.id === 'project-count');
  if (!projectCount || !numbersIn(projectCount.display).includes(projectLayers + deepCount)) {
    problems.push(`[${c.locale}] project-count must equal ${projectLayers} project layers + ${deepCount} deep projects`);
  }
  return problems;
}

/** Numbers that are not literally in the fact sheet but are verified by derivedFactProblems. */
export const DERIVED_NUMBERS: Record<string, string> = {
  '14': 'project-count = 6 project layers + 8 deep projects (verified against the content structure)',
  '2': 'countries = Finland and Japan',
};

/** Structural checks for one locale. */
export function structureProblems(c: SiteContent): string[] {
  const problems: string[] = [];
  const order = c.layers.map((l) => l.id).join(',');
  if (order !== LAYER_IDS.join(',')) problems.push(`[${c.locale}] layer order must be ${LAYER_IDS.join(',')}, got ${order}`);

  const metricIds = new Set<string>();
  for (const m of c.metrics) {
    if (metricIds.has(m.id)) problems.push(`[${c.locale}] duplicate metric id: ${m.id}`);
    metricIds.add(m.id);
  }

  const used = new Set<string>();
  for (const layer of c.layers) {
    for (const s of layerStrings(layer)) {
      const tokens = tokensIn(s.text);
      if (tokens.length > 0 && !s.rich) problems.push(`[${c.locale}] ${s.path}: {{tokens}} are not allowed here`);
      for (const t of tokens) {
        used.add(t);
        if (!metricIds.has(t)) problems.push(`[${c.locale}] ${s.path}: unknown metric {{${t}}}`);
      }
      const stray = s.citation ? [] : strayDigits(s.text);
      if (stray.length > 0) {
        problems.push(`[${c.locale}] ${s.path}: number(s) ${stray.join(', ')} outside a Metric — use {{metric-id}} ("${s.text}")`);
      }
    }
    for (const block of layer.blocks) {
      for (const id of blockMetricRefs(block)) {
        used.add(id);
        if (!metricIds.has(id)) problems.push(`[${c.locale}] layers.${layer.id}: unknown metric ${id}`);
      }
    }
  }
  for (const id of metricIds) if (!used.has(id)) problems.push(`[${c.locale}] metric ${id} is defined but never shown`);
  problems.push(...derivedFactProblems(c));
  return problems;
}

/** ja and en must describe the same facts. */
export function parityProblems(ja: SiteContent, en: SiteContent): string[] {
  const problems: string[] = [];
  const jaMetrics = new Map(ja.metrics.map((m) => [m.id, m]));
  const enMetrics = new Map(en.metrics.map((m) => [m.id, m]));
  for (const id of new Set([...jaMetrics.keys(), ...enMetrics.keys()])) {
    const a = jaMetrics.get(id);
    const b = enMetrics.get(id);
    if (!a || !b) {
      problems.push(`metric ${id} exists only in ${a ? 'ja' : 'en'}`);
      continue;
    }
    if (a.confidence !== b.confidence) problems.push(`metric ${id}: confidence ja=${a.confidence} en=${b.confidence}`);
    if (a.evidence.source !== b.evidence.source) problems.push(`metric ${id}: source ja=${a.evidence.source} en=${b.evidence.source}`);
    if ((a.evidence.method === null) !== (b.evidence.method === null)) problems.push(`metric ${id}: method present in only one locale`);
    if (a.evidence.chart !== b.evidence.chart) problems.push(`metric ${id}: chart ja=${a.evidence.chart} en=${b.evidence.chart}`);
    if (sortedNumbers(a.display) !== sortedNumbers(b.display)) {
      problems.push(`metric ${id}: numbers differ — ja "${a.display}" vs en "${b.display}"`);
    }
  }
  for (const [i, l] of ja.layers.entries()) {
    const e = en.layers[i];
    if (!e || e.id !== l.id) continue;
    const kinds = (x: Layer) => x.blocks.map((b) => b.kind).join(',');
    if (kinds(l) !== kinds(e)) problems.push(`layers.${l.id}: block structure differs between ja and en`);
    const tokens = (x: Layer) => [...layerStrings(x)].flatMap((s) => tokensIn(s.text)).sort().join(',');
    if (tokens(l) !== tokens(e)) problems.push(`layers.${l.id}: metric references differ between ja and en`);
    const quoted = (x: Layer) => [...layerStrings(x)].filter((s) => s.citation).flatMap((s) => amountsIn(s.text)).sort((a, b) => a - b).join(',');
    if (quoted(l) !== quoted(e)) problems.push(`layers.${l.id}: quoted amounts differ between ja (${quoted(l)}) and en (${quoted(e)})`);
  }
  return problems;
}

/** Content metrics for the Genten evaluation must match docs/facts/genten-eval.json. */
export function gentenProblems(c: SiteContent): string[] {
  const problems: string[] = [];
  const total = gentenEval.questions;
  const byConfig = (config: string) => gentenEval.results.filter((r) => r.config === config);
  for (const s of gentenEval.summary) {
    const correct = byConfig(s.config).filter((r) => r.correct).length;
    if (byConfig(s.config).length !== total) problems.push(`genten-eval.json: ${s.config} has ${byConfig(s.config).length} results, expected ${total}`);
    if (correct !== s.correct) problems.push(`genten-eval.json: ${s.config} summary.correct=${s.correct} but results count ${correct}`);
  }
  const key = { 'closed-book': 'closed', 'keyword-search': 'keyword', genten: 'genten' } as const;
  for (const s of gentenEval.summary) {
    const suffix = key[s.config];
    const expect: Array<[string, number]> = [
      [`genten-acc-${suffix}`, Math.round((s.correct / total) * 100)],
      [`genten-cite-${suffix}`, Math.round((s.correct_with_official_citation / total) * 100)],
    ];
    const seconds = s.avg_seconds ?? s.avg_seconds_approx;
    if (seconds !== undefined) expect.push([`genten-time-${suffix}`, seconds]);
    for (const [id, value] of expect) {
      const m = c.metrics.find((x) => x.id === id);
      if (!m) problems.push(`[${c.locale}] missing metric ${id}`);
      else if (!numbersIn(m.display).includes(value)) problems.push(`[${c.locale}] ${id} shows "${m.display}" but genten-eval.json gives ${value}`);
    }
    const time = c.metrics.find((x) => x.id === `genten-time-${suffix}`);
    if (time && s.avg_seconds_approx !== undefined && time.confidence !== 'approx') {
      problems.push(`[${c.locale}] genten-time-${suffix} is approximate in genten-eval.json and must be labelled approx`);
    }
  }
  const q = c.metrics.find((x) => x.id === 'genten-questions');
  if (!q || !numbersIn(q.display).includes(total)) problems.push(`[${c.locale}] genten-questions must show ${total}`);
  return problems;
}

/** Parse + all checks that need no file system. Throws ContentError. */
export function validateContent(jaInput: SiteContentInput, enInput: SiteContentInput): { ja: SiteContent; en: SiteContent } {
  const problems: string[] = [];
  const ja = SiteContentSchema.safeParse(jaInput);
  const en = SiteContentSchema.safeParse(enInput);
  if (!ja.success) problems.push(`[ja] schema: ${ja.error.message}`);
  if (!en.success) problems.push(`[en] schema: ${en.error.message}`);
  if (!ja.success || !en.success) throw new ContentError(problems);
  problems.push(...structureProblems(ja.data), ...structureProblems(en.data));
  problems.push(...parityProblems(ja.data, en.data));
  problems.push(...gentenProblems(ja.data), ...gentenProblems(en.data));
  if (problems.length > 0) throw new ContentError(problems);
  return { ja: ja.data, en: en.data };
}
