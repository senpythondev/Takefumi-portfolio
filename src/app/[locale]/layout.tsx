import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContent } from '@/content';
import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/site';
import { base } from '@/styles/tokens';
import { fontVariables } from '@/fonts/active';
import '../globals.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: base.ground,
  colorScheme: 'dark',
};

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  const years = getContent(locale).metrics.find((m) => m.id === 'career-years')?.display ?? '';
  const description = t('description', { years });
  return {
    metadataBase: siteUrl(),
    title: t('title'),
    // The years come from the career-years metric so the number has a single source.
    description: description.charAt(0).toUpperCase() + description.slice(1),
    alternates: {
      canonical: `/${locale}`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])), 'x-default': `/${routing.defaultLocale}` },
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
