'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const fo = require('../../src/helpers/neon-env/fo-sites.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const sites = require('../../src/helpers/sites-helpers.js');
const { envJson, registryJson } = require('./fixtures.js');
const DEMORC = require('./fixtures/fo-sites-demorc.json');

const noFo = envJson('nofo'); delete noFo.neon.fo;
const reg = buildRegistry({ json: registryJson([envJson('a'), noFo]), envVars: {} });
const inA = (fn) => context.run(reg.get('a'), fn);

let calls;
function stub(route) {
  calls = [];
  fo.__setHttpForTest(async (config) => {
    calls.push(config);
    if (config.url.endsWith('/api/sites/live')) return { status: 200, data: DEMORC };
    return route(config);
  });
}

beforeEach(() => {
  fo.clearSiteCache();
  stub(() => ({ status: 200, data: { resourceUrl: '/resources/pic.jpg', files: {} } }));
});

test('getFrontOfficeUrl is gone', () => {
  assert.equal(sites.getFrontOfficeUrl, undefined);
});

test('getSiteHostname returns the site public url from the catalog', async () => {
  assert.equal(await inA(() => sites.getSiteHostname('theglobe')), 'https://theglobe-demorc.sites.neap.eidosmedia.io');
  assert.ok(!calls.some((c) => c.url.includes('/api/sites/current')));
});

test('getSiteHostname for preview still returns the live public url', async () => {
  assert.equal(await inA(() => sites.getSiteHostname('NextFrontier', 'preview')), 'https://nextfrontier-demorc.sites.neap.eidosmedia.io');
});

test('getNodeById calls the site live API host with the FO key', async () => {
  const node = await inA(() => sites.getNodeById({ siteName: 'TheGlobe', targetId: 'abc' }));
  const nodeCall = calls.find((c) => c.url.includes('/api/nodes/'));
  assert.equal(nodeCall.url, 'https://theglobe-demorc-site.sites.neap.eidosmedia.io/api/nodes/abc');
  assert.equal(nodeCall.headers['neon-fo-access-key'], 'fo-a');
  assert.equal(node.resourceUrl, '/resources/pic.jpg');
});

test('getResource uses the requested stage API host and streams', async () => {
  await inA(() => sites.getResource({ siteName: 'TheGlobe', url: '/resources/pic.jpg', environment: 'preview' }));
  const resCall = calls.find((c) => c.url.includes('/resources/'));
  assert.equal(resCall.url, 'https://theglobe-preview-demorc-site.sites.neap.eidosmedia.io/resources/pic.jpg');
  assert.equal(resCall.responseType, 'stream');
  assert.equal(resCall.headers.Accept, 'image/*');
});

test('getNodeById network error without response -> undefined, no throw', async () => {
  stub(() => { const err = new Error('socket hang up'); err.code = 'ECONNRESET'; throw err; });
  assert.equal(await inA(() => sites.getNodeById({ siteName: 'TheGlobe', targetId: 'abc' })), undefined);
});

test('getResourceById on missing node throws a clear error', async () => {
  stub(() => { const err = new Error('nf'); err.response = { status: 404, data: { error: 'not found' } }; throw err; });
  await assert.rejects(() => inA(() => sites.getResourceById({ siteName: 'TheGlobe', targetId: 'zzz' })), /node zzz not found on site TheGlobe \(live\)/);
});

test('unknown site propagates the catalog 404', async () => {
  await assert.rejects(() => inA(() => sites.getNodeById({ siteName: 'Nope', targetId: 'x' })), (err) => err.statusCode === 404);
});

test('env without neon.fo -> 501', async () => {
  await assert.rejects(() => context.run(reg.get('nofo'), () => sites.getSiteHostname('theglobe')), (err) => err.name === 'NeonEnvConfigError' && err.statusCode === 501);
});
