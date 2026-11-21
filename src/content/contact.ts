/**
 * The public contact address, split so that it is never written whole in HTML (CLAUDE.md §1-2,
 * BRIEF §5-10); it is assembled on the client. Kept apart from src/content/links.ts so that the
 * client island that needs it does not bundle the link list (which holds the consent-gated client
 * link) into the browser's JavaScript.
 */
export const EMAIL_PARTS = { user: 'sen.python.dev', domain: 'gmail.com' } as const;

export function mailtoHref(): string {
  return `mailto:${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}`;
}
