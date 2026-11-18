import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Agent instructions live in CLAUDE.md; stop `next dev` from writing a second file (AGENTS.md).
  agentRules: false,
  // *.lab.tsx pages (graphics spikes such as /lab/city) exist only in `next dev`; production builds ignore them.
  pageExtensions: process.env.NODE_ENV === 'development' ? ['lab.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
};

export default withNextIntl(nextConfig);
