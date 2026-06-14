import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

describe('middleware', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
    process.env.NEON_EXT_APIKEY_LIMITED = 'limited-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 401 for /api/* without an apikey', async () => {
    const request = new NextRequest('https://example.com/api/health');
    const response = middleware(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('passes through /api/* with a valid apikey header and sets the apikey cookie', () => {
    const request = new NextRequest('https://example.com/api/health', {
      headers: { apikey: 'admin-key' },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
    const cookie = response.cookies.get('apikey');
    expect(cookie?.value).toBe('admin-key');
  });

  it('authenticates via the apikey query param', () => {
    const request = new NextRequest('https://example.com/api/health?apikey=admin-key');
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.cookies.get('apikey')?.value).toBe('admin-key');
  });

  it('authenticates via the apikey cookie', () => {
    const request = new NextRequest('https://example.com/api/health', {
      headers: { cookie: 'apikey=limited-key' },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.cookies.get('apikey')?.value).toBe('limited-key');
  });

  it('rewrites /neon/api/demo-integration/* to /api/* and applies the auth check', () => {
    const request = new NextRequest('https://example.com/neon/api/demo-integration/api/health', {
      headers: { apikey: 'admin-key' },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');
    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl as string).pathname).toBe('/api/health');
  });

  it('returns 401 for the rewritten iframe-proxy path without an apikey', async () => {
    const request = new NextRequest('https://example.com/neon/api/demo-integration/api/health');
    const response = middleware(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('does not affect non-/api paths', () => {
    const request = new NextRequest('https://example.com/');
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.cookies.get('apikey')).toBeUndefined();
  });
});
