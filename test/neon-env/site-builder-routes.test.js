'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const handlers = require('../../src/requestHandlers/site-builder.js');
const { envJson, registryJson } = require('./fixtures.js');

const withSuffix = envJson('a', {
  extApiKeyLimited: 'lim-a',
  neon: { ...envJson('a').neon, fo: { url: 'https://neon-fo-a.example.com', apiKey: 'fo-a', siteHostSuffix: '-canary.neon.test:3000' } },
});
const reg = buildRegistry({ json: registryJson([withSuffix, envJson('b')]), envVars: {} });

let neon;
function fakeNeon(sites = []) {
  const calls = [];
  return {
    calls,
    async getSites(o) { calls.push(['getSites', o]); return sites; },
    async createHeadlessSite(p) { calls.push(['site', p]); return { id: 'root-1' }; },
    async createSiteNodeRaw(p) { calls.push(['node', p]); return { id: `n-${calls.length}` }; },
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/api/neon/site-builder/preview', handlers.previewSiteHandler);
  app.post('/api/neon/site-builder/create', handlers.createSiteHandler);
  return app;
}

const BODY = { title: 'Il Mio Nuovo Sito', outline: 'Prima Sezione\n  Prima Sottosezione' };

beforeEach(() => {
  neon = fakeNeon();
  handlers.__setClientProviderForTest(() => neon);
});

test('401 without key, 403 with limited key', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', payload: BODY })).statusCode, 401);
  const limited = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'lim-a' }, payload: BODY });
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'site creation requires an admin key' });
  assert.equal(neon.calls.length, 0);
});

test('400 on a bad body', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: { title: 'x' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'body must be { title: string, outline: string }' });
});

test('preview returns the plan and runs only the name check', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    env: 'a',
    site: { name: 'il-mio-nuovo-sito', title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000' },
    sections: [
      { path: '/prima-sezione/', title: 'Prima Sezione', depth: 1, name: 'prima-sezione' },
      { path: '/prima-sezione/prima-sottosezione/', title: 'Prima Sottosezione', depth: 2, name: 'prima-sottosezione' },
    ],
    errors: [],
  });
  assert.deepEqual(neon.calls.map((c) => c[0]), ['getSites']);
});

test('preview reports a taken name; create refuses with 400 and makes no create calls', async () => {
  neon = fakeNeon([{ name: 'il-mio-nuovo-sito' }]);
  const app = await buildApp();
  const preview = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: BODY });
  assert.deepEqual(preview.json().errors, ['site "il-mio-nuovo-sito" already exists in env a']);
  const create = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(create.statusCode, 400);
  assert.deepEqual(create.json(), { errors: ['site "il-mio-nuovo-sito" already exists in env a'] });
  assert.ok(!neon.calls.some((c) => c[0] === 'site' || c[0] === 'node'));
});

test('env without siteHostSuffix -> create 400', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json().errors, ['site creation not configured for env b: neon.fo.siteHostSuffix missing']);
});

test('create runs the flow and returns the report', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 200);
  const report = res.json();
  assert.equal(report.site.status, 'created');
  assert.deepEqual(report.counts, { created: 2, failed: 0, skipped: 0 });
  assert.deepEqual(neon.calls.map((c) => c[0]), ['getSites', 'site', 'node', 'node']);
});

test('create returns 502 when the site creation fails', async () => {
  neon.createHeadlessSite = async () => { throw new Error('boom'); };
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().site.status, 'failed');
});

test('demo mode never calls Neon, even for an env without siteHostSuffix', async () => {
  const app = await buildApp();
  const preview = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview?demo=true', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.json().errors, []);
  assert.equal(preview.json().site.liveHostname, 'https://ilmionuovosito-demo.neon.example');
  const create = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create?demo=true', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().site.id, 'demo-root');
  assert.equal(neon.calls.length, 0);
});
