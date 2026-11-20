import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Until launch (SITE_LAUNCHED=true at build time, Phase 7) crawlers are asked to stay away, in
 * step with the X-Robots-Tag header (next.config.ts). After it: everything is public except the
 * evidence fragments, which are pieces of pages fetched into the dialog.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_LAUNCHED !== 'true') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/*/evidence/*/fragment'] }],
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
