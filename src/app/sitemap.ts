import type { MetadataRoute } from 'next';
import { getContent } from '@/content';
import { WORK_IDS } from '@/content/acts';
import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/site';

/**
 * Every public page, in both languages, each with its alternate. Generated from the content, so a
 * new case study or metric appears here without anyone remembering to add it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const abs = (path: string) => new URL(path, base).toString();
  const paths = ['', ...WORK_IDS.map((id) => `/work/${id}`), ...getContent(routing.defaultLocale).metrics.map((m) => `/evidence/${m.id}`)];
  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: abs(`/${locale}${path}`),
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : path.startsWith('/work') ? 0.8 : 0.5,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, abs(`/${l}${path}`)])) },
    })),
  );
}
