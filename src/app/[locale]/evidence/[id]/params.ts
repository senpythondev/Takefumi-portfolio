import { getContent, type Locale } from '@/content';
import { routing } from '@/i18n/routing';

/** Every metric id of a locale: one static evidence page and one fragment each. */
export function evidenceParams(locale: string): { id: string }[] {
  return getContent(locale as Locale).metrics.map((m) => ({ id: m.id }));
}

/** Route handlers do not receive the [locale] layout's params, so they list both segments. */
export function allEvidenceParams(): { locale: string; id: string }[] {
  return routing.locales.flatMap((locale) => evidenceParams(locale).map(({ id }) => ({ locale, id })));
}
