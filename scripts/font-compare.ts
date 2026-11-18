/**
 * Font candidates side by side (PM_REVIEW_08 §4): for each set, activate → build → screenshots of
 * the hero (ja/en × desktop/mobile) → local Lighthouse (mobile, N runs each). Restores the set that
 * was active. Local numbers are indicative only; the CI A/B workflow is the measurement of record.
 *
 *   node scripts/font-compare.ts [runs=5] [sets=a,b,c]
 *
 * Output: docs/screenshots/phase-4/fonts/ (not committed) — images and summary.md.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

const RUNS = Number(process.argv[2] ?? 5);
const SETS = (process.argv[3] ?? 'a,b,c').split(',');
const OUT = 'docs/screenshots/phase-4/fonts';
const PORT = 3250;
mkdirSync(OUT, { recursive: true });

type Manifest = { active: string; sets: Record<string, { label: string; faces: { file: string; bytes: number; role: string }[] }> };
const manifest = () => JSON.parse(readFileSync('src/fonts/manifest.json', 'utf8')) as Manifest;
const original = manifest().active;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

async function serve() {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/ja`)).ok) return server;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server did not start');
}

const lines: string[] = ['# フォント案の比較（ローカル。正式な値は CI の A/B）', ''];
try {
  for (const id of SETS) {
    execFileSync('node', ['scripts/build-fonts.ts', '--activate', id], { stdio: 'ignore' });
    execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
    const server = await serve();
    try {
      const browser = await chromium.launch();
      for (const locale of ['ja', 'en'] as const) {
        for (const [name, options] of [
          ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
          ['mobile', { ...devices['Pixel 7'], deviceScaleFactor: 2 }],
        ] as const) {
          const context = await browser.newContext({ ...options, locale, reducedMotion: 'reduce' });
          const page = await context.newPage();
          await page.goto(`http://localhost:${PORT}/${locale}`, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: join(OUT, `${id}-${locale}-${name}.jpg`), type: 'jpeg', quality: 85 });
          await context.close();
        }
      }
      await browser.close();

      const rows: Record<string, { tbt: number[]; lcp: number[]; cls: number[]; layout: number[] }> = {};
      for (let i = 0; i < RUNS; i++) {
        for (const path of ['/ja', '/en']) {
          const file = join(OUT, `lh-${id}${path.replace('/', '-')}-${i}.json`);
          execFileSync('node_modules/.bin/lighthouse', [`http://localhost:${PORT}${path}`, '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new --no-sandbox', '--quiet'], { stdio: 'ignore' });
          const lhr = JSON.parse(readFileSync(file, 'utf8'));
          const groups = Object.fromEntries((lhr.audits['mainthread-work-breakdown'].details.items as { group: string; duration: number }[]).map((x) => [x.group, x.duration]));
          const r = (rows[path] ??= { tbt: [], lcp: [], cls: [], layout: [] });
          r.tbt.push(lhr.audits['total-blocking-time'].numericValue);
          r.lcp.push(lhr.audits['largest-contentful-paint'].numericValue);
          r.cls.push(lhr.audits['cumulative-layout-shift'].numericValue);
          r.layout.push(groups.styleLayout ?? 0);
        }
      }
      const set = manifest().sets[id];
      const kb = (role: string) => (set?.faces ?? []).filter((f) => f.role === role).reduce((s, f) => s + f.bytes, 0) / 1024;
      lines.push(`## ${set?.label ?? id}`, '');
      lines.push(`- woff2：${(set?.faces ?? []).map((f) => `${f.file} ${(f.bytes / 1024).toFixed(1)}KB`).join('、')}`);
      lines.push(`- 合計：本文 ${kb('sans').toFixed(1)}KB、見出し ${kb('heading').toFixed(1)}KB、等幅 ${kb('mono').toFixed(1)}KB`);
      for (const [path, r] of Object.entries(rows)) {
        lines.push(`- ${path}：TBT 中央値 ${Math.round(median(r.tbt))}ms（${r.tbt.map(Math.round).join('・')}）、Style & Layout ${Math.round(median(r.layout))}ms、LCP ${Math.round(median(r.lcp))}ms、CLS 最大 ${Math.max(...r.cls).toFixed(3)}`);
      }
      lines.push(`- 画像：${['ja', 'en'].flatMap((l) => ['desktop', 'mobile'].map((d) => `${id}-${l}-${d}.jpg`)).join('、')}`, '');
    } finally {
      server.kill();
    }
  }
} finally {
  execFileSync('node', ['scripts/build-fonts.ts', '--activate', original], { stdio: 'ignore' });
}
writeFileSync(join(OUT, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
