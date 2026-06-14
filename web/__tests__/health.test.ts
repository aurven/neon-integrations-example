import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { GET } from '../app/api/health/route';

/**
 * End-to-end smoke test for Task 5: apikey middleware + iframe-proxy
 * rewrite (Task 3) wired up against a real route handler (`/api/health`).
 *
 * The proxy() tests below confirm the *routing decision* (401 vs.
 * pass-through/rewrite) for both the direct `/api/health` path and the
 * `/neon/api/demo-integration/api/health` iframe-proxy alias. The final
 * test calls the actual route handler to confirm it returns the expected
 * `{ status: "ok" }` body - this is the piece the middleware decides
 * whether to expose.
 */
describe('GET /api/health route handler', () => {
  it('returns { status: "ok" } with a 200 response', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('proxy + /api/health', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('blocks /api/health without an apikey', async () => {
    const request = new NextRequest('https://example.com/api/health');
    const response = proxy(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows /api/health through with a valid apikey header', () => {
    const request = new NextRequest('https://example.com/api/health', {
      headers: { apikey: 'admin-key' },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('rewrites /neon/api/demo-integration/api/health to /api/health with a valid apikey', () => {
    const request = new NextRequest(
      'https://example.com/neon/api/demo-integration/api/health',
      { headers: { apikey: 'admin-key' } }
    );
    const response = proxy(request);
    expect(response.status).toBe(200);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');
    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl as string).pathname).toBe('/api/health');
  });

  it('blocks the iframe-proxy alias for /api/health without an apikey', async () => {
    const request = new NextRequest(
      'https://example.com/neon/api/demo-integration/api/health'
    );
    const response = proxy(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('does not gate the /health-check page (non-/api path)', () => {
    const request = new NextRequest('https://example.com/health-check');
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
