'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const fo = require('../../src/helpers/neon-env/fo-sites.js');
const DEMORC = require('./fixtures/fo-sites-demorc.json');

function env(id, overrides = {}) {
  return {
    id,
    neon: { insecureTls: false, fo: { url: `https://neon-fo-${id}.example.com`, apiKey: `fo-${id}`, host: `neon-fo-${id}.example.com` } },
    ...overrides,
  };
}
const A = env('a');
const B = env('b');

let calls;
function stub(responder) {
  calls = [];
  fo.__setHttpForTest(async (config, e) => {
    calls.push({ config, envId: e.id });
    return responder(config, e, calls.length);
  });
}
const ok = (data) => ({ status: 200, data });
const inA = (fn) => context.run(A, fn);

beforeEach(() => {
  fo.clearSiteCache();
  fo.__setNowForTest(null);
  stub(() => ok(DEMORC));
});

test('listSites requests <fo.url>/api/sites/live?siteMap=false with the FO key and timeout', async () => {
  await inA(() => fo.listSites());
  assert.equal(calls.length, 1);
  const { config } = calls[0];
  assert.equal(config.method, 'get');
  assert.equal(config.url, 'https://neon-fo-a.example.com/api/sites/live');
  assert.deepEqual(config.params, { siteMap: false });
  assert.equal(config.headers['neon-fo-access-key'], 'fo-a');
  assert.equal(config.timeout, 10000);
});

test('trailing slash in fo.url does not produce a double slash', async () => {
  const slashed = env('s', { neon: { insecureTls: false, fo: { url: 'https://neon-fo-s.example.com/', apiKey: 'k' } } });
  await context.run(slashed, () => fo.listSites());
  assert.equal(calls[0].config.url, 'https://neon-fo-s.example.com/api/sites/live');
});

test('normalizes sites: label, publicUrl trimmed, https api urls', async () => {
  const sites = await inA(() => fo.listSites());
  assert.deepEqual(sites.map((s) => s.name), ['NextFrontier', 'SportsArena', 'TheGlobe']);
  const globe = sites[2];
  assert.equal(globe.label, 'The Globe');
  assert.equal(globe.id, '4081-6ae2db5a299f-683d6269f078-2000');
  assert.equal(globe.publicUrl, 'https://theglobe-demorc.sites.neap.eidosmedia.io');
  assert.deepEqual(globe.apiUrls, {
    live: 'https://theglobe-demorc-site.sites.neap.eidosmedia.io',
    stage: 'https://theglobe-stage-demorc-site.sites.neap.eidosmedia.io',
    preview: 'https://theglobe-preview-demorc-site.sites.neap.eidosmedia.io',
  });
});

test('label falls back to title then name; api host with scheme is kept; items without root.name skipped', async () => {
  stub(() => ok([
    { root: { name: 'X', title: 'Ex', hostname: 'https://x.example.com' }, apiHostnames: { liveHostname: 'http://x-api.example.com/' } },
    { root: { name: 'Y' } },
    { root: { title: 'nameless' } },
    null,
  ]));
  const sites = await inA(() => fo.listSites());
  assert.deepEqual(sites.map((s) => [s.name, s.label]), [['X', 'Ex'], ['Y', 'Y']]);
  assert.equal(sites[0].apiUrls.live, 'http://x-api.example.com');
  assert.deepEqual(sites[1].apiUrls, {});
});

test('cache: second call within TTL does not refetch; after TTL it does', async () => {
  let t = 1_000_000;
  fo.__setNowForTest(() => t);
  await inA(() => fo.listSites());
  await inA(() => fo.listSites());
  assert.equal(calls.length, 1);
  t += fo.CACHE_TTL_MS + 1;
  await inA(() => fo.listSites());
  assert.equal(calls.length, 2);
});

test('refresh: true bypasses the cache', async () => {
  await inA(() => fo.listSites());
  await inA(() => fo.listSites({ refresh: true }));
  assert.equal(calls.length, 2);
});

test('cache is per env: env b never sees env a sites', async () => {
  stub((config, e) => ok(e.id === 'a' ? DEMORC.slice(0, 1) : DEMORC.slice(2)));
  const a = await inA(() => fo.listSites());
  const b = await context.run(B, () => fo.listSites());
  assert.deepEqual(a.map((s) => s.name), ['NextFrontier']);
  assert.deepEqual(b.map((s) => s.name), ['TheGlobe']);
});

test('failed fetch -> 502 with status, and is not cached', async () => {
  stub((config, e, n) => {
    if (n === 1) { const err = new Error('boom'); err.response = { status: 503 }; throw err; }
    return ok(DEMORC);
  });
  await assert.rejects(() => inA(() => fo.listSites()), (err) => err.name === 'NeonEnvConfigError' && err.statusCode === 502 && /unavailable for env a: 503/.test(err.message));
  const sites = await inA(() => fo.listSites());
  assert.equal(sites.length, 3);
  assert.equal(calls.length, 2);
});

test('network error without response -> 502 with error code', async () => {
  stub(() => { const err = new Error('getaddrinfo'); err.code = 'ENOTFOUND'; throw err; });
  await assert.rejects(() => inA(() => fo.listSites()), /unavailable for env a: ENOTFOUND/);
});

test('non-2xx resolved response -> 502', async () => {
  stub(() => ({ status: 404, data: '<html>' }));
  await assert.rejects(() => inA(() => fo.listSites()), (err) => err.statusCode === 502 && /: 404/.test(err.message));
});

test('non-array body -> 502 unexpected shape', async () => {
  stub(() => ok({ sites: [] }));
  await assert.rejects(() => inA(() => fo.listSites()), (err) => err.statusCode === 502 && /unexpected shape/.test(err.message));
});

test('env without fo -> 501', async () => {
  const noFo = env('n', { neon: { insecureTls: false, fo: null } });
  await assert.rejects(() => context.run(noFo, () => fo.listSites()), (err) => err.statusCode === 501 && /FO not configured for env n/.test(err.message));
});

test('getSite matches case-insensitively', async () => {
  for (const name of ['TheGlobe', 'theglobe', 'THEGLOBE']) {
    const site = await inA(() => fo.getSite(name));
    assert.equal(site.name, 'TheGlobe');
  }
  assert.equal(calls.length, 1);
});

test('getSite miss refreshes once, then finds a newly added site', async () => {
  stub((config, e, n) => ok(n === 1 ? DEMORC.slice(0, 2) : DEMORC));
  const site = await inA(() => fo.getSite('TheGlobe'));
  assert.equal(site.name, 'TheGlobe');
  assert.equal(calls.length, 2);
});

test('getSite unknown -> 404 listing available sites, after exactly one refresh', async () => {
  await assert.rejects(
    () => inA(() => fo.getSite('Nope')),
    (err) => err.statusCode === 404 && err.message === "site 'Nope' not found in env a (available: NextFrontier, SportsArena, TheGlobe)"
  );
  assert.equal(calls.length, 2);
});

test('apiUrl returns the stage api host; stage is case-insensitive', async () => {
  assert.equal(await inA(() => fo.apiUrl('theglobe')), 'https://theglobe-demorc-site.sites.neap.eidosmedia.io');
  assert.equal(await inA(() => fo.apiUrl('theglobe', 'PREVIEW')), 'https://theglobe-preview-demorc-site.sites.neap.eidosmedia.io');
});

test('apiUrl for a site without that stage host -> 404 (site still listed)', async () => {
  stub(() => ok([{ root: { name: 'Bare', hostname: 'https://bare.example.com' } }]));
  const sites = await inA(() => fo.listSites());
  assert.equal(sites[0].name, 'Bare');
  await assert.rejects(() => inA(() => fo.apiUrl('Bare', 'live')), (err) => err.statusCode === 404 && err.message === "site 'Bare' in env a has no live API host");
});

test('siteFromModel: rootData.pubInfo.siteName first', async () => {
  const name = await inA(() => fo.siteFromModel({ rootData: { pubInfo: { siteName: 'SportsArena' } }, model: { pubInfo: { siteName: 'TheGlobe' } } }));
  assert.equal(name, 'SportsArena');
  assert.equal(calls.length, 0);
});

test('siteFromModel: model.pubInfo.siteName, then pubInfo.siteName', async () => {
  assert.equal(await inA(() => fo.siteFromModel({ model: { pubInfo: { siteName: 'TheGlobe' } } })), 'TheGlobe');
  assert.equal(await inA(() => fo.siteFromModel({ pubInfo: { siteName: 'NextFrontier' } })), 'NextFrontier');
});

test('siteFromModel: single rootData.pubInfoEx key', async () => {
  assert.equal(await inA(() => fo.siteFromModel({ rootData: { pubInfoEx: { TheGlobe: {} } } })), 'TheGlobe');
});

test('siteFromModel: env with exactly one site', async () => {
  stub(() => ok(DEMORC.slice(2)));
  assert.equal(await inA(() => fo.siteFromModel({})), 'TheGlobe');
});

test('siteFromModel: ambiguous -> 400 listing sites', async () => {
  await assert.rejects(
    () => inA(() => fo.siteFromModel({ rootData: { pubInfoEx: { A: {}, B: {} } } })),
    (err) => err.statusCode === 400 && err.message === 'cannot determine site for env a: payload has no pubInfo.siteName (available: NextFrontier, SportsArena, TheGlobe)'
  );
});

test('foRequest adds FO key and timeout, keeps caller headers', async () => {
  await inA(() => fo.foRequest({ method: 'get', url: 'https://h/api/nodes/1', headers: { Accept: 'image/*' } }));
  assert.equal(calls[0].config.headers['neon-fo-access-key'], 'fo-a');
  assert.equal(calls[0].config.headers.Accept, 'image/*');
  assert.equal(calls[0].config.timeout, 10000);
});

test('buildAxiosConfig: TLS agent only when insecureTls', () => {
  assert.equal(fo.buildAxiosConfig({ url: 'u' }, A).httpsAgent, undefined);
  const insecure = env('i', { neon: { insecureTls: true, fo: A.neon.fo } });
  const cfg = fo.buildAxiosConfig({ url: 'u' }, insecure);
  assert.equal(cfg.httpsAgent.options.rejectUnauthorized, false);
  assert.equal(cfg.url, 'u');
});
