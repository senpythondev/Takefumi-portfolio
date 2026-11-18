import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// *.lab.tsx pages (graphics spikes such as /lab/city) exist only in `next dev` and in Vercel preview
// builds; production builds — Vercel production and every local/CI `npm run build` — ignore them.
const withLab = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';

// Until launch (Phase 7) every response tells search engines to stay away. Read at build time:
// setting SITE_LAUNCHED=true takes effect with the next deployment (docs/VERCEL_SETUP.md).
const launched = process.env.SITE_LAUNCHED === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Agent instructions live in CLAUDE.md; stop `next dev` from writing a second file (AGENTS.md).
  agentRules: false,
  pageExtensions: withLab ? ['lab.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
  async headers() {
    if (launched) return [];
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default withNextIntl(nextConfig);
