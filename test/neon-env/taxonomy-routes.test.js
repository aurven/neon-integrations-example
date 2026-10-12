'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const handlers = require('../../src/requestHandlers/taxonomy-builder.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKeyLimited: 'lim-a' })]), envVars: {} });

let neon;
function fakeNeon({ catFamilies = [] } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async getCategoryFamilies() { calls.push('getCategoryFamilies'); return catFamilies; },
    async getCategory() { calls.push('getCategory'); return { children: [] }; },
    async getTagFamilies() { calls.push('getTagFamilies'); return []; },
    async getTagsInFamily() { calls.push('getTagsInFamily'); return []; },
    async createCategoryRaw() { calls.push('createCategoryRaw'); return { categoryRef: `c-${(n += 1)}` }; },
    async createTagFamilyRaw() { calls.push('createTagFamilyRaw'); return { id: `t-${(n += 1)}` }; },
    async createTagRaw() { calls.push('createTagRaw'); return { id: `t-${(n += 1)}` }; },
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/api/neon/taxonomy-builder/preview', handlers.previewTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/create', handlers.createTaxonomyHandler);
  return app;
}

const BODY = { categories: 'GruppoBello\n  Livello 1', tags: 'Nuova Famiglia\n  Nuovo Tag' };
const post = (app, url, opts = {}) => app.inject({ method: 'POST', url, headers: { apikey: 'key-a', ...(opts.headers || {}) }, payload: opts.payload ?? BODY });

beforeEach(() => {
  neon = fakeNeon();
  handlers.__setClientProviderForTest(() => neon);
});

test('401 without key, 403 for limited key, no Neon calls', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/neon/taxonomy-builder/preview', payload: BODY })).statusCode, 401);
  const limited = await post(app, '/api/neon/taxonomy-builder/create', { headers: { apikey: 'lim-a' } });
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'taxonomy creation requires an admin key' });
  assert.equal(neon.calls.length, 0);
});

test('400 on bad body (wrong types or both outlines empty)', async () => {
  const app = await buildApp();
  for (const payload of [{ categories: 'A' }, { categories: 1, tags: '' }, { categories: '  ', tags: '\n' }, { categories: 'A', tags: '', defaultLanguage: '' }]) {
    const res = await post(app, '/api/neon/taxonomy-builder/preview', { payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(res.json(), { error: 'body must be { categories: string, tags: string, defaultLanguage?: string }' });
  }
});

test('preview reads only and marks statuses', async () => {
  neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'GruppoBello' }] });
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/preview');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.env, 'a');
  assert.deepEqual(body.categories.map((i) => i.status), ['exists', 'new']);
  assert.equal(body.toCreate, 3);
  assert.deepEqual(body.errors, []);
  assert.ok(!neon.calls.some((c) => c.startsWith('create')));
});

test('create with parse errors -> 400 and no Neon calls', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create', { payload: { categories: '  A', tags: '' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { errors: ['categories line 1: first line cannot be indented'] });
  assert.equal(neon.calls.length, 0);
});

test('create runs and returns the report; re-run with everything existing -> 200 and no writes', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().counts, { created: 4, exists: 0, failed: 0, skipped: 0 });

  neon = {
    ...fakeNeon(),
    async getCategoryFamilies() { return [{ categoryRef: 'r', name: 'GruppoBello' }]; },
    async getCategory() { return { categoryRef: 'r', children: [{ categoryRef: 'c', name: 'Livello 1' }] }; },
    async getTagFamilies() { return [{ id: 'tf', name: 'Nuova Famiglia' }]; },
    async getTagsInFamily() { return [{ id: 't', name: 'Nuovo Tag' }]; },
  };
  const again = await post(app, '/api/neon/taxonomy-builder/create');
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json().counts, { created: 0, exists: 4, failed: 0, skipped: 0 });
});

test('demo mode never touches Neon', async () => {
  const app = await buildApp();
  const preview = await post(app, '/api/neon/taxonomy-builder/preview?demo=true');
  assert.equal(preview.json().toCreate, 4);
  const create = await post(app, '/api/neon/taxonomy-builder/create?demo=true');
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().counts.created, 4);
  assert.equal(neon.calls.length, 0);
});
