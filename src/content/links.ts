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
  pegasus: 'https://pegasus-job.com',
} as const;

export type LinkKeyName = keyof typeof LINKS;

export const ALLOWED_URLS: readonly string[] = Object.values(LINKS);

/** Public contact address, split so that it is never written whole in HTML. */
export const EMAIL_PARTS = { user: 'sen.python.dev', domain: 'gmail.com' } as const;

export function mailtoHref(): string {
  return `mailto:${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}`;
}

export function isPegasusLinkEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PEGASUS_LINK === 'true';
}

/** Hostname for display next to a title, e.g. "pegasus-job.com". */
export function displayHost(url: string): string {
  return new URL(url).host;
}
