import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'next-env.d.ts',
      'test-results/**',
      'playwright-report/**',
      '.lighthouseci/**',
    ],
  },
  {
    rules: {
      // Numbers must flow through <Metric>; URLs only through src/content/links.ts.
      // Both are enforced by scripts/validate-content.ts and scripts/check-confidentiality.ts.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.*'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
