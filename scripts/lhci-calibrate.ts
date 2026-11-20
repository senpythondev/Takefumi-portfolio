/**
 * Calibrates Lighthouse's CPU slowdown to this machine (PM decision 2026-11-19, approved): CI
 * runners differ in speed (benchmarkIndex about 2,000–3,600 seen), and a fixed 4× made the same
 * page pass on a fast runner and fail on a slow one. The slowdown is scaled so every runner
 * emulates the same device:
 *
 *   cpuSlowdownMultiplier = clamp(4 × benchmarkIndex / 2900, 2, 10)
 *
 * 2900 is the benchmarkIndex of a typical runner (PM decision 2026-11-20): a typical runner gets the
 * 4× the budgets of CLAUDE.md §4 were designed for; a faster one is slowed more, a slower one less.
 * (The first reference, 1750, gave runners 4.9–6.6×: stricter than the budgets were set at.)
 * Writes .lighthouseci/cpu.json, read by lighthouserc.cjs; `npm run lhci` runs this first.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const REFERENCE = 2900;
const PORT = 3301;
const URL = `http://localhost:${PORT}/ja/evidence/genten-acc-genten`;

// Its own process group, so the whole server (npx → next → the server process) can be stopped:
// a surviving grandchild kept the pipe open and this script never exited (CI run 44561483841).
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const stop = () => {
  try {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
};
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 60_000);
  server.stdout.on('data', (d: Buffer) => {
    if (d.toString().includes('Ready')) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const samples: number[] = [];
try {
  for (let i = 0; i < 3; i += 1) {
    const out = execFileSync(
      'npx',
      ['lighthouse', URL, '--only-audits=first-contentful-paint', '--output=json', '--quiet', '--chrome-flags=--headless=new --no-sandbox'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    const index = (JSON.parse(out) as { environment?: { benchmarkIndex?: number } }).environment?.benchmarkIndex;
    if (index) samples.push(index);
  }
} finally {
  stop();
  server.stdout.destroy();
  server.stderr.destroy();
}

if (samples.length === 0) throw new Error('no benchmarkIndex measured');
const sorted = [...samples].sort((a, b) => a - b);
const benchmarkIndex = sorted[Math.floor(sorted.length / 2)] as number;
const multiplier = Math.round(Math.min(10, Math.max(2, (4 * benchmarkIndex) / REFERENCE)) * 10) / 10;
mkdirSync('.lighthouseci', { recursive: true });
writeFileSync('.lighthouseci/cpu.json', JSON.stringify({ benchmarkIndex, samples, multiplier, reference: REFERENCE, measuredAt: new Date().toISOString() }, null, 2));
console.log(`benchmarkIndex ${benchmarkIndex} (samples ${samples.join(', ')}) → cpuSlowdownMultiplier ${multiplier}`);
process.exit(0);
