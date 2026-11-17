import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Agent instructions live in CLAUDE.md; stop `next dev` from writing a second file (AGENTS.md).
  agentRules: false,
};

export default withNextIntl(nextConfig);
