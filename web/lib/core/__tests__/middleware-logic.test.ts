import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  IFRAME_PROXY_PREFIX,
  apiKeyCookieOptions,
  resolveApiKeyAuth,
  rewriteIframeProxyPath,
} from '../middleware-logic';

describe('rewriteIframeProxyPath', () => {
  it('strips the iframe-proxy prefix from a matching path', () => {
    expect(rewriteIframeProxyPath(`${IFRAME_PROXY_PREFIX}/api/health`)).toBe('/api/health');
    expect(rewriteIframeProxyPath(`${IFRAME_PROXY_PREFIX}/api/print-query-board/stories`)).toBe(
      '/api/print-query-board/stories'
    );
  });

  it('reduces the bare prefix to root', () => {
    expect(rewriteIframeProxyPath(IFRAME_PROXY_PREFIX)).toBe('/');
  });

  it('leaves non-matching paths unchanged', () => {
    expect(rewriteIframeProxyPath('/api/health')).toBe('/api/health');
    expect(rewriteIframeProxyPath('/')).toBe('/');
    expect(rewriteIframeProxyPath('/some/other/path')).toBe('/some/other/path');
  });

  it('does not partially match a prefix that merely starts with the same string', () => {
    expect(rewriteIframeProxyPath('/neon/api/demo-integration-extra/api/health')).toBe(
      '/neon/api/demo-integration-extra/api/health'
    );
  });
});

describe('resolveApiKeyAuth', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
    process.env.NEON_EXT_APIKEY_LIMITED = 'limited-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('authenticates via header apikey', () => {
    expect(resolveApiKeyAuth({ headerApiKey: 'admin-key' })).toEqual({
      authenticated: true,
      apikey: 'admin-key',
      role: 'admin',
    });
  });

  it('authenticates via query apikey when header is absent', () => {
    expect(resolveApiKeyAuth({ headerApiKey: null, queryApiKey: 'admin-key' })).toEqual({
      authenticated: true,
      apikey: 'admin-key',
      role: 'admin',
    });
  });

  it('authenticates via cookie apikey when header and query are absent', () => {
    expect(resolveApiKeyAuth({ cookieApiKey: 'limited-key' })).toEqual({
      authenticated: true,
      apikey: 'limited-key',
      role: 'limited',
    });
  });

  it('prefers header over query over cookie', () => {
    expect(
      resolveApiKeyAuth({
        headerApiKey: 'admin-key',
        queryApiKey: 'bogus',
        cookieApiKey: 'also-bogus',
      })
    ).toEqual({ authenticated: true, apikey: 'admin-key', role: 'admin' });
  });

  it('returns unauthenticated when no apikey is present anywhere', () => {
    expect(resolveApiKeyAuth({})).toEqual({ authenticated: false, apikey: null, role: null });
  });

  it('returns unauthenticated for a non-matching apikey', () => {
    expect(resolveApiKeyAuth({ headerApiKey: 'wrong' })).toEqual({
      authenticated: false,
      apikey: null,
      role: null,
    });
  });
});

describe('apiKeyCookieOptions', () => {
  it('marks the cookie secure in production', () => {
    expect(apiKeyCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24,
      path: '/',
    });
  });

  it('does not mark the cookie secure outside production', () => {
    expect(apiKeyCookieOptions(false)).toEqual({
      httpOnly: true,
      secure: false,
      maxAge: 60 * 60 * 24,
      path: '/',
    });
  });
});
