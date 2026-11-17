/**
 * npm run validate — runs before every build (prebuild) and in CI.
 *
 * 1. Schema, references, ja/en parity, Genten data consistency (src/content/validate.ts)
 * 2. Fact-lint: every number in metrics and evidence must appear in BRIEF §6 (fact sheet)
 *    or docs/facts/*.json, or be a derived number verified against the content structure.
 * 3. TODO(fact): reported as a warning; fails only in release builds
 *    (GT_RELEASE=1, i.e. `npm run build:release`, or VERCEL_ENV=production). PM_REVIEW_02 §4.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { contentEn } from '../src/content/layers.en.ts';
import { contentJa } from '../src/content/layers.ja.ts';
import { ContentError, DERIVED_NUMBERS, numbersIn, validateContent } from '../src/content/validate.ts';
import type { SiteContent } from '../src/content/schema.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const isRelease = process.env.GT_RELEASE === '1' || process.env.VERCEL_ENV === 'production';

function factSheetNumbers(): Set<string> {
  const brief = readFileSync(join(ROOT, 'docs/BRIEF.md'), 'utf8');
  const start = brief.indexOf('## 6. ファクトシート');
  const end = brief.indexOf('## 7.', start);
  if (start < 0 || end < 0) throw new Error('docs/BRIEF.md: fact sheet section (## 6 … ## 7) not found');
  const numbers = new Set(numbersIn(brief.slice(start, end)).map(String));

  const factsDir = join(ROOT, 'docs/facts');
  for (const file of readdirSync(factsDir).filter((f) => f.endsWith('.json'))) {
    const walk = (v: unknown, key = ''): void => {
      if (key === 'question') return; // question indices are not facts to display
      if (typeof v === 'number') numbers.add(String(v));
      else if (typeof v === 'string') for (const n of numbersIn(v)) numbers.add(String(n));
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(JSON.parse(readFileSync(join(factsDir, file), 'utf8')));
  }
  for (const n of Object.keys(DERIVED_NUMBERS)) numbers.add(n);
  return numbers;
}

function factLint(c: SiteContent, facts: Set<string>): string[] {
  const problems: string[] = [];
  for (const m of c.metrics) {
    const texts: Array<[string, string]> = [
      ['display', m.display],
      ['label', m.label],
      ['evidence.statement', m.evidence.statement],
    ];
    if (m.evidence.note) texts.push(['evidence.note', m.evidence.note]);
    if (m.evidence.method) texts.push(['evidence.method', m.evidence.method]);
    for (const [field, text] of texts) {
      for (const n of numbersIn(text)) {
        if (!facts.has(String(n))) problems.push(`[${c.locale}] metric ${m.id}.${field}: ${n} is not in the fact sheet or docs/facts ("${text}")`);
      }
    }
  }
  return problems;
}

function todoFacts(): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  const dirs = ['src/content', 'messages'];
  for (const dir of dirs) {
    for (const file of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${file}`;
      readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (text.includes('TODO(fact)') && !text.includes("'TODO(fact)'")) hits.push({ file: rel, line: i + 1, text: text.trim() });
        });
    }
  }
  return hits;
}

/** docs/facts/genten-eval.csv (owner's raw export) must agree with the canonical JSON. */
function gentenCsvProblems(): string[] {
  const csvPath = join(ROOT, 'docs/facts/genten-eval.csv');
  let csv: string;
  try {
    csv = readFileSync(csvPath, 'utf8');
  } catch {
    return [];
  }
  const json = JSON.parse(readFileSync(join(ROOT, 'docs/facts/genten-eval.json'), 'utf8')) as {
    results: Array<{ question: number; config: string; correct: boolean }>;
  };
  const key = (q: number | string, c: string) => `${q}/${c}`;
  const fromJson = new Map(json.results.map((r) => [key(r.question, r.config), r.correct]));
  const rows = csv.trim().split('\n').slice(1);
  const problems: string[] = [];
  if (rows.length !== json.results.length) problems.push(`genten-eval.csv has ${rows.length} rows, JSON has ${json.results.length}`);
  for (const row of rows) {
    const [q, config, correct] = row.split(',').map((s) => s.trim());
    if (!q || !config || fromJson.get(key(q, config)) !== (correct === 'true')) problems.push(`genten-eval.csv row "${row}" disagrees with genten-eval.json`);
  }
  return problems;
}

let problems: string[] = gentenCsvProblems();
try {
  const { ja, en } = validateContent(contentJa, contentEn);
  const facts = factSheetNumbers();
  problems = [...problems, ...factLint(ja, facts), ...factLint(en, facts)];
  console.log(`content: ${ja.layers.length} layers, ${ja.metrics.length} metrics per locale`);
} catch (e) {
  if (e instanceof ContentError) problems = [...problems, ...e.problems];
  else throw e;
}

const todos = todoFacts();
if (todos.length > 0) {
  const header = `TODO(fact): ${todos.length} open item(s)${isRelease ? ' — release builds must have none' : ''}`;
  console.log(header);
  for (const t of todos) console.log(`  ${t.file}:${t.line}  ${t.text}`);
  if (isRelease) problems.push(header);
}

if (problems.length > 0) {
  console.error(`\n✖ content validation failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('✔ content validation passed');
