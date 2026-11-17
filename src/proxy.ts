import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Only `/` goes through the proxy: it picks /ja or /en from Accept-Language.
 * The locale pages themselves stay fully static.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ['/'],
};
