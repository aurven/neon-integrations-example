'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../../src/helpers/site-builder/plan.js');
const { checkPlan, createSiteFromPlan, demoReport } = require('../../src/helpers/site-builder/create-site.js');

const ENV = { id: 'sandbox', neon: { fo: { url: 'https://fo', apiKey: 'k', siteHostSuffix: '-canary.neon.test:3000' } } };
const plan = (outline) => buildPlan({ title: 'Il Mio Nuovo Sito', outline }, ENV);

function fakeNeon({ sites = [], siteResponse = { id: 'root-1' }, failPaths = [], noIdPaths = [], siteError = null, sitesError = null } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async getSites(options) {
      calls.push(['getSites', options]);
      if (sitesError) throw sitesError;
      return typeof sites === 'function' ? sites() : sites;
    },
    async createHeadlessSite(payload) {
      calls.push(['site', payload]);
      if (siteError) throw siteError;
      return siteResponse;
    },
    async createSiteNodeRaw(payload) {
      calls.push(['node', payload]);
      if (failPaths.includes(payload.path)) {
        const err = new Error('Request failed'); err.response = { status: 409, data: { message: 'name already used' } }; throw err;
      }
      if (noIdPaths.includes(payload.path)) return {};
      n += 1;
      return { id: `node-${n}` };
    },
  };
}

test('checkPlan: name collision is case-insensitive on name or siteName', async () => {
  assert.deepEqual(await checkPlan(plan(''), fakeNeon({ sites: [{ name: 'other' }] }), 'sandbox'), []);
  assert.deepEqual(await checkPlan(plan(''), fakeNeon({ sites: [{ siteName: 'IL-MIO-NUOVO-SITO' }] }), 'sandbox'),
    ['site "il-mio-nuovo-sito" already exists in env sandbox']);
  const neon = fakeNeon();
  await checkPlan(plan(''), neon, 'sandbox');
  assert.deepEqual(neon.calls[0], ['getSites', { limit: 1000 }]);
});

test('checkPlan: getSites failure blocks with a clear error', async () => {
  const errors = await checkPlan(plan(''), fakeNeon({ sitesError: new Error('ECONNREFUSED') }), 'sandbox');
  assert.deepEqual(errors, ['could not check existing sites in env sandbox: ECONNREFUSED']);
});

test('creates site then sections parent-first with correct parentIds', async () => {
  const neon = fakeNeon();
  const report = await createSiteFromPlan(plan('Prima Sezione\n  Prima Sottosezione\nSeconda'), neon, 'sandbox');
  assert.equal(neon.calls[0][0], 'site');
  assert.equal(neon.calls[0][1].type, 'site/headless');
  const nodes = neon.calls.filter((c) => c[0] === 'node').map((c) => [c[1].path, c[1].parentId, c[1].siteName]);
  assert.deepEqual(nodes, [
    ['/prima-sezione/', 'root-1', 'il-mio-nuovo-sito'],
    ['/prima-sezione/prima-sottosezione/', 'node-1', 'il-mio-nuovo-sito'],
    ['/seconda/', 'root-1', 'il-mio-nuovo-sito'],
  ]);
  assert.deepEqual(report.site, { status: 'created', name: 'il-mio-nuovo-sito', title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000', id: 'root-1' });
  assert.deepEqual(report.sections.map((s) => [s.path, s.status, s.id]), [
    ['/prima-sezione/', 'created', 'node-1'],
    ['/prima-sezione/prima-sottosezione/', 'created', 'node-2'],
    ['/seconda/', 'created', 'node-3'],
  ]);
  assert.deepEqual(report.counts, { created: 3, failed: 0, skipped: 0 });
  assert.equal(report.env, 'sandbox');
});

test('a failed middle section skips all its descendants; siblings continue', async () => {
  const neon = fakeNeon({ failPaths: ['/a/b/'] });
  const report = await createSiteFromPlan(plan('A\n  B\n    C\n      D\n  E\nF'), neon, 'sandbox');
  assert.deepEqual(report.sections.map((s) => [s.path, s.status]), [
    ['/a/', 'created'], ['/a/b/', 'failed'], ['/a/b/c/', 'skipped'], ['/a/b/c/d/', 'skipped'], ['/a/e/', 'created'], ['/f/', 'created'],
  ]);
  assert.equal(report.sections[1].error, '409: name already used');
  assert.equal(report.sections[2].error, 'parent "/a/b/" was not created');
  assert.equal(report.sections[3].error, 'parent "/a/b/c/" was not created');
  assert.ok(!neon.calls.some((c) => c[0] === 'node' && c[1].path.startsWith('/a/b/c/')));
  assert.deepEqual(report.counts, { created: 3, failed: 1, skipped: 2 });
});

test('node created without id -> failed, descendants skipped', async () => {
  const report = await createSiteFromPlan(plan('A\n  B'), fakeNeon({ noIdPaths: ['/a/'] }), 'sandbox');
  assert.deepEqual(report.sections.map((s) => [s.status, s.error]), [['failed', 'node created but no id returned'], ['skipped', 'parent "/a/" was not created']]);
});

test('site creation failure -> site failed, all sections skipped, no node calls', async () => {
  const err = new Error('boom'); err.response = { status: 500, data: { message: 'internal' } };
  const neon = fakeNeon({ siteError: err });
  const report = await createSiteFromPlan(plan('A\n  B'), neon, 'sandbox');
  assert.equal(report.site.status, 'failed');
  assert.equal(report.site.error, '500: internal');
  assert.ok(report.sections.every((s) => s.status === 'skipped' && s.error === 'site was not created'));
  assert.ok(!neon.calls.some((c) => c[0] === 'node'));
  assert.deepEqual(report.counts, { created: 0, failed: 0, skipped: 2 });
});

test('root id resolution: familyRef, root.id, result.id', async () => {
  for (const [response, expected] of [[{ familyRef: 'fr-1' }, 'fr-1'], [{ root: { id: 'r-1' } }, 'r-1'], [{ result: { id: 'x-1' } }, 'x-1']]) {
    const neon = fakeNeon({ siteResponse: response });
    const report = await createSiteFromPlan(plan('A'), neon, 'sandbox');
    assert.equal(report.site.id, expected);
    assert.equal(neon.calls.find((c) => c[0] === 'node')[1].parentId, expected);
  }
});

test('root id falls back to getSites lookup after create', async () => {
  let created = false;
  const neon = fakeNeon({ siteResponse: {}, sites: () => (created ? [{ name: 'il-mio-nuovo-sito', root: { id: 'looked-up' } }] : []) });
  const origCreate = neon.createHeadlessSite;
  neon.createHeadlessSite = async (p) => { const r = await origCreate(p); created = true; return r; };
  const report = await createSiteFromPlan(plan('A'), neon, 'sandbox');
  assert.equal(report.site.id, 'looked-up');
  assert.equal(report.sections[0].status, 'created');
});

test('root id not found -> site created, sections skipped', async () => {
  const report = await createSiteFromPlan(plan('A\nB'), fakeNeon({ siteResponse: {}, sites: [] }), 'sandbox');
  assert.equal(report.site.status, 'created');
  assert.equal(report.site.error, "could not determine the new site's root node id");
  assert.ok(report.sections.every((s) => s.status === 'skipped' && s.error === "could not determine the new site's root node id"));
});

test('demoReport simulates success without Neon', () => {
  const report = demoReport(plan('A\n  B'), 'sandbox');
  assert.equal(report.site.id, 'demo-root');
  assert.deepEqual(report.sections.map((s) => [s.status, s.id]), [['created', 'demo-1'], ['created', 'demo-2']]);
  assert.deepEqual(report.counts, { created: 2, failed: 0, skipped: 0 });
});
