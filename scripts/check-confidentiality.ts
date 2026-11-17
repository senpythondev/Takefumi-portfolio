/**
 * Deterministic confidentiality check (PM_REVIEW_01 D9, scope per PM_REVIEW_04 §2).
 * One of three safeguards:
 *   1. content may only come from docs/BRIEF.md and docs/facts/ (enforced by scripts/validate-content.ts)
 *   2. this pattern scanner
 *   3. the confidentiality-guard sub-agent before each commit, for context a pattern cannot judge
 *
 *   node scripts/check-confidentiality.ts            scan every tracked + untracked (not ignored) file
 *   node scripts/check-confidentiality.ts --staged   scan the staged versions only (pre-commit hook)
 *
 * Detects: IPv4 addresses, AWS account IDs / ARNs / resource IDs / access keys / hostnames,
 * private keys, URLs not in src/content/links.ts, e-mail addresses other than the public one,
 * and image metadata (EXIF/XMP/IPTC/PNG text chunks).
 *
 * False positives go in scripts/confidentiality-exceptions.json, each with a reason.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { ALLOWED_URLS, EMAIL_PARTS } from '../src/content/links.ts';

type Finding = { check: string; file: string; line: number; detail: string };
type Exception = { check: string; file?: string; match?: string; reason: string };

const ROOT = new URL('..', import.meta.url).pathname;
const STAGED = process.argv.includes('--staged');
const PUBLIC_EMAIL = `${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}`.toLowerCase();

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.tif', '.tiff']);
const BINARY_EXT = new Set([...IMAGE_EXT, '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mov', '.pdf', '.zip', '.glb', '.ktx2']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'test-results', 'playwright-report', '.lighthouseci', 'coverage']);

// ── Text patterns ─────────────────────────────────────────────
const TEXT_CHECKS: Array<{ check: string; pattern: RegExp; describe: (m: string) => string }> = [
  {
    check: 'ipv4',
    pattern: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g,
    describe: (m) => `IPv4 address ${m}`,
  },
  { check: 'aws-account-id', pattern: /(?<![\w-])\d{12}(?![\w-])/g, describe: () => '12-digit number (possible AWS account ID)' },
  { check: 'aws-arn', pattern: /\barn:aws[a-z-]*:[a-z0-9-]*:/gi, describe: () => 'AWS ARN' },
  {
    check: 'aws-resource-id',
    pattern: /\b(?:i|ami|sg|vpc|subnet|vol|eni|snap|igw|rtb|nat|eipalloc)-[0-9a-f]{8}(?:[0-9a-f]{9})?\b/g,
    describe: (m) => `AWS resource ID ${m}`,
  },
  { check: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, describe: () => 'AWS access key ID' },
  { check: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, describe: () => 'private key' },
  { check: 'aws-hostname', pattern: /[a-z0-9.-]*\.amazonaws\.com/gi, describe: (m) => `AWS hostname ${m}` },
];

const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function urlAllowed(url: string): boolean {
  return ALLOWED_URLS.some((allowed) => url === allowed || url === allowed.replace(/\/$/, '') || url.startsWith(allowed.endsWith('/') ? allowed : `${allowed}/`));
}

// ── Inputs ─────────────────────────────────────────────
function git(argv: string[]): string | null {
  try {
    return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full));
  }
}

function filesToScan(): Array<{ file: string; read: () => Buffer }> {
  if (STAGED) {
    const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
    if (names === null) throw new Error('--staged requires git');
    return names
      .split('\0')
      .filter(Boolean)
      .map((file) => ({ file, read: () => execFileSync('git', ['show', `:${file}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }) }));
  }
  const listed = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const files: string[] = [];
  if (listed !== null) files.push(...listed.split('\0').filter((f) => f && existsSync(join(ROOT, f))));
  else walk(ROOT, files); // e.g. a build environment without .git
  return files.map((file) => ({ file, read: () => readFileSync(join(ROOT, file)) }));
}

function loadExceptions(): Exception[] {
  const list = JSON.parse(readFileSync(join(ROOT, 'scripts/confidentiality-exceptions.json'), 'utf8')) as Exception[];
  for (const e of list) if (!e.reason?.trim()) throw new Error(`confidentiality-exceptions.json: every entry needs a reason (${JSON.stringify(e)})`);
  return list;
}

// ── Image metadata ─────────────────────────────────────────────
function imageMetadata(buf: Buffer, ext: string): string | null {
  if (ext === '.jpg' || ext === '.jpeg') {
    let i = 2;
    while (i + 4 < buf.length && buf[i] === 0xff) {
      const marker = buf[i + 1] as number;
      if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
      const len = buf.readUInt16BE(i + 2);
      const payload = buf.subarray(i + 4, i + 2 + len);
      if (marker === 0xe1 && payload.subarray(0, 4).toString('latin1') === 'Exif') return 'JPEG EXIF (APP1)';
      if (marker === 0xe1 && payload.toString('latin1').startsWith('http://ns.adobe.com/xap')) return 'JPEG XMP (APP1)';
      if (marker === 0xed) return 'JPEG IPTC/Photoshop (APP13)';
      i += 2 + len;
    }
    return null;
  }
  if (ext === '.png') {
    let i = 8;
    while (i + 8 <= buf.length) {
      const len = buf.readUInt32BE(i);
      const type = buf.subarray(i + 4, i + 8).toString('latin1');
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) return `PNG ${type} chunk`;
      if (type === 'IEND') break;
      i += 12 + len;
    }
    return null;
  }
  const text = buf.toString('latin1');
  if (ext === '.webp' && (text.includes('EXIF') || text.includes('XMP '))) return 'WebP EXIF/XMP chunk';
  if (text.includes('Exif\0\0')) return 'EXIF block';
  if (text.includes('<x:xmpmeta')) return 'XMP packet';
  return null;
}

// ── Run ─────────────────────────────────────────────
const exceptions = loadExceptions();
const excepted = (f: Finding, matched: string) =>
  exceptions.some((e) => e.check === f.check && (!e.file || f.file === e.file || f.file.startsWith(`${e.file}/`)) && (!e.match || matched.startsWith(e.match)));

const findings: Finding[] = [];
const files = filesToScan();
for (const { file, read } of files) {
  const ext = extname(file).toLowerCase();
  const buf = read();

  if (IMAGE_EXT.has(ext)) {
    const meta = imageMetadata(buf, ext);
    if (meta) findings.push({ check: 'image-metadata', file, line: 0, detail: `${meta} — strip metadata before committing` });
    continue;
  }
  if (BINARY_EXT.has(ext) || buf.includes(0)) continue;

  buf
    .toString('utf8')
    .split('\n')
    .forEach((text, idx) => {
      const line = idx + 1;
      const push = (check: string, matched: string, detail: string) => {
        const f = { check, file, line, detail };
        if (!excepted(f, matched)) findings.push(f);
      };
      for (const c of TEXT_CHECKS) for (const m of text.matchAll(c.pattern)) push(c.check, m[0], c.describe(m[0]));
      if (file !== 'src/content/links.ts') {
        for (const m of text.matchAll(URL_PATTERN)) {
          const url = m[0].replace(/[.,;:!?)]+$/, '');
          if (!urlAllowed(url)) push('url', url, `URL not in the allowlist (src/content/links.ts): ${url}`);
        }
      }
      for (const m of text.matchAll(EMAIL_PATTERN)) {
        if (m[0].toLowerCase() !== PUBLIC_EMAIL) push('email', m[0], 'e-mail address other than the public one');
      }
    });
}

const mode = STAGED ? 'staged files' : 'repository files';
if (findings.length > 0) {
  console.error(`✖ confidentiality check failed: ${findings.length} finding(s) in ${files.length} ${mode}`);
  for (const f of findings) console.error(`  [${f.check}] ${f.file}${f.line ? `:${f.line}` : ''} — ${f.detail}`);
  console.error('\n  Fix the content. If it is a genuine false positive, add an entry with a reason to scripts/confidentiality-exceptions.json.');
  process.exit(1);
}
console.log(`✔ confidentiality check passed: ${files.length} ${mode}`);
