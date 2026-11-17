import { getTranslations } from 'next-intl/server';
import type { Layer, SiteContent } from '@/content';
import { routing } from '@/i18n/routing';
import { layerAnchor } from '@/components/layers/LayerSection';

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

/**
 * Plain list of every layer. It is the keyboard/no-JS base of the boring-core navigator (Phase 3),
 * which will enhance it rather than replace it.
 */
export async function LayerIndex({ layers }: { layers: Layer[] }) {
  const t = await getTranslations('nav');
  const td = await getTranslations('depth');

  return (
    <nav className="layer-index" aria-labelledby="layer-index-title">
      <h2 id="layer-index-title">{t('layers')}</h2>
      <ol>
        {layers.map((layer, index) => (
          <li key={layer.id} data-layer={layer.id}>
            <a href={`#${layerAnchor(layer.id)}`}>
              <span className="layer-index-depth">{td('label', { index })}</span>
              <span className="layer-index-title">{layer.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
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
