/**
 * The ONLY place where external URLs may be written (CLAUDE.md §1-2).
 * scripts/check-confidentiality.ts reads `ALLOWED_URLS` from this file and fails on any other URL.
 *
 * The e-mail address is stored in parts and assembled on the client, so it never appears
 * as plain text in the HTML (CLAUDE.md §1-2, BRIEF §5-10).
 */

export const LINKS = {
  genten: 'https://genten.vercel.app/',
  gentenArticle:
    'https://dev.to/kaze001/english-guides-say-y6-million-the-fsa-says-y18-million-genten-checks-japans-money-rules-against-4jfe',
  github: 'https://github.com/senpythondev',
  devProfile: 'https://dev.to/kaze001',
  /** Shown only when NEXT_PUBLIC_ENABLE_PEGASUS_LINK === 'true' (client's consent pending). */
  clientSite: 'https://pegasus-job.com',
  /** Source of the kanji stroke-order data (CC BY-SA 3.0): the credit in the footer links here (PM, STORYBOARD v2.4). */
  kanjivg: 'https://kanjivg.tagaini.net/',
} as const;

export type LinkKeyName = keyof typeof LINKS;

/**
 * Not a link: the vocabulary identifier that Person structured data must name (JSON-LD `@context`).
 * It is never rendered as an href and nothing is fetched from it; it is listed here because this
 * file is the only place a URL may be written (PM: "Person structured data", final round 2026-11-20).
 */
export const SCHEMA_ORG = 'https://schema.org';

export const ALLOWED_URLS: readonly string[] = [...Object.values(LINKS), SCHEMA_ORG];

/** The public contact address lives in src/content/contact.ts (client-safe); re-exported for scripts and tests. */
export { EMAIL_PARTS, mailtoHref } from './contact.ts';

export function isClientSiteLinkEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PEGASUS_LINK === 'true';
}

/** Hostname for display next to a title, e.g. "genten.vercel.app". */
export function displayHost(url: string): string {
  return new URL(url).host;
}
