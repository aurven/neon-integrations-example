/**
 * Pure decision logic for the apikey-auth + iframe-proxy middleware.
 *
 * Extracted from `web/middleware.ts` so it can be unit tested without
 * constructing real `NextRequest`/`NextResponse` instances.
 */

import { checkApiKey, type AuthResult } from './auth';

export const IFRAME_PROXY_PREFIX = '/neon/api/demo-integration';

/**
 * If `pathname` starts with the iframe-proxy prefix
 * (`/neon/api/demo-integration`), strip the prefix so the remainder
 * resolves like a normal `/api/*` path. Otherwise returns `pathname`
 * unchanged.
 *
 * Mirrors the convention in `src/react-widgets/src/api.js`, where embedded
 * widgets prefix their fetch calls with `/neon/api/demo-integration` instead
 * of hitting `/api/*` directly.
 */
export function rewriteIframeProxyPath(pathname: string): string {
  if (pathname === IFRAME_PROXY_PREFIX || pathname.startsWith(`${IFRAME_PROXY_PREFIX}/`)) {
    const stripped = pathname.slice(IFRAME_PROXY_PREFIX.length);
    return stripped === '' ? '/' : stripped;
  }
  return pathname;
}

/**
 * Extracts the apikey from header, query param, or cookie - in that order
 * of precedence - and runs it through `checkApiKey()`.
 */
export function resolveApiKeyAuth({
  headerApiKey,
  queryApiKey,
  cookieApiKey,
}: {
  headerApiKey?: string | null;
  queryApiKey?: string | null;
  cookieApiKey?: string | null;
}): AuthResult {
  const apikey = headerApiKey || queryApiKey || cookieApiKey || null;
  return checkApiKey(apikey);
}

/**
 * Cookie options used when persisting a successfully-validated apikey.
 */
export function apiKeyCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    maxAge: 60 * 60 * 24, // 24 hours, in seconds
    path: '/',
  } as const;
}
