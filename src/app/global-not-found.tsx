import type { Metadata } from 'next';
import en from '../../messages/en.json';
import ja from '../../messages/ja.json';
import { fontVariables } from '@/fonts/active';
import './globals.css';

/**
 * The 404 page for every unmatched URL. The site has no root layout (each language has its own
 * <html lang>), so this page brings its own document; it cannot know which language was meant and
 * says it in both. Plain HTML, no 3D, no client code of its own.
 */
export const metadata: Metadata = { title: `404 — ${ja.notFound.title} / ${en.notFound.title}`, robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return (
    <html lang="ja" className={fontVariables}>
      <body>
        <main id="main" className="not-found">
          <p className="not-found-code" aria-hidden="true">
            404
          </p>
          {(
            [
              ['ja', ja.notFound],
              ['en', en.notFound],
            ] as const
          ).map(([locale, t]) => (
            <section key={locale} lang={locale} aria-labelledby={`not-found-${locale}`}>
              <h1 id={`not-found-${locale}`}>{t.title}</h1>
              <p>{t.body}</p>
              <p>
                <a className="act-case" href={`/${locale}`}>
                  {t.home} <span aria-hidden="true">↑</span>
                </a>
              </p>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
