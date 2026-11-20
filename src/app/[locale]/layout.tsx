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
  const title = t('title');
  const text = description.charAt(0).toUpperCase() + description.slice(1);
  // Link previews (OGP / X): the image is a capture of the real hero (scripts/build-og.mjs).
  const image = { url: `/media/og/${locale}.jpg`, width: 1200, height: 630, alt: t('ogAlt') };
  return {
    metadataBase: siteUrl(),
    title,
    // The years come from the career-years metric so the number has a single source.
    description: text,
    alternates: {
      canonical: `/${locale}`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])), 'x-default': `/${routing.defaultLocale}` },
    },
    openGraph: {
      type: 'website',
      siteName: t('siteName'),
      title,
      description: text,
      url: `/${locale}`,
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      alternateLocale: locale === 'ja' ? ['en_US'] : ['ja_JP'],
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description: text, images: [image] },
  };
}

/**
 * The stacked version of the home (no 3D: reduced motion, Save-Data, ?quality=static) is one long
 * page: every section laid out before the first paint, and again each time a web font arrives.
 * Traced on CI's static-page budget (WORKLOG 2026-11-20), those layouts were its blocking time.
 *
 * When the page already knows it will be that version, this marks <html data-static> before the
 * first paint, and the CSS (globals.css) lets the browser skip laying out the sections that are
 * below the screen (content-visibility). The first thing the visitor does — scroll, press a key,
 * touch, follow an anchor — removes the mark, so from then on every section has its real size and
 * anchors land exactly; whatever section was at the top of the screen at that moment is kept there.
 * A page opened at an anchor, reloaded, or reached with Back is never marked. If the visitor does
 * nothing, the rest is laid out in an idle moment six seconds after the page has loaded.
 * Known limit: in those first seconds, a jump made without any input event (the browser's own
 * find-in-page, a script) lands by the sections' estimated heights and can be off by a section. Without JavaScript nothing is
 * marked and the page is laid out in full, as before. The skipped sections stay in the
 * accessibility tree and are found by the browser's search.
 */
const STATIC_FIRST = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search).get('quality'),c=navigator.connection,n=performance.getEntriesByType('navigation')[0];if(location.hash||(n&&n.type!=='navigate')||!(q==='static'||(!q&&(matchMedia('(prefers-reduced-motion: reduce)').matches||(c&&c.saveData)))))return;d.setAttribute('data-static','');var e=['pointerdown','keydown','wheel','touchstart','scroll','hashchange'],f=function(){e.forEach(function(t){removeEventListener(t,f,true)});var s=null,l=document.elementsFromPoint(innerWidth/2,4);for(var i=0;i<l.length&&!s;i++)s=l[i].closest('main section');var y=s?s.getBoundingClientRect().top:0;d.removeAttribute('data-static');if(s){var z=s.getBoundingClientRect().top;if(Math.abs(z-y)>1)scrollBy(0,z-y)}};e.forEach(function(t){addEventListener(t,f,{capture:true,passive:true})});addEventListener('load',function(){setTimeout(function(){(window.requestIdleCallback||setTimeout)(f)},6000)})}catch(_){}})()`;

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={fontVariables}>
      <head>
        {/* Before the first paint (STATIC_FIRST below): mark the stacked, no-3D version when it is already known. */}
        <script dangerouslySetInnerHTML={{ __html: STATIC_FIRST }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
