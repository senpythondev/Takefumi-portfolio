import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// *.lab.tsx pages (graphics spikes such as /lab/city) exist only in `next dev` and in Vercel preview
// builds; production builds — Vercel production and every local/CI `npm run build` — ignore them.
const withLab = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';

// Until launch (Phase 7) every response tells search engines to stay away. Read at build time:
// setting SITE_LAUNCHED=true takes effect with the next deployment (docs/VERCEL_SETUP.md).
const launched = process.env.SITE_LAUNCHED === 'true';

/**
 * Security headers for every response (Phase 6 decision, final round 2026-11-20).
 *
 * Content-Security-Policy — the strictest that works with statically generated pages:
 * - Every page is static HTML served from the CDN. Next.js writes its data into the page as inline
 *   <script> blocks that differ on every page, and a static page cannot carry a per-request nonce.
 *   So `script-src` has to allow inline scripts ('unsafe-inline'). Hashes would have to be listed
 *   for every inline block of every page in one header, and would break on each content change.
 * - What makes that acceptable: the site renders no user input (the one text field, the
 *   watermark name, is drawn on a canvas and never becomes HTML), has no third-party scripts, and
 *   everything else is locked down — scripts, styles, fonts, images and connections only from this
 *   origin; no eval; no plugins; no framing; forms and <base> only to this origin.
 * - `style-src` allows inline styles: the layout passes values to CSS as style attributes
 *   (act lengths, colours, positions written by the director every frame).
 * - `img-src` adds data: and blob: (generated textures, the watermark PDF's page image);
 *   `worker-src` adds blob: (pdf-lib and three.js helpers).
 * - Vercel's preview toolbar is not allowed for: it is not part of the site.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Agent instructions live in CLAUDE.md; stop `next dev` from writing a second file (AGENTS.md).
  agentRules: false,
  pageExtensions: withLab ? ['lab.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
  // One designed 404 for every unmatched URL (src/app/global-not-found.tsx): there is no root layout.
  experimental: { globalNotFound: true },
  async headers() {
    // `next dev` needs eval for its tooling: the policy is for built pages.
    const headers = process.env.NODE_ENV === 'development' ? securityHeaders.filter((h) => h.key !== 'Content-Security-Policy') : securityHeaders;
    return [{ source: '/:path*', headers: launched ? headers : [...headers, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default withNextIntl(nextConfig);
