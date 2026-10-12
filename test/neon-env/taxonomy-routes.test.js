'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const handlers = require('../../src/requestHandlers/taxonomy-builder.js');
const jobs = require('../../src/helpers/taxonomy-builder/jobs.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKeyLimited: 'lim-a' }), envJson('b')]), envVars: {} });

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
  const opts = { bodyLimit: handlers.BODY_LIMIT };
  app.post('/api/neon/taxonomy-builder/preview', opts, handlers.previewTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/create', opts, handlers.createTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/jobs', opts, handlers.startTaxonomyJobHandler);
  app.get('/api/neon/taxonomy-builder/jobs', handlers.listTaxonomyJobsHandler);
  app.get('/api/neon/taxonomy-builder/jobs/:id', handlers.getTaxonomyJobHandler);
  app.get('/api/neon/taxonomy-builder/jobs/:id/report', handlers.taxonomyJobReportHandler);
  app.post('/api/neon/taxonomy-builder/jobs/:id/cancel', opts, handlers.cancelTaxonomyJobHandler);
  return app;
}

const BODY = { categories: 'GruppoBello\n  Livello 1', tags: 'Nuova Famiglia\n  Nuovo Tag' };
const post = (app, url, opts = {}) => app.inject({ method: 'POST', url, headers: { apikey: 'key-a', ...(opts.headers || {}) }, payload: opts.payload ?? BODY });

beforeEach(() => {
  jobs.__resetForTest();
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

test('create: category family read failure -> 400 and no writes', async () => {
  neon = { ...fakeNeon(), async getCategoryFamilies() { neon.calls.push('getCategoryFamilies'); throw new Error('ECONNREFUSED'); } };
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create');
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().errors[0].startsWith('could not read existing category families in env a'), res.body);
  assert.ok(!neon.calls.some((c) => c.startsWith('create')));
});

test('create: subtree read failure for one family -> 400 and no writes', async () => {
  const base = fakeNeon();
  neon = {
    ...base,
    async getCategoryFamilies() { return [{ categoryRef: 'r1', name: 'Uno' }, { categoryRef: 'r2', name: 'Due' }]; },
    async getCategory({ categoryRef }) {
      if (categoryRef === 'r2') throw new Error('boom');
      return { categoryRef, children: [] };
    },
  };
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create', { payload: { categories: 'Uno\n  A\nDue\n  B', tags: '' } });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().errors.some((e) => e.startsWith('could not read existing categories of "Due"')), res.body);
  assert.ok(!base.calls.some((c) => c.startsWith('create')));
});

const get = (app, url, apikey = 'key-a') => app.inject({ method: 'GET', url, headers: { apikey } });

test('POST /jobs → 202 with jobId/total/toCreate; status, list, report work', async () => {
  neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'GruppoBello' }] });
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/jobs');
  assert.equal(res.statusCode, 202);
  const { jobId, total, toCreate } = res.json();
  assert.match(jobId, /^txj-/);
  assert.equal(total, 4);
  assert.equal(toCreate, 3);
  await jobs.waitForJob(jobId);
  const status = await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`);
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().state, 'completed');
  assert.deepEqual(status.json().counts, { created: 3, exists: 1, failed: 0, skipped: 0 });
  const list = await get(app, '/api/neon/taxonomy-builder/jobs');
  assert.deepEqual(list.json().jobs.map((j) => j.jobId), [jobId]);
  const report = await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}/report`);
  assert.equal(report.statusCode, 200);
  assert.equal(report.headers['content-disposition'], `attachment; filename="${jobId}-report.json"`);
  assert.equal(report.json().categories.length, 2);
});

test('POST /jobs with plan errors → 400 {errors (max 200), errorCount}, no job, no Neon calls', async () => {
  const app = await buildApp();
  const bad = ['A', ...Array.from({ length: 301 }, () => '  dup')].join('\n'); // 300 duplicate-sibling errors
  const res = await post(app, '/api/neon/taxonomy-builder/jobs', { payload: { categories: bad, tags: '' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().errors.length, 200);
  assert.equal(res.json().errorCount, 300);
  assert.deepEqual(jobs.listJobs({ envId: null }), []);
  assert.equal(neon.calls.length, 0);
});

test('POST /jobs while one is running in the env → 409 with the running jobId, before any read', async () => {
  const app = await buildApp();
  const first = (await post(app, '/api/neon/taxonomy-builder/jobs?demo=true')).json();
  neon.calls.length = 0;
  const res = await post(app, '/api/neon/taxonomy-builder/jobs');
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.json(), { error: 'a taxonomy job is already running in env a', jobId: first.jobId });
  assert.equal(neon.calls.length, 0);
  const cancelled = await post(app, `/api/neon/taxonomy-builder/jobs/${first.jobId}/cancel`, { payload: {} });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().jobId, first.jobId);
  await jobs.waitForJob(first.jobId);
  const again = await post(app, `/api/neon/taxonomy-builder/jobs/${first.jobId}/cancel`, { payload: {} });
  assert.equal(again.statusCode, 409);
  assert.deepEqual(again.json(), { error: 'job is not running' });
});

test('demo job: no Neon calls, completes with demo ids', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/jobs?demo=true');
  assert.equal(res.statusCode, 202);
  await jobs.waitForJob(res.json().jobId);
  const report = (await get(app, `/api/neon/taxonomy-builder/jobs/${res.json().jobId}/report`)).json();
  assert.equal(report.state, 'completed');
  assert.equal(report.categories[0].ref, 'demo-1');
  assert.equal(neon.calls.length, 0);
});

test('job endpoints: 401 without key, 403 for limited key, 404 unknown or other env; global admin sees all', async () => {
  const app = await buildApp();
  const { jobId } = (await post(app, '/api/neon/taxonomy-builder/jobs?demo=true')).json();
  assert.equal((await app.inject({ method: 'GET', url: '/api/neon/taxonomy-builder/jobs' })).statusCode, 401);
  const limited = await get(app, '/api/neon/taxonomy-builder/jobs', 'lim-a');
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'taxonomy creation requires an admin key' });
  assert.equal((await get(app, '/api/neon/taxonomy-builder/jobs/txj-00000000-000000')).statusCode, 404);
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs/txj-00000000-000000')).json(), { error: 'job not found' });
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`, 'key-b')).statusCode, 404);
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}/report`, 'key-b')).statusCode, 404);
  assert.equal((await post(app, `/api/neon/taxonomy-builder/jobs/${jobId}/cancel`, { headers: { apikey: 'key-b' }, payload: {} })).statusCode, 404);
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs', 'key-b')).json(), { jobs: [] });
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs', 'admin-key')).json().jobs.map((j) => j.jobId), [jobId]);
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`, 'admin-key')).statusCode, 200);
  await jobs.waitForJob(jobId);
});

test('body limit: 1.2 MB accepted, 6 MB rejected with 413', async () => {
  const app = await buildApp();
  const line = '  Commune with a fairly long name number ';
  const big = ['France', ...Array.from({ length: 30000 }, (_, i) => `${line}${i}`)].join('\n');
  assert.ok(Buffer.byteLength(big) > 1.2 * 1024 * 1024);
  const ok = await post(app, '/api/neon/taxonomy-builder/preview', { payload: { categories: big, tags: '' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().mode, 'summary');
  assert.equal(ok.json().total, 30001);
  const huge = 'x'.repeat(6 * 1024 * 1024);
  const tooBig = await post(app, '/api/neon/taxonomy-builder/jobs', { payload: { categories: huge, tags: '' } });
  assert.equal(tooBig.statusCode, 413);
});

test('sync create still enforces 500 items; preview allows up to 50000', async () => {
  const app = await buildApp();
  const many = ['F', ...Array.from({ length: 600 }, (_, i) => `  C ${i}`)].join('\n');
  const created = await post(app, '/api/neon/taxonomy-builder/create', { payload: { categories: many, tags: '' } });
  assert.equal(created.statusCode, 400);
  assert.deepEqual(created.json().errors, ['outline has 601 items; the limit is 500']);
  const preview = await post(app, '/api/neon/taxonomy-builder/preview', { payload: { categories: many, tags: '' } });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.json().errors, []);
  assert.equal(preview.json().mode, 'summary');
});

test('report of a job beyond the 3 most recent finished per env -> 410', async () => {
  const app = await buildApp();
  const { buildTaxonomyPlan, JOB_MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    const plan = buildTaxonomyPlan({ categories: 'A', tags: '', maxItems: JOB_MAX_ITEMS });
    const existing = { categories: [{ status: 'new' }], tags: [] };
    const { jobId } = jobs.startJob({ plan, existing, env: { id: 'a' }, client: neon });
    await jobs.waitForJob(jobId);
    ids.push(jobId);
  }
  const old = await get(app, `/api/neon/taxonomy-builder/jobs/${ids[0]}/report`);
  assert.equal(old.statusCode, 410);
  assert.deepEqual(old.json(), { error: 'report no longer available' });
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${ids[0]}`)).statusCode, 200);
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${ids[3]}/report`)).statusCode, 200);
});
