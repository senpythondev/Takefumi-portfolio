/**
 * Absolute base URL of the site (needed for hreflang / canonical / OGP).
 * The production domain is decided in Phase 7 and set as NEXT_PUBLIC_SITE_URL (documented in LAUNCH.md);
 * on Vercel previews the system variable is used; locally it falls back to the dev server.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL('https://' + vercel);
  return new URL('http://localhost:3000');
}
