/**
 * A/B Lighthouse on one machine (PM_REVIEW_07 §2: "record the CI value at each step").
 *
 * Single CI runs could not attribute an effect: /en's TBT median moved 74 → 119 → 169 ms over CI
 * runs 6–8 with no relevant change, so runners differ more than the changes being measured. This
 * builds nothing itself; it serves two already-built checkouts side by side and runs Lighthouse
 * (default mobile config, the same as Lighthouse CI) alternately A/B, B/A, … so both see the same
 * machine and the same moment.
 *
 *   node scripts/ab-lighthouse.ts <dir A> <dir B> [runs=5]
 *
 * Writes ab-results/*.json and a Markdown summary (also to $GITHUB_STEP_SUMMARY when set).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dirA, dirB, runsArg] = process.argv.slice(2);
if (!dirA || !dirB) throw new Error('usage: node scripts/ab-lighthouse.ts <dir A> <dir B> [runs]');
const RUNS = Number(runsArg ?? 5);
const OUT = resolve('ab-results');
const LIGHTHOUSE = resolve('node_modules/.bin/lighthouse');
const SIDES = { A: { dir: resolve(dirA), port: 3301 }, B: { dir: resolve(dirB), port: 3302 } } as const;
const PATHS = ['/ja', '/en'] as const;

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`))));
  });
}

async function serve(dir: string, port: number): Promise<ChildProcess> {
  const server = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/ja`)).ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server in ${dir} did not start`);
}

type Row = { tbt: number; layout: number; script: number; lcp: number; cls: number };

function read(file: string): Row {
  const lhr = JSON.parse(readFileSync(file, 'utf8'));
  const a = lhr.audits;
  const groups = Object.fromEntries((a['mainthread-work-breakdown'].details.items as { group: string; duration: number }[]).map((i) => [i.group, i.duration]));
  return {
    tbt: a['total-blocking-time'].numericValue,
    layout: groups.styleLayout ?? 0,
    script: groups.scriptEvaluation ?? 0,
    lcp: a['largest-contentful-paint'].numericValue,
    cls: a['cumulative-layout-shift'].numericValue,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

mkdirSync(OUT, { recursive: true });
const servers = [await serve(SIDES.A.dir, SIDES.A.port), await serve(SIDES.B.dir, SIDES.B.port)];
const results: Record<string, Row[]> = {};
try {
  for (let i = 0; i < RUNS; i++) {
    for (const path of PATHS) {
      // Alternate the order every round so neither side always runs first.
      for (const side of i % 2 === 0 ? (['A', 'B'] as const) : (['B', 'A'] as const)) {
        const file = join(OUT, `${side}-${path.slice(1)}-${i}.json`);
        await run(LIGHTHOUSE, [`http://localhost:${SIDES[side].port}${path}`, '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new --no-sandbox', '--quiet']);
        (results[`${side} ${path}`] ??= []).push(read(file));
      }
    }
  }
} finally {
  for (const s of servers) s.kill();
}

const lines = [`### A/B Lighthouse (mobile, ${RUNS} runs each, alternating; medians)`, '', '| side | page | TBT ms (all runs) | TBT median | Style & Layout | Script eval | LCP | CLS max |', '|---|---|---|---|---|---|---|---|'];
for (const path of PATHS) {
  for (const side of ['A', 'B'] as const) {
    const rows = results[`${side} ${path}`] ?? [];
    const r = (k: keyof Row) => Math.round(median(rows.map((x) => x[k])));
    lines.push(`| ${side} | ${path} | ${rows.map((x) => Math.round(x.tbt)).join(', ')} | **${r('tbt')}** | ${r('layout')} | ${r('script')} | ${r('lcp')} | ${Math.max(...rows.map((x) => x.cls)).toFixed(3)} |`);
  }
}
const summary = lines.join('\n');
console.log(summary);
writeFileSync(join(OUT, 'summary.md'), summary + '\n');
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
