import { base } from '@/styles/tokens';
import type { ReactNode } from 'react';

/** Development-only lab pages (see next.config.ts pageExtensions). Not part of the site. */
export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: base.ground, color: base.ink, fontFamily: 'ui-monospace, monospace' }}>{children}</body>
    </html>
  );
}
