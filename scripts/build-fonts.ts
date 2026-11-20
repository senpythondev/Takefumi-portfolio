/**
 * Self-hosted subset fonts (CLAUDE.md §4, PM_REVIEW_08 §4, PM_REVIEW_07 §2-3).
 *
 *   npm run fonts                         subset every candidate set, activate the current one
 *   npm run fonts -- --activate <set>     switch the active set (regenerates src/fonts/active.ts)
 *   npm run fonts -- --display optional   font-display for the active set (swap | optional)
 *   node scripts/build-fonts.ts --check   (part of `npm run validate`) fail when the site uses a
 *                                         character the active subsets do not contain
 *
 * Why: without a font that has the Japanese glyphs, the browser searches the OS for a fallback per
 * run of text; on CI that made /ja's layout 2.5× /en's (324 → 126 ms with such a font named).
 *
 * Sources are OFL fonts kept out of git in .cache/fonts/ (docs/FONTS.md says where to get them);
 * only the subsets, their licences and src/fonts/manifest.json are committed, so builds (CI, Vercel)
 * never need the sources or Python. Subsetting runs fontTools (scripts/fonts/subset.py) in a
 * virtualenv under .cache/, created on first use.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contentEn } from '../src/content/layers.en.ts';
import { contentJa } from '../src/content/layers.ja.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCES = join(ROOT, '.cache/fonts');
const VENV = join(ROOT, '.cache/fonts-venv');
const OUT = join(ROOT, 'src/fonts');
const MANIFEST = join(OUT, 'manifest.json');

type Role = 'sans' | 'heading' | 'mono';
type Face = { file: string; role: Role; weight: number; source: string; licence: string; rename?: { family: string; style: string; postscript: string } };
type FontSet = { label: string; faces: Face[] };

// IBM Plex is OFL with the Reserved Font Name "Plex": its subsets must be renamed (scripts/fonts/subset.py).
const plexSans = (weight: number, style: string, source: string): Face => ({
  file: `sans-${weight}`,
  role: 'sans',
  weight,
  source: `ibmplexsansjp/${source}`,
  licence: 'ibmplexsansjp',
  rename: { family: 'GroundTruth Sans JP', style, postscript: `GroundTruthSansJP-${style.replace(/ /g, '')}` },
});
const plexMono = (weight: number, style: string, source: string): Face => ({
  file: `mono-${weight}`,
  role: 'mono',
  weight,
  source: `ibmplexmono/${source}`,
  licence: 'ibmplexmono',
  rename: { family: 'GroundTruth Mono', style, postscript: `GroundTruthMono-${style.replace(/ /g, '')}` },
});

/** Set A is final (owner and PM, 2026-11-19); B–D were compared and dropped (docs/WORKLOG.md). Japanese weights: at most three (CLAUDE.md §4). */
export const SETS: Record<string, FontSet> = {
  a: {
    label: 'A 編集的：見出し Shippori Mincho B1／本文 IBM Plex Sans JP／数字 IBM Plex Mono',
    faces: [
      { file: 'heading-600', role: 'heading', weight: 600, source: 'shipporiminchob1/ShipporiMinchoB1-SemiBold.ttf', licence: 'shipporiminchob1' },
      plexSans(400, 'Regular', 'IBMPlexSansJP-Regular.ttf'),
      plexSans(600, 'SemiBold', 'IBMPlexSansJP-SemiBold.ttf'),
      plexMono(400, 'Regular', 'IBMPlexMono-Regular.ttf'),
      plexMono(600, 'SemiBold', 'IBMPlexMono-SemiBold.ttf'),
    ],
  },
};

// ── Characters ─────────────────────────────────────────────
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
/** Typography the copy may use beyond what is in the sources today (kept small on purpose). */
const EXTRA = '「」『』（）［］【】、。，．・：；？！ー～〜―—–…‥“”‘’→←↑↓≈✓↺×÷±％＋－＝／　';
const JAPANESE = /[　-ヿ㐀-鿿豈-﫿＀-￯]/u;

function filesUnder(dir: string, test: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, test));
    else if (test(full)) out.push(full);
  }
  return out;
}

const unique = (text: string) => [...new Set(text)].filter((c) => c !== '\n' && c !== '\r' && c !== '\t').sort().join('');

/** Everything the site can show: content, messages and the strings in components (raw source text). */
function bodyText(): string {
  const files = [
    join(ROOT, 'src/content/layers.ja.ts'),
    join(ROOT, 'src/content/layers.en.ts'),
    join(ROOT, 'messages/ja.json'),
    join(ROOT, 'messages/en.json'),
    // The owner's ?debug=scroll panel is set in the system's monospace face, never in the web fonts.
    ...filesUnder(join(ROOT, 'src/components'), (f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith('/debug/scroll-panel.ts')),
    ...filesUnder(join(ROOT, 'src/app'), (f) => /\.tsx?$/.test(f) && !f.includes('/lab/')),
  ];
  return unique(ASCII + EXTRA + files.map((f) => readFileSync(f, 'utf8')).join(''));
}

/** Text set in the heading face: titles, headings, metric labels (evidence titles), names, UI strings. */
function headingText(): string {
  const parts: string[] = [];
  const walk = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (['title', 'heading', 'label', 'name', 'nameLatin', 'role', 'coreHeadline'].includes(key)) parts.push(value);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(contentJa);
  walk(contentEn);
  for (const l of ['ja', 'en']) parts.push(readFileSync(join(ROOT, `messages/${l}.json`), 'utf8'));
  return unique(ASCII + parts.join(''));
}

/** Monospace is for numbers and data: Latin and symbols only. Japanese falls through to the sans face. */
function monoText(body: string): string {
  return unique([...body].filter((c) => !JAPANESE.test(c)).join(''));
}

function textFor(role: Role, texts: Record<Role, string>): string {
  return texts[role];
}

// ── Python (fontTools) ─────────────────────────────────────────────
function python(): string {
  const bin = join(VENV, 'bin/python');
  if (!existsSync(bin)) {
    console.log('creating .cache/fonts-venv (fontTools, once)…');
    execFileSync('python3', ['-m', 'venv', VENV], { stdio: 'inherit' });
    execFileSync(join(VENV, 'bin/pip'), ['install', '--quiet', '-r', join(ROOT, 'scripts/fonts/requirements.txt')], { stdio: 'inherit' });
  }
  return bin;
}

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

type ManifestFace = Omit<Face, 'source'> & { source: string; sourceSha256: string; bytes: number; glyphs: number; covered: string; missing: string };
type Manifest = { active: string; display: 'swap' | 'optional'; sets: Record<string, { label: string; faces: ManifestFace[] }> };

function readManifest(): Manifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : null;
}

function generate(setIds: string[], texts: Record<Role, string>, manifest: Manifest): void {
  const py = python();
  for (const id of setIds) {
    const set = SETS[id];
    if (!set) throw new Error(`unknown font set ${id}`);
    const dir = join(OUT, id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const jobs = set.faces.map((f) => {
      const source = join(SOURCES, f.source);
      if (!existsSync(source)) throw new Error(`missing font source ${relative(ROOT, source)} — see docs/FONTS.md`);
      return { source, output: join(dir, `${f.file}.woff2`), text: textFor(f.role, texts), rename: f.rename ?? null };
    });
    const run = spawnSync(py, [join(ROOT, 'scripts/fonts/subset.py')], { input: JSON.stringify(jobs), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(`subset.py failed:\n${run.stderr}`);
    const results = JSON.parse(run.stdout) as { output: string; bytes: number; glyphs: number; missing: string }[];
    manifest.sets[id] = {
      label: set.label,
      faces: set.faces.map((f, i) => {
        const r = results[i] as (typeof results)[number];
        const text = jobs[i]?.text ?? '';
        return {
          ...f,
          sourceSha256: sha256(join(SOURCES, f.source)),
          bytes: r.bytes,
          glyphs: r.glyphs,
          covered: [...text].filter((c) => !r.missing.includes(c)).join(''),
          missing: r.missing,
        };
      }),
    };
    const licences = join(OUT, 'LICENSES');
    mkdirSync(licences, { recursive: true });
    for (const f of set.faces) copyFileSync(join(SOURCES, f.licence, 'OFL.txt'), join(licences, `${f.licence}-OFL.txt`));
    console.log(`set ${id}: ${manifest.sets[id].faces.map((f) => `${f.file} ${(f.bytes / 1024).toFixed(1)} KB`).join(', ')}`);
  }
}

/** next/font/local needs literal options, so the active set is written out as a module. */
function writeActive(id: string, display: 'swap' | 'optional'): void {
  const set = SETS[id];
  if (!set) throw new Error(`unknown font set ${id}`);
  const byRole = (role: Role) => set.faces.filter((f) => f.role === role);
  const src = (faces: Face[]) =>
    faces
      .map((f) => (f.weight === 0 ? `{ path: './${id}/${f.file}.woff2', weight: '100 800', style: 'normal' }` : `{ path: './${id}/${f.file}.woff2', weight: '${f.weight}', style: 'normal' }`))
      .join(', ');
  const decl = (name: string, role: Role, preload: boolean, fallback: 'Arial' | 'Times New Roman') => {
    const faces = byRole(role);
    if (faces.length === 0) return `export const ${name} = null;`;
    return `export const ${name} = localFont({ src: [${src(faces)}], variable: '--font-face-${role}', display: '${display}', preload: ${preload}, adjustFontFallback: '${fallback}' });`;
  };
  const generated = `// Generated by scripts/build-fonts.ts — active font set "${id}" (${set.label}). Do not edit.
import localFont from 'next/font/local';

// next/font names each family after its constant: distinctive names, so no installed font can match.
// Every face is preloaded: with font-display: optional, a face that is not ready within ~100 ms is not
// used for that page view at all (the metric values above the fold showed in the fallback).
${decl('gtSans', 'sans', true, 'Arial')}
${decl('gtHeading', 'heading', true, 'Times New Roman')}
${decl('gtMono', 'mono', true, 'Arial')}

/** CSS variables for <html>: --font-face-sans / -heading / -mono (used by the stacks in tokens.ts). */
export const fontVariables = [gtSans, gtHeading, gtMono].flatMap((f) => (f ? [f.variable] : [])).join(' ');
`;
  writeFileSync(join(OUT, 'active.ts'), generated);
}

function check(texts: Record<Role, string>): void {
  const manifest = readManifest();
  if (!manifest) throw new Error('src/fonts/manifest.json missing — run `npm run fonts`');
  const set = manifest.sets[manifest.active];
  if (!set) throw new Error(`active font set ${manifest.active} not in the manifest`);
  const problems: string[] = [];
  for (const f of set.faces) {
    const have = new Set([...f.covered, ...f.missing]);
    const lacking = [...textFor(f.role, texts)].filter((c) => !have.has(c));
    if (lacking.length > 0) problems.push(`${manifest.active}/${f.file}: ${lacking.length} new character(s) not in the subset: ${lacking.slice(0, 40).join('')}`);
  }
  if (problems.length > 0) {
    console.error(`✖ fonts: the site uses characters the subset fonts lack — run \`npm run fonts\`\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`✔ fonts: active set ${manifest.active} covers every character the site uses`);
}

const args = process.argv.slice(2);
const body = bodyText();
const texts: Record<Role, string> = { sans: body, heading: headingText(), mono: monoText(body) };

if (args.includes('--check')) {
  check(texts);
} else {
  const manifest: Manifest = { display: 'swap', ...(readManifest() ?? { active: 'a', sets: {} }) };
  const display = args[args.indexOf('--display') + 1];
  if (args.includes('--display') && (display === 'swap' || display === 'optional')) manifest.display = display;
  const activate = args[args.indexOf('--activate') + 1];
  if (args.includes('--activate') && activate) {
    if (!manifest.sets[activate]) generate([activate], texts, manifest);
    manifest.active = activate;
  } else if (args.includes('--display')) {
    // Only font-display changes: rewrite active.ts, keep the subsets (no sources needed).
  } else {
    const only = args.includes('--set') ? [args[args.indexOf('--set') + 1] as string] : Object.keys(SETS);
    generate(only, texts, manifest);
  }
  writeActive(manifest.active, manifest.display);
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✔ fonts: active set ${manifest.active}`);
}
