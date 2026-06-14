import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  apiKeyCookieOptions,
  resolveApiKeyAuth,
  rewriteIframeProxyPath,
} from './lib/core/middleware-logic';

export const config = {
  // NOTE: matcher entries must be static string literals (statically
  // analyzed at build time), so the iframe-proxy prefix below must match
  // IFRAME_PROXY_PREFIX in ./lib/core/middleware-logic.ts.
  matcher: ['/api/:path*', '/neon/api/demo-integration/:path*'],
};

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Resolve the iframe-proxy convention: /neon/api/demo-integration/* -> /api/*
  const rewrittenPathname = rewriteIframeProxyPath(pathname);
  const isRewritten = rewrittenPathname !== pathname;

  // Only the (rewritten) /api/* surface is gated by the apikey check.
  if (!rewrittenPathname.startsWith('/api/') && rewrittenPathname !== '/api') {
    return NextResponse.next();
  }

  const headerApiKey = request.headers.get('apikey');
  const queryApiKey = searchParams.get('apikey');
  const cookieApiKey = request.cookies.get('apikey')?.value;

  const auth = resolveApiKeyAuth({ headerApiKey, queryApiKey, cookieApiKey });

  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let response: NextResponse;
  if (isRewritten) {
    const url = request.nextUrl.clone();
    url.pathname = rewrittenPathname;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next();
  }

  // Restore the cookie side-effect that checkApiKey() deliberately dropped
  // (see comment in web/lib/core/auth.ts).
  response.cookies.set('apikey', auth.apikey as string, apiKeyCookieOptions(process.env.NODE_ENV === 'production'));

  return response;
}
