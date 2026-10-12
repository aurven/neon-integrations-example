'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const neonApi = require('../../src/helpers/neon-bo-api-v3.js');

function stubbedClient(responseData = { ok: true }) {
  const client = new neonApi.NeonClient({ baseUrl: 'https://neon-bo.example.com/api', apiKey: 'bo-key', userApiKey: 'user-key' });
  const calls = [];
  client.client.request = async (config) => {
    calls.push(config);
    return { status: 200, data: responseData };
  };
  return { client, calls };
}

async function callOf(invoke, responseData) {
  const { client, calls } = stubbedClient(responseData);
  const result = await invoke(client);
  assert.equal(calls.length, 1);
  const { method, url, params, data, baseURL } = calls[0];
  assert.equal(baseURL, 'https://neon-bo.example.com/api');
  return { method, url, params, data, result };
}

test('getSites() without options sends no query and still returns result', async () => {
  const c = await callOf((n) => n.getSites(), { result: [{ name: 'TheGlobe' }] });
  assert.equal(c.method, 'get');
  assert.equal(c.url, '/core/sites');
  assert.deepEqual(c.params, {});
  assert.deepEqual(c.result, [{ name: 'TheGlobe' }]);
});

test('getSites({ limit, offset }) pages', async () => {
  const c = await callOf((n) => n.getSites({ limit: 20, offset: 40 }), { result: [] });
  assert.deepEqual(c.params, { limit: 20, offset: 40 });
});

test('createSite posts the SiteForCreate body', async () => {
  const site = { name: 'thenews', title: 'The News', liveHostname: 'thenews.example.com' };
  const c = await callOf((n) => n.createSite(site));
  assert.deepEqual({ method: c.method, url: c.url, data: c.data }, { method: 'post', url: '/core/sites/create', data: site });
  assert.deepEqual(c.result, { ok: true });
});

test('cloneSite posts the CloneSiteRequest, dropping unset fields', async () => {
  const c = await callOf((n) => n.cloneSite({ sourceSiteName: 'TheGlobe', targetSiteName: 'TheGlobe2' }));
  assert.deepEqual({ method: c.method, url: c.url, data: c.data }, {
    method: 'post',
    url: '/core/sites/clone',
    data: { sourceSiteName: 'TheGlobe', targetSiteName: 'TheGlobe2' },
  });
  const full = await callOf((n) => n.cloneSite({ sourceSiteName: 'A', targetSiteName: 'B', viewStatus: 'LIVE', targetHost: 'b.example.com' }));
  assert.deepEqual(full.data, { sourceSiteName: 'A', targetSiteName: 'B', viewStatus: 'LIVE', targetHost: 'b.example.com' });
});

test('getSitemap uses the v2 path, defaults to LIVE and encodes the site name', async () => {
  const live = await callOf((n) => n.getSitemap('TheGlobe'));
  assert.deepEqual({ method: live.method, url: live.url }, { method: 'get', url: '/core/v2/sites/TheGlobe/LIVE/sitemap' });
  const preview = await callOf((n) => n.getSitemap('The Globe/IT', 'preview'));
  assert.equal(preview.url, '/core/v2/sites/The%20Globe%2FIT/PREVIEW/sitemap');
});

test('createSiteNode posts the NodeForCreate body without a realm query', async () => {
  const node = { name: 'politics', path: '/politics/', title: 'Politics', siteName: 'TheGlobe', parentId: 'root-1' };
  const c = await callOf((n) => n.createSiteNode(node));
  assert.deepEqual({ method: c.method, url: c.url, params: c.params, data: c.data }, {
    method: 'post', url: '/core/sites/nodes/create', params: undefined, data: node,
  });
});

test('existing createNewSiteNode keeps its realm query', async () => {
  const c = await callOf((n) => n.createNewSiteNode({ name: 'x' }), { id: 'node-1' });
  assert.equal(c.url, '/core/sites/nodes/create?realm=default');
  assert.equal(c.result, 'node-1');
});

test('required fields and viewStatus are validated before any request', async () => {
  const { client, calls } = stubbedClient();
  await assert.rejects(() => client.createSite(), /siteForCreate is required/);
  await assert.rejects(() => client.createSite({ name: 'x' }), /siteForCreate\.title is required/);
  await assert.rejects(() => client.createSite({ title: 'X' }), /siteForCreate\.name is required/);
  await assert.rejects(() => client.cloneSite({ sourceSiteName: 'A' }), /targetSiteName is required/);
  await assert.rejects(() => client.cloneSite(), /sourceSiteName is required/);
  await assert.rejects(() => client.getSitemap(), /siteName is required/);
  await assert.rejects(() => client.getSitemap('TheGlobe', 'DRAFT'), /viewStatus must be one of PREVIEW, STAGE, LIVE/);
  await assert.rejects(() => client.createSiteNode({ name: 'n', title: 'T' }), /nodeForCreate\.path is required/);
  assert.equal(calls.length, 0);
});

test('flat exports exist for the new site methods', () => {
  for (const name of ['getSites', 'createSite', 'cloneSite', 'getSitemap', 'createSiteNode']) {
    assert.equal(typeof neonApi[name], 'function', `missing flat export ${name}`);
  }
});
