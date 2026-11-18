/**
 * Copies detect-gpu's benchmark data to public/gpu-benchmarks/ so the GPU tier lookup never
 * calls a third-party CDN. Runs in prebuild; the output is generated (gitignored).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const from = join(ROOT, 'node_modules/detect-gpu/dist/benchmarks');
const to = join(ROOT, 'public/gpu-benchmarks');
if (!existsSync(from)) throw new Error(`detect-gpu benchmarks not found at ${from}`);
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log('✔ gpu benchmarks copied to public/gpu-benchmarks');
