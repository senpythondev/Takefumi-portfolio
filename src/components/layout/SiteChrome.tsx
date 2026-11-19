import { getTranslations } from 'next-intl/server';
import type { SiteContent } from '@/content';
import { routing } from '@/i18n/routing';

export async function SiteHeader({ locale, person }: { locale: SiteContent['locale']; person: SiteContent['person'] }) {
  const t = await getTranslations('nav');
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <a className="site-brand" href={`/${locale}`}>
        {person.name}
      </a>
      <nav className="site-actions" aria-label={person.name}>
        <a className="action-summary" href="#summary">
          {t('summary')}
        </a>
        <a className="action-lang" href={`/${other}`} hrefLang={other} lang={other}>
          {t('switchLanguage')}
        </a>
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getTranslations('footer');
  return (
    <footer className="site-footer">
      <p>{t('builtWith')}</p>
      <p>{t('rights')}</p>
    </footer>
  );
}
