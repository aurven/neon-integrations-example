# Front Office Site Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written per-site front-office (FO) URLs and hard-coded hosts with sites discovered from `GET <fo.url>/api/sites/live?siteMap=false`.

**Architecture:**
- A new `src/helpers/neon-env/fo-sites.js` fetches, normalizes and caches the site catalog for each request environment. It exposes `listSites`, `getSite`, `apiUrl`, `siteFromModel` and a shared `foRequest`.
- The registry stores a single `neon.fo = { url, apiKey, host }`.
- `sites-helpers.js`, `mailjet.js` and `/services` consume the catalog. The Méthode image import keeps its call shape.

**Tech Stack:** Node 20, Fastify 4, axios, `node:test` + `node:assert/strict`, AsyncLocalStorage env context (`src/helpers/neon-env/context.js`).

**Spec:** `docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md`. It builds on `docs/superpowers/specs/2026-09-30-multi-neon-env-design.md`.

## Global Constraints

- **Site list endpoint:** `GET <fo.url>/api/sites/live` with query `siteMap=false` and header `neon-fo-access-key: <fo.apiKey>`.
- **Request timeout:** 10000 ms.
- **Site catalog cache:** in memory, per env id, TTL 10 minutes. A failed fetch is never cached. A lookup miss triggers exactly one refresh.
- **TLS:** certificate verification is ON unless `env.neon.insecureTls === true`.
- **Site normalization:**
  - `name` = `root.name`
  - `label` = `root.staticAttributes.sitelabel || root.title || root.name`
  - `id` = `root.id`
  - `publicUrl` = `root.hostname`, trailing slash removed
  - `apiUrls.{live,stage,preview}` = `https://` + `apiHostnames.{live,stage,preview}Hostname`; a value that already has an http(s) scheme is kept; a missing hostname means the key is absent
- **Site name matching** is case-insensitive.
- **Error statuses** (all `NeonEnvConfigError`, with these exact messages):
  - 501 `FO not configured for env <id>`
  - 502 `FO site list unavailable for env <id>: <status|code>`
  - 502 `FO site list for env <id> has unexpected shape`
  - 404 `site '<name>' not found in env <id> (available: A, B)`
  - 404 `site '<name>' in env <id> has no <stage> API host`
  - 400 `cannot determine site for env <id>: payload has no pubInfo.siteName (available: …)`
- **Hard-coding removed:** no `'theglobe'` literal and no `eks-dev` host may remain in `src/mailjet/mailjet.js` or `src/helpers/sites-helpers.js`.
- **`neon.fo.sites`** is ignored with a registry warning; the entry stays valid.
- **Legacy mode:** `NEON_FO_URL` + `NEON_FO_APIKEY` replace the per-site `NEON_FO_*_URL` vars.
- **Tests** never touch the network. HTTP goes through the `fo-sites` test seam `__setHttpForTest`.
- **Workflow:** work on branch `develop` in worktree `.claude/worktrees/develop`. Commit per task. Do not push. Baseline `npm test` = 152/152.

## Review Focus

1. **A trailing slash in `fo.url`** (e.g. `https://neon-fo-x/`) must still request `https://neon-fo-x/api/sites/live` with no `//`. Covered by a test in Task 1.
2. **Different case in the payload** (`THEGLOBE`, `theglobe`) must resolve to `TheGlobe`. Covered by a test in Task 1.
3. **A site item without `apiHostnames`** must still be listed. `apiUrl(name, stage)` then gives a clean 404, not a crash. Covered by a test in Task 1.
4. **Two envs used one after the other** must never see each other's cached sites. Covered by a test in Task 1.
5. **FO node lookup network errors** (no `error.response`) must return `undefined` and log, not throw a `TypeError`. Covered by a test in Task 2.

---

## File Structure

- **Create:**
  - `src/helpers/neon-env/fo-sites.js`: site catalog, FO request helper and test seams
  - `test/neon-env/fixtures/fo-sites-demorc.json`: trimmed `/api/sites/live` response
  - `test/neon-env/fo-sites.test.js`
  - `test/neon-env/mailjet-site.test.js`
- **Modify:**
  - `src/helpers/neon-env/registry.js` (FO validation, normalization, legacy FO, warnings)
  - `test/neon-env/fixtures.js`
  - `test/neon-env/registry.test.js`
  - `src/helpers/sites-helpers.js` (rewrite onto fo-sites)
  - `test/neon-env/sites-helpers.test.js` (rewrite)
  - `src/mailjet/mailjet.js`
  - `src/helpers/neon-env/services-view.js`, `test/neon-env/services-view.test.js`, `server.js` (`/services`), `src/pages/services-dashboard.hbs`
  - `config/neon-environments.example.json`, `.env.example`, `README.md`

---

### Task 1: Site catalog module (`fo-sites.js`)

**Files:**
- Create: `src/helpers/neon-env/fo-sites.js`, `test/neon-env/fixtures/fo-sites-demorc.json`, `test/neon-env/fo-sites.test.js`

**Interfaces:**
- **Consumes:**
  - `requireEnv()` from `src/helpers/neon-env/context.js` (throws `NoNeonEnvError` outside a context)
  - `run(env, fn)` from the same file
  - `NeonEnvConfigError(message, statusCode)` from `src/helpers/neon-env/errors.js`
  - Env shape used here: `{ id, neon: { insecureTls, fo: { url, apiKey, host } | null } }`
- **Produces** (`module.exports`):
  - `listSites({ refresh } = {}) → Promise<Site[]>`
  - `getSite(name) → Promise<Site>`
  - `apiUrl(siteName, stage = 'live') → Promise<string>`
  - `siteFromModel(neonModel) → Promise<string>`
  - `foRequest(axiosConfig) → Promise<{ status, data }>`: adds the FO key header and the 10000 ms timeout, and uses the env's TLS policy
  - `buildAxiosConfig(config, env) → object` (pure; used by the default HTTP)
  - `clearSiteCache()`
  - `__setHttpForTest(fn | null)`, where `fn(config, env) → Promise<{ status, data }>`
  - `__setNowForTest(fn | null)`
  - `CACHE_TTL_MS`
  - `Site = { name, label, id, publicUrl, apiUrls: { live?, stage?, preview? } }`

- [ ] **Step 1: Create the fixture `test/neon-env/fixtures/fo-sites-demorc.json`**

```json
[
  {
    "root": {
      "nodeType": "siteRootNode",
      "id": "4081-5a4c9e3d0b22-9288ec8303bc-2000",
      "name": "NextFrontier",
      "title": "NextFrontier",
      "hostname": "https://nextfrontier-demorc.sites.neap.eidosmedia.io",
      "staticAttributes": { "sitelabel": "Next Frontier" }
    },
    "nodes": {},
    "apiHostnames": {
      "liveHostname": "nextfrontier-demorc-site.sites.neap.eidosmedia.io",
      "stageHostname": "nextfrontier-stage-demorc-site.sites.neap.eidosmedia.io",
      "previewHostname": "nextfrontier-preview-demorc-site.sites.neap.eidosmedia.io"
    }
  },
  {
    "root": {
      "nodeType": "siteRootNode",
      "id": "401c-ff374c9adf0f-95777f25901b-2000",
      "name": "SportsArena",
      "title": "SportsArena",
      "hostname": "https://sportsarena-demorc.sites.neap.eidosmedia.io",
      "staticAttributes": { "sitelabel": "Sports Arena" }
    },
    "nodes": {},
    "apiHostnames": {
      "liveHostname": "sportsarena-demorc-site.sites.neap.eidosmedia.io",
      "stageHostname": "sportsarena-stage-demorc-site.sites.neap.eidosmedia.io",
      "previewHostname": "sportsarena-preview-demorc-site.sites.neap.eidosmedia.io"
    }
  },
  {
    "root": {
      "nodeType": "siteRootNode",
      "id": "4081-6ae2db5a299f-683d6269f078-2000",
      "name": "TheGlobe",
      "title": "TheGlobe",
      "hostname": "https://theglobe-demorc.sites.neap.eidosmedia.io/",
      "staticAttributes": { "sitelabel": "The Globe" }
    },
    "nodes": {},
    "apiHostnames": {
      "liveHostname": "theglobe-demorc-site.sites.neap.eidosmedia.io",
      "stageHostname": "theglobe-stage-demorc-site.sites.neap.eidosmedia.io",
      "previewHostname": "theglobe-preview-demorc-site.sites.neap.eidosmedia.io"
    }
  }
]
```
(TheGlobe's hostname deliberately has a trailing slash, to test trimming.)

- [ ] **Step 2: Write the failing tests `test/neon-env/fo-sites.test.js`**

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/neon-env/fo-sites.test.js`
Expected: FAIL with `Cannot find module '../../src/helpers/neon-env/fo-sites.js'`

- [ ] **Step 4: Implement `src/helpers/neon-env/fo-sites.js`**

```js
'use strict';
/**
 * Front Office site catalog, discovered from GET <fo.url>/api/sites/live?siteMap=false.
 * Spec: docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md §2
 */
const https = require('https');
const axios = require('axios');
const { requireEnv } = require('./context.js');
const { NeonEnvConfigError } = require('./errors.js');

const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10000;
const STAGES = ['live', 'stage', 'preview'];

const cache = new Map(); // envId -> { at, sites }

function buildAxiosConfig(config, env) {
  const out = { ...config };
  if (env.neon.insecureTls === true) out.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  return out;
}

function defaultHttp(config, env) {
  return axios.request(buildAxiosConfig(config, env));
}

let http = defaultHttp;
let now = () => Date.now();

function foConfig(env) {
  if (!env.neon.fo) throw new NeonEnvConfigError(`FO not configured for env ${env.id}`, 501);
  return env.neon.fo;
}

function trimSlash(url) {
  return String(url).replace(/\/+$/, '');
}

function foRequest(config) {
  const env = requireEnv();
  const fo = foConfig(env);
  return http({
    timeout: TIMEOUT_MS,
    ...config,
    headers: { ...(config.headers || {}), 'neon-fo-access-key': fo.apiKey },
  }, env);
}

function withScheme(host) {
  if (!host) return undefined;
  const h = trimSlash(host);
  return /^https?:\/\//i.test(h) ? h : `https://${h}`;
}

function normalizeSite(item) {
  const root = item && item.root;
  if (!root || !root.name) return null;
  const api = item.apiHostnames || {};
  const apiUrls = {};
  for (const stage of STAGES) {
    const url = withScheme(api[`${stage}Hostname`]);
    if (url) apiUrls[stage] = url;
  }
  return {
    name: root.name,
    label: (root.staticAttributes && root.staticAttributes.sitelabel) || root.title || root.name,
    id: root.id,
    publicUrl: root.hostname ? trimSlash(root.hostname) : undefined,
    apiUrls,
  };
}

async function listSites({ refresh = false } = {}) {
  const env = requireEnv();
  const fo = foConfig(env);
  const hit = cache.get(env.id);
  if (!refresh && hit && now() - hit.at < CACHE_TTL_MS) return hit.sites;

  let res;
  try {
    res = await foRequest({ method: 'get', url: `${trimSlash(fo.url)}/api/sites/live`, params: { siteMap: false } });
  } catch (error) {
    const reason = (error.response && error.response.status) || error.code || error.message;
    throw new NeonEnvConfigError(`FO site list unavailable for env ${env.id}: ${reason}`, 502);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new NeonEnvConfigError(`FO site list unavailable for env ${env.id}: ${res.status}`, 502);
  }
  if (!Array.isArray(res.data)) {
    throw new NeonEnvConfigError(`FO site list for env ${env.id} has unexpected shape`, 502);
  }
  const sites = res.data.map(normalizeSite).filter(Boolean);
  cache.set(env.id, { at: now(), sites });
  return sites;
}

function findSite(sites, name) {
  const wanted = String(name || '').toLowerCase();
  return sites.find((s) => s.name.toLowerCase() === wanted) || null;
}

function names(sites) {
  return sites.map((s) => s.name).join(', ');
}

async function getSite(name) {
  const env = requireEnv();
  let sites = await listSites();
  let site = findSite(sites, name);
  if (!site) {
    sites = await listSites({ refresh: true });
    site = findSite(sites, name);
  }
  if (!site) throw new NeonEnvConfigError(`site '${name}' not found in env ${env.id} (available: ${names(sites)})`, 404);
  return site;
}

async function apiUrl(siteName, stage = 'live') {
  const env = requireEnv();
  const site = await getSite(siteName);
  const key = String(stage).toLowerCase();
  const url = site.apiUrls[key];
  if (!url) throw new NeonEnvConfigError(`site '${site.name}' in env ${env.id} has no ${key} API host`, 404);
  return url;
}

async function siteFromModel(neonModel) {
  const env = requireEnv();
  const m = neonModel || {};
  const direct = [m.rootData?.pubInfo?.siteName, m.model?.pubInfo?.siteName, m.pubInfo?.siteName]
    .find((v) => typeof v === 'string' && v.length > 0);
  if (direct) return direct;

  const ex = m.rootData?.pubInfoEx;
  if (ex && typeof ex === 'object') {
    const keys = Object.keys(ex);
    if (keys.length === 1) return keys[0];
  }

  const sites = await listSites();
  if (sites.length === 1) return sites[0].name;
  throw new NeonEnvConfigError(`cannot determine site for env ${env.id}: payload has no pubInfo.siteName (available: ${names(sites)})`, 400);
}

function clearSiteCache() {
  cache.clear();
}

function __setHttpForTest(fn) {
  http = fn || defaultHttp;
}

function __setNowForTest(fn) {
  now = fn || (() => Date.now());
}

module.exports = {
  CACHE_TTL_MS,
  listSites,
  getSite,
  apiUrl,
  siteFromModel,
  foRequest,
  buildAxiosConfig,
  clearSiteCache,
  __setHttpForTest,
  __setNowForTest,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/neon-env/fo-sites.test.js`
Expected: PASS (24 tests). Then run `npm test`; expected: all pass (152 + 24).

- [ ] **Step 6: Commit**

```bash
git add src/helpers/neon-env/fo-sites.js test/neon-env/fo-sites.test.js test/neon-env/fixtures/fo-sites-demorc.json
git commit -m "feat(neon-env): front office site catalog from /api/sites/live"
```

---

### Task 2: Registry `fo.url` schema + `sites-helpers` on the catalog

These two change together. The fixture switches from `fo.sites` to `fo.url`, which breaks the old `getFrontOfficeUrl`, so both land in one task.

**Files:**
- Modify: `src/helpers/neon-env/registry.js`, `test/neon-env/fixtures.js`, `test/neon-env/registry.test.js`, `src/helpers/sites-helpers.js`
- Rewrite: `test/neon-env/sites-helpers.test.js`

**Interfaces:**
- **Consumes** from Task 1: `getSite`, `apiUrl`, `foRequest`, `clearSiteCache`, `__setHttpForTest`, and the fixture `test/neon-env/fixtures/fo-sites-demorc.json`.
- **Produces:**
  - Normalized `Env.neon.fo = { url, apiKey, host } | null`; there is no `sites` key any more.
  - `sites-helpers` exports `getSiteHostname(siteName, environment='live') → Promise<string>`, `getNodeById({ siteName, targetId, environment='live' }) → Promise<object|undefined>`, `getResource({ siteName, url, environment='live' }) → Promise<stream|undefined>` and `getResourceById({ siteName, targetId, environment='live' }) → Promise<{ node, data }>`.
  - `getFrontOfficeUrl` is removed.

- [ ] **Step 1: Update the fixture `test/neon-env/fixtures.js`**

Replace the `fo:` line with:
```js
      fo: { url: `https://neon-fo-${id}.example.com`, apiKey: `fo-${id}` },
```

- [ ] **Step 2: Update and add registry tests (`test/neon-env/registry.test.js`)**

In the test `'legacy fallback builds one default env from env vars'`, make two edits:
- Replace the env var line `NEON_FO_APIKEY: 'fo', NEON_FO_THEGLOBE_LIVE_URL: 'https://fo.local', NEON_FO_THEGLOBE_PREVIEW_URL: 'https://fo-prev.local',` with
  ```js
      NEON_FO_APIKEY: 'fo', NEON_FO_URL: 'https://fo.local/',
  ```
- Replace `assert.equal(env.neon.fo.sites.theglobe.preview, 'https://fo-prev.local');` with
  ```js
  assert.deepEqual(env.neon.fo, { url: 'https://fo.local', apiKey: 'fo', host: 'fo.local' });
  ```

Append these tests:
```js
test('neon.fo is normalized to { url, apiKey, host } with trailing slash trimmed', () => {
  const reg = buildRegistry({ json: registryJson([envJson('a', { neon: { ...envJson('a').neon, fo: { url: 'https://neon-fo-a.example.com/', apiKey: 'k' } } })]), envVars: {} });
  assert.deepEqual(reg.get('a').neon.fo, { url: 'https://neon-fo-a.example.com', apiKey: 'k', host: 'neon-fo-a.example.com' });
});

test('neon.fo without a valid http(s) url -> entry skipped', () => {
  const noUrl = envJson('nourl', { neon: { ...envJson('nourl').neon, fo: { apiKey: 'k' } } });
  const badUrl = envJson('badurl', { neon: { ...envJson('badurl').neon, fo: { url: 'ftp://x', apiKey: 'k' } } });
  const reg = buildRegistry({ json: registryJson([noUrl, badUrl, envJson('ok')]), envVars: {} });
  assert.deepEqual(reg.ids(), ['ok']);
  assert.ok(reg.skipped.every((s) => /neon\.fo\.url/.test(s.reason)));
});

test('neon.fo.sites is ignored with a warning; entry kept', () => {
  const withSites = envJson('a', { neon: { ...envJson('a').neon, fo: { url: 'https://neon-fo-a.example.com', apiKey: 'k', sites: { theglobe: { live: 'https://x' } } } } });
  const reg = buildRegistry({ json: registryJson([withSites]), envVars: {} });
  assert.deepEqual(reg.ids(), ['a']);
  assert.equal(reg.get('a').neon.fo.sites, undefined);
  assert.ok(reg.warnings.some((w) => w === 'env a: neon.fo.sites ignored; sites come from https://neon-fo-a.example.com/api/sites/live'));
});

test('legacy with only one of NEON_FO_URL / NEON_FO_APIKEY -> fo null + warning', () => {
  const onlyKey = buildRegistry({ json: null, envVars: { NEON_FO_APIKEY: 'fo' } });
  assert.equal(onlyKey.get('legacy').neon.fo, null);
  assert.ok(onlyKey.warnings.some((w) => /NEON_FO_URL is missing/.test(w)));
  const onlyUrl = buildRegistry({ json: null, envVars: { NEON_FO_URL: 'https://fo.local' } });
  assert.equal(onlyUrl.get('legacy').neon.fo, null);
  assert.ok(onlyUrl.warnings.some((w) => /NEON_FO_APIKEY is missing/.test(w)));
});

test('legacy per-site NEON_FO_*_URL vars are no longer read', () => {
  const reg = buildRegistry({ json: null, envVars: { NEON_FO_THEGLOBE_LIVE_URL: 'https://x' } });
  assert.equal(reg.get('legacy').neon.fo, null);
});
```

- [ ] **Step 3: Rewrite `test/neon-env/sites-helpers.test.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `node --test test/neon-env/registry.test.js test/neon-env/sites-helpers.test.js`
Expected: FAIL. The new registry tests fail (fixture entries with `fo.url` and no `sites` are skipped by the current validator), and the sites-helpers tests fail (`getFrontOfficeUrl` still exists; no catalog calls).

- [ ] **Step 5: Implement the registry changes (`src/helpers/neon-env/registry.js`)**

5a. Delete the constant `LEGACY_FO_RE` and the function `lowerKeys`. In `LEGACY_VARS`, add `'NEON_FO_URL'`:
```js
const LEGACY_VARS = ['NEON_BO_URL', 'NEON_BO_APIKEY', 'NEON_USER_API_KEY', 'NEON_APP_URL', 'NEON_FO_APIKEY', 'NEON_FO_URL'];
```

5b. Add this helper below `hostOf`:
```js
function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
```

5c. In `validateEntry`, replace the `if (neon.fo !== undefined) { … }` block with:
```js
  if (neon.fo !== undefined) {
    if (!isNonEmptyString(neon.fo?.apiKey)) errors.push('neon.fo.apiKey is required when neon.fo is set');
    if (!isNonEmptyString(neon.fo?.url) || !isHttpUrl(neon.fo.url)) errors.push('neon.fo.url must be an http(s) URL when neon.fo is set');
  }
```

5d. In `normalize`, replace the `fo:` line with:
```js
      fo: raw.neon.fo
        ? { url: raw.neon.fo.url.replace(/\/+$/, ''), apiKey: raw.neon.fo.apiKey, host: hostOf(raw.neon.fo.url) }
        : null,
```

5e. In `buildRegistry`, inside the `json.environments.forEach` loop, after `const errors = validateEntry(resolved); if (errors.length) { … return; }` and before `envs.push(...)`, add:
```js
    if (resolved.neon.fo && resolved.neon.fo.sites !== undefined) {
      warnings.push(`env ${resolved.id}: neon.fo.sites ignored; sites come from ${resolved.neon.fo.url.replace(/\/+$/, '')}/api/sites/live`);
    }
```

5f. Change `buildLegacyEnv(envVars)` to `buildLegacyEnv(envVars, warnings)`. Delete its per-site loop and the `hasFo` line. Before `return {`, add:
```js
  let fo = null;
  if (envVars.NEON_FO_URL && envVars.NEON_FO_APIKEY) {
    fo = { url: envVars.NEON_FO_URL.replace(/\/+$/, ''), apiKey: envVars.NEON_FO_APIKEY, host: hostOf(envVars.NEON_FO_URL) };
  } else if (envVars.NEON_FO_URL || envVars.NEON_FO_APIKEY) {
    warnings.push(`legacy FO not configured: ${envVars.NEON_FO_URL ? 'NEON_FO_APIKEY' : 'NEON_FO_URL'} is missing`);
  }
```
Then replace the `fo:` line inside the returned `neon` object with `fo,`.

5g. In the legacy branch of `buildRegistry` (`if (json === null || json === undefined) {`), replace the `return new Registry({ … })` with:
```js
    const warnings = [];
    return new Registry({
      environments: [buildLegacyEnv(envVars, warnings)],
      adminApiKey: envVars.NEON_EXT_APIKEY || null,
      source: 'legacy',
      warnings,
    });
```

5h. Check: `grep -n "sites\|LEGACY_FO_RE\|lowerKeys" src/helpers/neon-env/registry.js` should print only the warning line from 5e.

- [ ] **Step 6: Rewrite `src/helpers/sites-helpers.js`**

```js
'use strict';
/**
 * Front Office helpers. Sites, public hostnames and per-stage API hosts come from the
 * env's FO site catalog (src/helpers/neon-env/fo-sites.js), never from hard-coded URLs.
 * Spec: docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md §3
 */
const { requireEnv } = require('./neon-env/context.js');
const { getSite, apiUrl, foRequest } = require('./neon-env/fo-sites.js');

function logFoError(where, error) {
  console.error(`[${where}] ❌ ERROR: ${(error.response && error.response.status) || error.code || error.message}`);
  if (error.response && error.response.data) console.error(JSON.stringify(error.response.data));
}

/**
 * Public hostname (with scheme) of a site, e.g. https://theglobe-demorc.sites.neap.eidosmedia.io.
 * Only live public hostnames are exposed by the FO; other stages return the live one.
 */
async function getSiteHostname(siteName, environment = 'live') {
  if (String(environment).toLowerCase() !== 'live') {
    console.warn(`[getSiteHostname] only live public hostnames are exposed; returning live hostname for ${siteName} (${environment} requested)`);
  }
  const site = await getSite(siteName);
  console.log(`[getSiteHostname] env=${requireEnv().id} site=${site.name} -> ${site.publicUrl}`);
  return site.publicUrl;
}

async function getNodeById({ siteName, targetId, environment = 'live' }) {
  const base = await apiUrl(siteName, environment);
  console.log(`[getNodeById] env=${requireEnv().id} site=${siteName} stage=${environment} id=${targetId}`);
  try {
    const response = await foRequest({
      method: 'get',
      url: `${base}/api/nodes/${targetId}`,
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    logFoError('getNodeById', error);
    return undefined;
  }
}

async function getResource({ siteName, url, environment = 'live' }) {
  const base = await apiUrl(siteName, environment);
  console.log(`[getResource] env=${requireEnv().id} site=${siteName} stage=${environment} url=${url}`);
  try {
    const response = await foRequest({
      method: 'get',
      url: `${base}${url}`,
      responseType: 'stream',
      headers: { Accept: 'image/*' },
    });
    return response.data;
  } catch (error) {
    logFoError('getResource', error);
    return undefined;
  }
}

async function getResourceById({ siteName, targetId, environment = 'live' }) {
  const node = await getNodeById({ siteName, targetId, environment });
  if (!node) throw new Error(`node ${targetId} not found on site ${siteName} (${environment})`);
  return {
    node,
    data: await getResource({ siteName, url: node.resourceUrl, environment }),
  };
}

module.exports = {
  getSiteHostname,
  getNodeById,
  getResource,
  getResourceById,
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/neon-env/registry.test.js test/neon-env/sites-helpers.test.js && npm test`
Expected: PASS, all suites. `grep -rn "getFrontOfficeUrl\|fo\.sites\|NEON_FO_.*_URL" src test` should only match the registry warning line and the registry tests.

- [ ] **Step 8: Commit**

```bash
git add src/helpers/neon-env/registry.js src/helpers/sites-helpers.js test/neon-env/fixtures.js test/neon-env/registry.test.js test/neon-env/sites-helpers.test.js
git commit -m "feat(fo): neon.fo.url registry schema; FO helpers resolve sites from the catalog"
```

---

### Task 3: Mailjet newsletter resolves its site from the payload

**Files:**
- Modify: `src/mailjet/mailjet.js` (the `require` of `getSiteHostname` at line ~4; `sendNewsletter` base URL block, ~lines 106-115; both `"Name": "TheGlobe Newsletter"` occurrences)
- Create: `test/neon-env/mailjet-site.test.js`

**Interfaces:**
- **Consumes:** `getSite(name)` and `siteFromModel(neonModel)` from Task 1; `requireEnv` from `src/helpers/neon-env/context.js`; `NeonEnvConfigError` from `src/helpers/neon-env/errors.js`.
- **Produces:** `resolveNewsletterSite(neonModel) → Promise<{ baseUrl: string, senderName: string }>`, exported from `src/mailjet/mailjet.js`.

- [ ] **Step 1: Write the failing test `test/neon-env/mailjet-site.test.js`**

```js
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const context = require('../../src/helpers/neon-env/context.js');
const fo = require('../../src/helpers/neon-env/fo-sites.js');
const mailjet = require('../../src/mailjet/mailjet.js');
const DEMORC = require('./fixtures/fo-sites-demorc.json');

const ENV = { id: 'neap-demorc', neon: { insecureTls: false, fo: { url: 'https://neon-fo-demorc.neap.eidosmedia.io', apiKey: 'k' } } };
const inEnv = (fn) => context.run(ENV, fn);

beforeEach(() => {
  fo.clearSiteCache();
  fo.__setHttpForTest(async () => ({ status: 200, data: DEMORC }));
});

test('site from rootData.pubInfo.siteName drives base url and sender name', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'NextFrontier' } }, contentData: { data: {} } }));
  assert.deepEqual(r, { baseUrl: 'https://nextfrontier-demorc.sites.neap.eidosmedia.io', senderName: 'Next Frontier Newsletter' });
});

test('payload siteNode.hostname wins for the base url; label still from the catalog', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ siteNode: { hostname: 'https://custom.example.com/' }, rootData: { pubInfo: { siteName: 'TheGlobe' } } }));
  assert.deepEqual(r, { baseUrl: 'https://custom.example.com', senderName: 'The Globe Newsletter' });
});

test('siteNode.hostname with an unresolvable site -> generic sender name', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ siteNode: { hostname: 'https://custom.example.com' }, rootData: { pubInfo: { siteName: 'Nope' } } }));
  assert.deepEqual(r, { baseUrl: 'https://custom.example.com', senderName: 'Newsletter' });
});

test('no siteNode and unknown site -> catalog 404 propagates', async () => {
  await assert.rejects(() => inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'Nope' } } })), (err) => err.statusCode === 404);
});

test('site without a public hostname -> 404', async () => {
  fo.__setHttpForTest(async () => ({ status: 200, data: [{ root: { name: 'Bare' } }] }));
  await assert.rejects(
    () => inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'Bare' } } })),
    (err) => err.statusCode === 404 && err.message === "site 'Bare' in env neap-demorc has no public hostname"
  );
});

test('no hard-coded site or eks-dev host left in mailjet.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/mailjet/mailjet.js'), 'utf8');
  assert.ok(!/eks-dev/.test(src), 'eks-dev host still present');
  assert.ok(!/['"]theglobe['"]/i.test(src), "'theglobe' literal still present");
  assert.ok(!/TheGlobe Newsletter/.test(src), 'hard-coded sender name still present');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/neon-env/mailjet-site.test.js`
Expected: FAIL with `mailjet.resolveNewsletterSite is not a function` and the hard-coding assertion failing.

- [ ] **Step 3: Implement in `src/mailjet/mailjet.js`**

3a. Replace the line `const { getSiteHostname } = require('../helpers/sites-helpers');` with:
```js
const { getSite, siteFromModel } = require('../helpers/neon-env/fo-sites');
const { requireEnv } = require('../helpers/neon-env/context.js');
const { NeonEnvConfigError } = require('../helpers/neon-env/errors.js');
```
First check with `grep -n "getSiteHostname" src/mailjet/mailjet.js` that the only other use is the one in `sendNewsletter`.

3b. Add this function directly above `async function sendNewsletter(`:
```js
/**
 * Base URL (public site) and sender display name for a newsletter payload.
 * Base: payload siteNode.hostname, else the site's publicUrl from the FO catalog.
 * Spec: docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md §3
 */
async function resolveNewsletterSite(neonModel) {
  const payloadHost = neonModel && neonModel.siteNode && neonModel.siteNode.hostname;
  let site = null;
  try {
    site = await getSite(await siteFromModel(neonModel));
  } catch (error) {
    if (!payloadHost) throw error;
    console.warn(`[mailjet] site lookup failed (${error.message}); using payload siteNode.hostname`);
  }
  const baseUrl = payloadHost || site.publicUrl;
  if (!baseUrl) throw new NeonEnvConfigError(`site '${site.name}' in env ${requireEnv().id} has no public hostname`, 404);
  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ''),
    senderName: site ? `${site.label} Newsletter` : 'Newsletter',
  };
}
```

3c. In `sendNewsletter`, replace the whole block from `// Get the public hostname for the site (not the Front Office API URL)` through the closing `}` of the `// Final fallback to a default public URL` branch (the `let baseUrl = …` / two `if (!baseUrl)` blocks) with:
```js
  const { baseUrl, senderName } = await resolveNewsletterSite(neonModel);
```

3d. Replace both occurrences of `"Name": "TheGlobe Newsletter"` with `"Name": senderName`.

3e. Add `resolveNewsletterSite` to `module.exports`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/neon-env/mailjet-site.test.js && npm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src/mailjet/mailjet.js test/neon-env/mailjet-site.test.js
git commit -m "fix(mailjet): newsletter base url and sender from the payload's site, no hard-coded host"
```

---

### Task 4: `/services` sites line + docs

**Files:**
- Modify: `src/helpers/neon-env/services-view.js`, `test/neon-env/services-view.test.js`, `server.js` (`/services` handler, near `servicesRegistryView(`), `src/pages/services-dashboard.hbs` (after the `{{#if neonEnvs.length}}` block), `config/neon-environments.example.json`, `.env.example`, `README.md`

**Interfaces:**
- **Consumes:** `listSites()` from Task 1; `isAdminRequest(request)` from `src/helpers/auth.js` (already imported in server.js).
- **Produces:** `servicesSitesView(isAdmin, sites, errorMessage) → { sites: { label, publicUrl }[], sitesError: string | null }`, exported from `services-view.js`.

- [ ] **Step 1: Write the failing tests (append to `test/neon-env/services-view.test.js`)**

```js
const { servicesSitesView } = require('../../src/helpers/neon-env/services-view.js');

test('servicesSitesView: admin sees label -> publicUrl', () => {
  const view = servicesSitesView(true, [{ name: 'TheGlobe', label: 'The Globe', publicUrl: 'https://g', apiUrls: { live: 'https://api' } }], null);
  assert.deepEqual(view, { sites: [{ label: 'The Globe', publicUrl: 'https://g' }], sitesError: null });
});

test('servicesSitesView: admin sees the error message', () => {
  assert.deepEqual(servicesSitesView(true, null, 'FO not configured for env x'), { sites: [], sitesError: 'sites unavailable: FO not configured for env x' });
});

test('servicesSitesView: anonymous sees nothing', () => {
  assert.deepEqual(servicesSitesView(false, [{ label: 'A', publicUrl: 'https://a' }], 'boom'), { sites: [], sitesError: null });
});
```
If the file doesn't already import `test` and `assert` at the top, they're already there for the existing tests; just reuse them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/neon-env/services-view.test.js`
Expected: FAIL with `servicesSitesView is not a function`

- [ ] **Step 3: Implement**

3a. In `src/helpers/neon-env/services-view.js`, add:
```js
function servicesSitesView(isAdmin, sites, errorMessage) {
  if (!isAdmin) return { sites: [], sitesError: null };
  return {
    sites: (sites || []).map((s) => ({ label: s.label, publicUrl: s.publicUrl })),
    sitesError: errorMessage ? `sites unavailable: ${errorMessage}` : null,
  };
}
```
and export it: `module.exports = { servicesRegistryView, servicesSitesView, ANONYMOUS_REGISTRY_WARNING };`

3b. In `server.js`:
- Change the services-view require to `const { servicesRegistryView, servicesSitesView } = require("./src/helpers/neon-env/services-view.js");`
- Add `const { listSites } = require("./src/helpers/neon-env/fo-sites.js");` next to it.
- In the `/services` handler, right after the `servicesRegistryView(...)` call, add:
```js
  let siteList = null;
  let sitesErrorMessage = null;
  if (isAdminRequest(request)) {
    try {
      siteList = await listSites();
    } catch (error) {
      sitesErrorMessage = error.message;
    }
  }
  const { sites, sitesError } = servicesSitesView(isAdminRequest(request), siteList, sitesErrorMessage);
```
and add `sites,` and `sitesError,` to the `params` object.

3c. In `src/pages/services-dashboard.hbs`, directly after the `{{#if neonEnvs.length}} … {{/if}}` block, add:
```hbs
    {{#if sites.length}}
    <div style="padding:6px 16px;font-size:13px;background:#f2f4f7">Sites:
      {{#each sites}}<span style="margin-right:12px">{{label}} → <a href="{{publicUrl}}" target="_blank" rel="noopener">{{publicUrl}}</a></span>{{/each}}
    </div>
    {{/if}}
    {{#if sitesError}}
    <div style="padding:6px 16px;font-size:13px;background:#fff4e5">{{sitesError}}</div>
    {{/if}}
```

3d. Docs:
- `config/neon-environments.example.json`: replace the whole `"fo": { … }` object with
  ```json
          "fo": {
            "url": "https://neon-fo-demorc.example.com",
            "apiKey": "env:DEMORC_FO_APIKEY"
          }
  ```
  Then validate: `node -e "JSON.parse(require('fs').readFileSync('config/neon-environments.example.json','utf8'))"`.
- `.env.example`: replace the block starting `# Front Office Site URLs` (the comment line, the `# Format:` line and the three `NEON_FO_THEGLOBE_*_URL` lines) with
  ```bash
  # Front Office API base (sites, public hostnames and per-stage API hosts are discovered
  # from <NEON_FO_URL>/api/sites/live; per-site NEON_FO_<SITE>_<STAGE>_URL vars are no longer used)
  NEON_FO_URL=https://your-neon-fo.example.io
  ```
  On the header comment line 5, change `NEON_APP_URL and NEON_FO_* vars below are IGNORED` to `NEON_APP_URL, NEON_FO_URL and NEON_FO_APIKEY below are IGNORED`.
- `README.md`: in the "Multiple Neon environments" section, add a bullet:
  `- **Front Office sites** are discovered, not configured: each environment sets \`neon.fo.url\` (FO API base, e.g. \`https://neon-fo-<env>…\`) and \`neon.fo.apiKey\`; sites, their public hostnames and live/stage/preview API hosts come from \`<fo.url>/api/sites/live?siteMap=false\` (cached 10 min). The old \`neon.fo.sites\` block is ignored with a warning.`
  Also replace the line `NEON_FO_APIKEY=your_neon_fo_api_key` in the README env sample block with:
  ```
  NEON_FO_URL=https://your-neon-fo.example.io
  NEON_FO_APIKEY=your_neon_fo_api_key
  ```

- [ ] **Step 4: Run the tests + smoke**

Run: `node --test test/neon-env/services-view.test.js && npm test`
Expected: PASS.
Smoke (stop the server afterwards, and check with `lsof -iTCP -sTCP:LISTEN -P | grep node`): `NEON_EXT_APIKEY=test-admin PORT=3999 node server.js`, then `curl -s "http://localhost:3999/services?apikey=test-admin" | grep -c "sites unavailable"`. Expected: `1` (legacy mode without `NEON_FO_URL` gives `FO not configured`). Without an apikey: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/neon-env/services-view.js test/neon-env/services-view.test.js server.js src/pages/services-dashboard.hbs config/neon-environments.example.json .env.example README.md
git commit -m "feat(services): show discovered FO sites to admins; docs for neon.fo.url"
```

---

## After implementation (manual, not for subagents)

1. Remove `neon.fo.sites` from the local `config/neon-environments.json`. `neon.fo.url` is already set for every env.
2. Update the Render Secret File the same way: add `neon.fo.url` per env (`https://neon-fo-…`) and drop `fo.sites`. Then redeploy.
3. Re-run the Mailjet webpage newsletter on demorc. The log should show the page fetch against `https://<site>-demorc.sites.neap.eidosmedia.io/…`.
