# Multi-Neon-Environment Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one deployment serve N Neon environments. Each request is resolved to one environment from a curated registry (Render Secret File), and all Neon/service calls use that environment's config.

**Architecture:** A new `src/helpers/neon-env/` module holds the parts:
- `registry.js` loads and validates `neon-environments.json`, falling back to the legacy env vars.
- `resolve.js` maps apikey, explicit env and host to an env.
- `context.js` stores the resolved env per request in an `AsyncLocalStorage`.
- `services.js` returns per-env service config with global fallback.
- `fastify-plugin.js` resolves every request in `onRequest`, sets `X-Neon-Env` headers, and injects a console banner into HTML pages.

`NeonClient` flat exports resolve lazily to a per-env cached client, so the ~20 existing call sites do not change.

**Tech Stack:** Node 20, Fastify 4, `node:test`, `AsyncLocalStorage`, axios. New dependency: `fastify-plugin` (already in `node_modules` transitively).

**Spec:** `docs/superpowers/specs/2026-09-30-multi-neon-env-design.md` (read it together with this plan; the "Amendments" section at its end records the refinements made while planning).

## Global Constraints

- Registry file load order: `/etc/secrets/neon-environments.json` → `./config/neon-environments.json` → legacy env vars.
- Registry `version` must be `1`. `id` must match `^[a-z0-9-]+$`.
- Required fields per env: `id`, `label`, `hosts` (non-empty), `extApiKey`, `neon.app.url`, `neon.bo.url`, `neon.bo.apiKey`, `neon.bo.userApiKey`.
- Any string value may be `env:VAR_NAME`, resolved from `process.env` at load. A missing var invalidates the entry.
- Colliding ids, keys or hosts reject **all** colliding entries. An env key equal to `adminApiKey` rejects that entry.
- Response headers are `X-Neon-Env: <id>` and `X-Neon-Env-Bo: <bo host>`. Never expose any secret to the client beyond what templates already receive today.
- There is never a silent fallback to a default env when the context is empty: a Neon call without an env throws `NoNeonEnvError`.
- Service fallback is **per block, never per field**.
- Legacy mode (no registry file) must behave exactly like today, including keyless routes (webhooks) reaching Neon.
- No new validation library. Tests use `node:test` + `node:assert/strict` (see `test/delayed-importer.test.js` for style).
- Commit after each task. Stay on the current branch, and do not push.

## Review Focus

1. **Standalone page on Render sends `Referer: https://<render-host>/...`**: this must NOT be treated as a foreign host (self-host exclusion). Test lives in Task 3.
2. **`Origin: null`** (sandboxed iframe or privacy redirect) must be ignored by the host check, not 403. Test lives in Task 3.
3. **An env-bound key combined with `?env=other`** must ignore `?env`; only the global admin key can switch. Test lives in Task 3.
4. **A stale `neonEnv` cookie naming an env removed from the registry** must be cleared and ignored, not turn every request into a 400. Test lives in Task 3 (resolver) and Task 4 (cookie cleared).
5. **A delayed-import tick firing while a request for another env is in flight** must still hit its own env. Test lives in Task 9.

---

## File Structure

**Create**
- `src/helpers/neon-env/errors.js` — `NoNeonEnvError`, `NeonEnvConfigError`, `RegistryFormatError`
- `src/helpers/neon-env/registry.js` — load, validate and normalize the registry; legacy fallback; startup summary
- `src/helpers/neon-env/context.js` — `AsyncLocalStorage` wrapper
- `src/helpers/neon-env/resolve.js` — request → `{auth, env}` resolution
- `src/helpers/neon-env/services.js` — `serviceConfig`, `requireService`, `missingServiceFields`
- `src/helpers/neon-env/page-banner.js` — HTML console banner + fetch wrapper injection
- `src/helpers/neon-env/fastify-plugin.js` — `onRequest` + `onSend` hooks
- `src/helpers/neon-env/index.js` — facade re-exporting the helpers above plus `appUrl()` and `insecureTls()`
- `config/neon-environments.example.json` — documented example
- `test/neon-env/fixtures.js`, `registry.test.js`, `context.test.js`, `resolve.test.js`, `fastify-plugin.test.js`, `services.test.js`, `sites-helpers.test.js`, `routes-auth.test.js`

**Modify (main ones)**
- `src/helpers/neon-bo-api-v3.js`, `src/helpers/auth.js`, `server.js`, `src/requestHandlers/{neon-config,iab-taxonomies,tag-manager}.js`
- `src/requestHandlers/{neon-metrics,mobile-client}.js`
- `src/helpers/{sites-helpers,neon-content-parser,pdf-generator}.js`, `src/images-importer.js`, `src/requestHandlers/{neon-events,panels,widgets,trello,claude-chat-handler}.js`, `src/mailjet/mailjet.js`
- service consumers (Task 8 table)
- `src/connectors/neon-config-connector.js`, `src/delayed-importer.js`, `src/requestHandlers/neon-delayed-import.js`, `src/helpers/claude-chat-helper.js`
- `package.json`, `.gitignore`, `.env.example`, `.claude/CLAUDE.md`, `README.md`, `src/pages/services-dashboard.hbs`

---

### Task 1: Registry (load, validate, legacy fallback)

**Files:**
- Create: `src/helpers/neon-env/errors.js`, `src/helpers/neon-env/registry.js`, `config/neon-environments.example.json`, `test/neon-env/fixtures.js`, `test/neon-env/registry.test.js`
- Modify: `.gitignore`, `package.json` (test script)

**Interfaces:**
- Produces:
  - `buildRegistry({ json, envVars }) → Registry`
  - `loadRegistry({ paths?, envVars?, fsImpl? }) → Registry`
  - `getRegistry() → Registry`, `setRegistry(reg)`, `printRegistrySummary(reg, log = console.log)`
- `Registry` has:
  - fields: `.environments: Env[]`, `.adminApiKey: string|null`, `.source: 'file'|'legacy'`, `.skipped: {id, reason}[]`, `.warnings: string[]`, `.file?: string`, `.loadError?: string`
  - methods: `.list()`, `.ids()`, `.get(id) → Env|null`, `.getDefault() → Env|null`, `.byKey(key) → {env, role:'admin'|'limited'}|null`, `.byHost(host) → Env|null`, `.isAdminKey(key) → boolean`
- `Env` shape:
  ```js
  { id, label, isDefault, hosts: string[] /* lowercased */, extApiKey, extApiKeyLimited|null, warmup, keySource: 'file'|'env'|'legacy',
    neon: { insecureTls, app: { url }, bo: { url, apiKey, userApiKey, host }, fo: { apiKey, sites } | null },
    services: object }
  ```
- Errors: `NoNeonEnvError(validIds[])` (statusCode 400), `NeonEnvConfigError(message, statusCode = 500)`, `RegistryFormatError(message)`

- [ ] **Step 1: Write fixtures + failing tests**

`test/neon-env/fixtures.js`:
```js
'use strict';
function envJson(id, overrides = {}) {
  return {
    id,
    label: `Label ${id}`,
    hosts: [`neon-app-${id}.example.com`],
    extApiKey: `key-${id}`,
    neon: {
      app: { url: `https://neon-app-${id}.example.com` },
      bo: { url: `https://neon-bo-${id}.example.com/api`, apiKey: `bo-${id}`, userApiKey: `user-${id}` },
      fo: { apiKey: `fo-${id}`, sites: { theglobe: { live: `https://fo-${id}.example.com` } } },
    },
    ...overrides,
  };
}
function registryJson(envs, extra = {}) {
  return { version: 1, adminApiKey: 'admin-key', environments: envs, ...extra };
}
module.exports = { envJson, registryJson };
```

`test/neon-env/registry.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRegistry, loadRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');

test('loads valid environments and normalizes them', () => {
  const reg = buildRegistry({ json: registryJson([envJson('demorc', { default: true }), envJson('poc')]), envVars: {} });
  assert.equal(reg.source, 'file');
  assert.deepEqual(reg.ids(), ['demorc', 'poc']);
  const env = reg.get('demorc');
  assert.equal(env.isDefault, true);
  assert.equal(env.neon.bo.host, 'neon-bo-demorc.example.com');
  assert.equal(env.neon.fo.apiKey, 'fo-demorc');
  assert.equal(env.warmup, true);
  assert.equal(env.keySource, 'file');
  assert.equal(reg.getDefault().id, 'demorc');
});

test('resolves env: references and tracks key source', () => {
  const json = registryJson([envJson('demorc', { extApiKey: 'env:DEMORC_KEY' })], { adminApiKey: 'env:ADMIN' });
  const reg = buildRegistry({ json, envVars: { DEMORC_KEY: 'secret-1', ADMIN: 'adm' } });
  assert.equal(reg.get('demorc').extApiKey, 'secret-1');
  assert.equal(reg.get('demorc').keySource, 'env');
  assert.equal(reg.adminApiKey, 'adm');
});

test('skips entry whose env: reference is missing', () => {
  const json = registryJson([envJson('demorc', { extApiKey: 'env:NOPE' }), envJson('poc')]);
  const reg = buildRegistry({ json, envVars: {} });
  assert.deepEqual(reg.ids(), ['poc']);
  assert.match(reg.skipped[0].reason, /NOPE/);
});

test('skips entries with missing required fields or bad id', () => {
  const bad = envJson('Bad_ID');
  const noHosts = envJson('nohosts', { hosts: [] });
  const noBo = envJson('nobo'); delete noBo.neon.bo.apiKey;
  const reg = buildRegistry({ json: registryJson([bad, noHosts, noBo, envJson('ok')]), envVars: {} });
  assert.deepEqual(reg.ids(), ['ok']);
  assert.equal(reg.skipped.length, 3);
});

test('rejects all entries sharing an id, key or host', () => {
  const reg = buildRegistry({
    json: registryJson([
      envJson('a'), envJson('a', { extApiKey: 'other', hosts: ['x.example.com'] }),
      envJson('b', { extApiKey: 'shared' }), envJson('c', { extApiKey: 'shared' }),
      envJson('d', { hosts: ['same.example.com'] }), envJson('e', { hosts: ['SAME.example.com'] }),
      envJson('ok'),
    ]),
    envVars: {},
  });
  assert.deepEqual(reg.ids(), ['ok']);
});

test('rejects entry whose key equals the admin key', () => {
  const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKey: 'admin-key' }), envJson('b')]), envVars: {} });
  assert.deepEqual(reg.ids(), ['b']);
});

test('multiple defaults -> none default + warning', () => {
  const reg = buildRegistry({ json: registryJson([envJson('a', { default: true }), envJson('b', { default: true })]), envVars: {} });
  assert.equal(reg.getDefault(), null);
  assert.ok(reg.warnings.some(w => /multiple default/.test(w)));
});

test('byKey returns env and role; byHost matches case-insensitively', () => {
  const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKeyLimited: 'lim-a' })]), envVars: {} });
  assert.deepEqual(reg.byKey('key-a').role, 'admin');
  assert.deepEqual(reg.byKey('lim-a').role, 'limited');
  assert.equal(reg.byKey('nope'), null);
  assert.equal(reg.byHost('NEON-APP-A.example.com').id, 'a');
  assert.equal(reg.isAdminKey('admin-key'), true);
  assert.equal(reg.isAdminKey(''), false);
});

test('legacy fallback builds one default env from env vars', () => {
  const reg = buildRegistry({
    json: null,
    envVars: {
      NEON_EXT_APIKEY: 'legacy-key', NEON_EXT_LOCATION: 'Local',
      NEON_BO_URL: 'https://bo.local/api', NEON_BO_APIKEY: 'bo', NEON_USER_API_KEY: 'u', NEON_APP_URL: 'https://app.local',
      NEON_FO_APIKEY: 'fo', NEON_FO_THEGLOBE_LIVE_URL: 'https://fo.local', NEON_FO_THEGLOBE_PREVIEW_URL: 'https://fo-prev.local',
    },
  });
  assert.equal(reg.source, 'legacy');
  const env = reg.get('legacy');
  assert.equal(env.isDefault, true);
  assert.equal(env.label, 'Local');
  assert.equal(env.neon.insecureTls, true);
  assert.deepEqual(env.hosts, []);
  assert.equal(env.neon.fo.sites.theglobe.preview, 'https://fo-prev.local');
  assert.equal(reg.byKey('legacy-key').env.id, 'legacy');
});

test('file present warns that legacy vars are ignored', () => {
  const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: { NEON_BO_URL: 'x' } });
  assert.ok(reg.warnings.some(w => /legacy/.test(w)));
});

test('loadRegistry falls back to legacy on unparseable file', () => {
  const fsImpl = { existsSync: () => true, readFileSync: () => '{ not json' };
  const reg = loadRegistry({ paths: ['/x.json'], envVars: { NEON_EXT_APIKEY: 'k' }, fsImpl });
  assert.equal(reg.source, 'legacy');
  assert.match(reg.loadError, /x\.json/);
});

test('loadRegistry with no file uses legacy', () => {
  const fsImpl = { existsSync: () => false, readFileSync: () => { throw new Error('no'); } };
  assert.equal(loadRegistry({ paths: ['/x.json'], envVars: {}, fsImpl }).source, 'legacy');
});

test('unsupported version falls back to legacy', () => {
  const fsImpl = { existsSync: () => true, readFileSync: () => JSON.stringify({ version: 2, environments: [] }) };
  const reg = loadRegistry({ paths: ['/x.json'], envVars: {}, fsImpl });
  assert.equal(reg.source, 'legacy');
  assert.match(reg.loadError, /version/);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/neon-env/registry.test.js`
Expected: FAIL with `Cannot find module '../../src/helpers/neon-env/registry.js'`

- [ ] **Step 3: Implement `errors.js`**

```js
'use strict';

class NoNeonEnvError extends Error {
  constructor(validIds = []) {
    super(
      'No Neon environment selected for this request. Use an environment-bound apikey, ' +
      `or the admin apikey with ?env=<id>${validIds.length ? ` (valid: ${validIds.join(', ')})` : ''}`
    );
    this.name = 'NoNeonEnvError';
    this.statusCode = 400;
  }
}

class NeonEnvConfigError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'NeonEnvConfigError';
    this.statusCode = statusCode;
  }
}

class RegistryFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryFormatError';
  }
}

module.exports = { NoNeonEnvError, NeonEnvConfigError, RegistryFormatError };
```

- [ ] **Step 4: Implement `registry.js`**

```js
'use strict';
/**
 * Neon environment registry.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §1
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RegistryFormatError } = require('./errors.js');

const DEFAULT_PATHS = [
  '/etc/secrets/neon-environments.json',
  path.join(process.cwd(), 'config', 'neon-environments.json'),
];
const ID_RE = /^[a-z0-9-]+$/;
const LEGACY_VARS = ['NEON_BO_URL', 'NEON_BO_APIKEY', 'NEON_USER_API_KEY', 'NEON_APP_URL', 'NEON_FO_APIKEY'];
const LEGACY_FO_RE = /^NEON_FO_(.+)_(LIVE|PREVIEW|STAGE)_URL$/;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

function resolveRefs(value, envVars, missing) {
  if (typeof value === 'string' && value.startsWith('env:')) {
    const name = value.slice(4);
    if (envVars[name] === undefined || envVars[name] === '') {
      missing.push(name);
      return undefined;
    }
    return envVars[name];
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, envVars, missing));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, envVars, missing);
    return out;
  }
  return value;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function validateEntry(raw) {
  if (!raw || typeof raw !== 'object') return ['entry must be an object'];
  const errors = [];
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errors.push('id must match ^[a-z0-9-]+$');
  if (!isNonEmptyString(raw.label)) errors.push('label is required');
  if (!Array.isArray(raw.hosts) || raw.hosts.length === 0 || !raw.hosts.every(isNonEmptyString)) {
    errors.push('hosts must be a non-empty array of strings');
  }
  if (!isNonEmptyString(raw.extApiKey)) errors.push('extApiKey is required');
  if (raw.extApiKeyLimited !== undefined) {
    if (!isNonEmptyString(raw.extApiKeyLimited)) errors.push('extApiKeyLimited must be a non-empty string');
    else if (raw.extApiKeyLimited === raw.extApiKey) errors.push('extApiKeyLimited must differ from extApiKey');
  }
  const neon = raw.neon || {};
  if (!neon.app || !hostOf(neon.app.url)) errors.push('neon.app.url must be a URL');
  if (!neon.bo || !hostOf(neon.bo.url)) errors.push('neon.bo.url must be a URL');
  if (!neon.bo || !isNonEmptyString(neon.bo.apiKey)) errors.push('neon.bo.apiKey is required');
  if (!neon.bo || !isNonEmptyString(neon.bo.userApiKey)) errors.push('neon.bo.userApiKey is required');
  if (neon.fo !== undefined) {
    if (!isNonEmptyString(neon.fo?.apiKey)) errors.push('neon.fo.apiKey is required when neon.fo is set');
    if (!neon.fo?.sites || typeof neon.fo.sites !== 'object') errors.push('neon.fo.sites must be an object when neon.fo is set');
  }
  if (raw.services !== undefined && (typeof raw.services !== 'object' || Array.isArray(raw.services) || raw.services === null)) {
    errors.push('services must be an object');
  }
  return errors;
}

function lowerKeys(sites) {
  const out = {};
  for (const [site, envs] of Object.entries(sites || {})) {
    out[site.toLowerCase()] = {};
    for (const [stage, url] of Object.entries(envs || {})) out[site.toLowerCase()][stage.toLowerCase()] = url;
  }
  return out;
}

function normalize(raw, keySource) {
  return {
    id: raw.id,
    label: raw.label,
    isDefault: raw.default === true,
    hosts: raw.hosts.map((h) => h.toLowerCase()),
    extApiKey: raw.extApiKey,
    extApiKeyLimited: raw.extApiKeyLimited || null,
    warmup: raw.warmup !== false,
    keySource,
    neon: {
      insecureTls: raw.neon.insecureTls === true,
      app: { url: raw.neon.app.url },
      bo: { url: raw.neon.bo.url, apiKey: raw.neon.bo.apiKey, userApiKey: raw.neon.bo.userApiKey, host: hostOf(raw.neon.bo.url) },
      fo: raw.neon.fo ? { apiKey: raw.neon.fo.apiKey, sites: lowerKeys(raw.neon.fo.sites) } : null,
    },
    services: raw.services || {},
  };
}

function rejectCollisions(envs, keysOf, reason, skipped) {
  const owners = new Map();
  envs.forEach((e, idx) => {
    for (const k of new Set(keysOf(e))) owners.set(k, (owners.get(k) || []).concat(idx));
  });
  const bad = new Set();
  for (const idxs of owners.values()) if (idxs.length > 1) idxs.forEach((i) => bad.add(i));
  return envs.filter((e, idx) => {
    if (!bad.has(idx)) return true;
    skipped.push({ id: e.id, reason });
    return false;
  });
}

function buildLegacyEnv(envVars) {
  const sites = {};
  for (const [name, value] of Object.entries(envVars)) {
    const m = name.match(LEGACY_FO_RE);
    if (m && value) {
      const site = m[1].toLowerCase();
      sites[site] = sites[site] || {};
      sites[site][m[2].toLowerCase()] = value;
    }
  }
  const hasFo = !!envVars.NEON_FO_APIKEY || Object.keys(sites).length > 0;
  return {
    id: 'legacy',
    label: envVars.NEON_EXT_LOCATION || 'Legacy',
    isDefault: true,
    hosts: [],
    extApiKey: envVars.NEON_EXT_APIKEY || null,
    extApiKeyLimited: envVars.NEON_EXT_APIKEY_LIMITED || null,
    warmup: true,
    keySource: 'legacy',
    neon: {
      insecureTls: envVars.NEON_EXT_LOCATION === 'Local',
      app: { url: envVars.NEON_APP_URL || '' },
      bo: {
        url: envVars.NEON_BO_URL || '',
        apiKey: envVars.NEON_BO_APIKEY || '',
        userApiKey: envVars.NEON_USER_API_KEY || '',
        host: hostOf(envVars.NEON_BO_URL),
      },
      fo: hasFo ? { apiKey: envVars.NEON_FO_APIKEY || '', sites } : null,
    },
    services: {},
  };
}

class Registry {
  constructor({ environments, adminApiKey, source, skipped = [], warnings = [] }) {
    this.environments = environments;
    this.adminApiKey = adminApiKey || null;
    this.source = source;
    this.skipped = skipped;
    this.warnings = warnings;
    this._byId = new Map(environments.map((e) => [e.id, e]));
  }
  list() { return this.environments; }
  ids() { return this.environments.map((e) => e.id); }
  get(id) { return this._byId.get(id) || null; }
  getDefault() { return this.environments.find((e) => e.isDefault) || null; }
  byKey(key) {
    for (const env of this.environments) {
      if (safeEqual(key, env.extApiKey)) return { env, role: 'admin' };
      if (safeEqual(key, env.extApiKeyLimited)) return { env, role: 'limited' };
    }
    return null;
  }
  byHost(host) {
    const h = String(host || '').toLowerCase();
    return this.environments.find((e) => e.hosts.includes(h)) || null;
  }
  isAdminKey(key) { return safeEqual(key, this.adminApiKey); }
}

function buildRegistry({ json, envVars = process.env }) {
  if (json === null || json === undefined) {
    return new Registry({
      environments: [buildLegacyEnv(envVars)],
      adminApiKey: envVars.NEON_EXT_APIKEY || null,
      source: 'legacy',
    });
  }
  if (typeof json !== 'object' || !Array.isArray(json.environments)) {
    throw new RegistryFormatError('registry must be an object with an "environments" array');
  }
  if (json.version !== 1) throw new RegistryFormatError(`unsupported registry version: ${json.version}`);

  const skipped = [];
  const warnings = [];
  const adminMissing = [];
  const adminApiKey = resolveRefs(json.adminApiKey, envVars, adminMissing) || null;
  if (adminMissing.length) {
    warnings.push(`adminApiKey references missing env var(s) ${adminMissing.join(', ')}: admin key disabled`);
  }

  let envs = [];
  json.environments.forEach((raw, i) => {
    const name = raw && typeof raw.id === 'string' ? raw.id : `#${i}`;
    const keySource = typeof raw?.extApiKey === 'string' && raw.extApiKey.startsWith('env:') ? 'env' : 'file';
    const missing = [];
    const resolved = resolveRefs(raw, envVars, missing);
    if (missing.length) {
      skipped.push({ id: name, reason: `missing env var(s): ${missing.join(', ')}` });
      return;
    }
    const errors = validateEntry(resolved);
    if (errors.length) {
      skipped.push({ id: name, reason: errors.join('; ') });
      return;
    }
    envs.push(normalize(resolved, keySource));
  });

  envs = rejectCollisions(envs, (e) => [e.id], 'duplicate id', skipped);
  envs = rejectCollisions(envs, (e) => [e.extApiKey, e.extApiKeyLimited].filter(Boolean), 'apikey shared with another environment', skipped);
  envs = rejectCollisions(envs, (e) => e.hosts, 'host shared with another environment', skipped);
  if (adminApiKey) {
    envs = envs.filter((e) => {
      if (e.extApiKey !== adminApiKey && e.extApiKeyLimited !== adminApiKey) return true;
      skipped.push({ id: e.id, reason: 'apikey equals adminApiKey' });
      return false;
    });
  }

  const defaults = envs.filter((e) => e.isDefault);
  if (defaults.length > 1) {
    warnings.push(`multiple default environments (${defaults.map((e) => e.id).join(', ')}): none will be default`);
    defaults.forEach((e) => { e.isDefault = false; });
  }
  if (LEGACY_VARS.some((v) => envVars[v])) {
    warnings.push('registry file present: legacy NEON_* env vars are ignored for Neon config');
  }

  return new Registry({ environments: envs, adminApiKey, source: 'file', skipped, warnings });
}

function loadRegistry({ paths = DEFAULT_PATHS, envVars = process.env, fsImpl = fs } = {}) {
  const file = paths.find((p) => fsImpl.existsSync(p));
  if (!file) return buildRegistry({ json: null, envVars });
  try {
    const reg = buildRegistry({ json: JSON.parse(fsImpl.readFileSync(file, 'utf8')), envVars });
    reg.file = file;
    return reg;
  } catch (error) {
    const reg = buildRegistry({ json: null, envVars });
    reg.file = file;
    reg.loadError = `${file}: ${error.message}`;
    reg.warnings.push(`registry file unusable, falling back to legacy: ${reg.loadError}`);
    return reg;
  }
}

let current = null;
function getRegistry() {
  if (!current) current = loadRegistry();
  return current;
}
function setRegistry(reg) {
  current = reg;
}

function printRegistrySummary(reg, log = console.log) {
  log(`[neon-env] registry source: ${reg.source}${reg.file ? ` (${reg.file})` : ''}`);
  for (const e of reg.list()) {
    log(`[neon-env]   ${e.isDefault ? '*' : ' '} ${e.id.padEnd(16)} ${e.label.padEnd(20)} bo=${e.neon.bo.host || '(none)'} key=${e.keySource} warmup=${e.warmup}`);
  }
  for (const s of reg.skipped) log(`[neon-env]   ✗ skipped ${s.id}: ${s.reason}`);
  for (const w of reg.warnings) log(`[neon-env]   ⚠️  ${w}`);
}

module.exports = {
  DEFAULT_PATHS,
  Registry,
  buildRegistry,
  loadRegistry,
  getRegistry,
  setRegistry,
  printRegistrySummary,
  safeEqual,
};
```

- [ ] **Step 5: Add example file, gitignore entry and test script**

`config/neon-environments.example.json`: copy the schema JSON from spec §1 verbatim, but with `"id": "demorc"` and every secret replaced by `"env:DEMORC_..."` placeholders, e.g. `"extApiKey": "env:DEMORC_EXT_APIKEY"`.

`.gitignore`: add a line `config/neon-environments.json`.

`package.json` `scripts.test`: append ` test/neon-env/*.test.js` to the end of the existing string. The shell expands the glob, since Node 20's `--test` does not glob.

- [ ] **Step 6: Run tests**

Run: `node --test test/neon-env/registry.test.js`
Expected: PASS (13 tests). Then `npm test`: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/neon-env/errors.js src/helpers/neon-env/registry.js config/neon-environments.example.json test/neon-env/fixtures.js test/neon-env/registry.test.js .gitignore package.json
git commit -m "feat(neon-env): environment registry with validation and legacy fallback"
```

---

### Task 2: Request context + per-env Neon client

**Files:**
- Create: `src/helpers/neon-env/context.js`, `src/helpers/neon-env/index.js`, `test/neon-env/context.test.js`
- Modify: `src/helpers/neon-bo-api-v3.js:52-64` (constructor), `:79` (log line), `:430-469` (flat exports)

**Interfaces:**
- Consumes: `getRegistry()` and `Env` from Task 1, and `NoNeonEnvError`.
- Produces:
  - `context.run(env|null, fn)`, `context.currentEnv() → Env|null`, `context.requireEnv() → Env` (throws `NoNeonEnvError`)
  - `index.js` re-exports `run`, `currentEnv`, `requireEnv`, `getRegistry`, plus `appUrl() → string` and `insecureTls() → boolean`
  - `neon-bo-api-v3.js` exports `clientFor(env) → NeonClient`, `currentClient() → NeonClient`, and `NeonClient` (whose constructor with no `baseUrl` uses `requireEnv()`; it accepts `options.env`)

- [ ] **Step 1: Write failing tests**

`test/neon-env/context.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const neonApi = require('../../src/helpers/neon-bo-api-v3.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a'), envJson('b', { neon: { ...envJson('b').neon, insecureTls: true } })]), envVars: {} });
const envA = reg.get('a');
const envB = reg.get('b');
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('requireEnv throws NoNeonEnvError outside a context', () => {
  assert.throws(() => context.requireEnv(), { name: 'NoNeonEnvError' });
  assert.equal(context.currentEnv(), null);
});

test('concurrent contexts keep their own env and client', async () => {
  const seen = await Promise.all([
    context.run(envA, async () => { await tick(10); return neonApi.currentClient().baseUrl; }),
    context.run(envB, async () => { await tick(1); return neonApi.currentClient().baseUrl; }),
  ]);
  assert.deepEqual(seen, [envA.neon.bo.url, envB.neon.bo.url]);
});

test('clientFor caches one client per env', () => {
  assert.equal(neonApi.clientFor(envA), neonApi.clientFor(envA));
  assert.notEqual(neonApi.clientFor(envA), neonApi.clientFor(envB));
});

test('NeonClient without options uses current env; explicit baseUrl needs no env', () => {
  const c = context.run(envB, () => new neonApi.NeonClient());
  assert.equal(c.apiKey, 'bo-b');
  assert.equal(c.envId, 'b');
  assert.ok(c.client.defaults.httpsAgent, 'insecureTls env gets a custom agent');
  const custom = new neonApi.NeonClient({ baseUrl: 'https://x', apiKey: 'k', userApiKey: 'u' });
  assert.equal(custom.envId, 'custom');
});

test('flat export outside context throws instead of hitting a default env', async () => {
  // async wrapper: currentClient() throws synchronously inside the flat-export arrow
  await assert.rejects(async () => neonApi.getNode('abc'), { name: 'NoNeonEnvError' });
});

test('insecureTls env does not touch process-wide TLS flag', () => {
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  context.run(envB, () => new neonApi.NeonClient());
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, before);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/context.test.js`
Expected: FAIL with `Cannot find module '../../src/helpers/neon-env/context.js'`

- [ ] **Step 3: Implement `context.js` and `index.js`**

`src/helpers/neon-env/context.js`:
```js
'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const { NoNeonEnvError } = require('./errors.js');

const als = new AsyncLocalStorage();

function run(env, fn) {
  return als.run({ env: env || null }, fn);
}

function currentEnv() {
  return als.getStore()?.env || null;
}

function requireEnv() {
  const env = currentEnv();
  if (env) return env;
  const { getRegistry } = require('./registry.js');
  throw new NoNeonEnvError(getRegistry().ids());
}

module.exports = { run, currentEnv, requireEnv };
```

`src/helpers/neon-env/index.js`:
```js
'use strict';
const context = require('./context.js');
const registry = require('./registry.js');

function appUrl() {
  return context.currentEnv()?.neon.app.url || '';
}

function insecureTls() {
  return context.currentEnv()?.neon.insecureTls === true;
}

module.exports = {
  run: context.run,
  currentEnv: context.currentEnv,
  requireEnv: context.requireEnv,
  getRegistry: registry.getRegistry,
  appUrl,
  insecureTls,
};
```
(Task 7 adds `serviceConfig`, `requireService` and `missingServiceFields` to this facade.)

- [ ] **Step 4: Modify `neon-bo-api-v3.js`**

At the top, add:
```js
const https = require('https');
const context = require('./neon-env/context.js');
```

Replace the constructor (`:52-64`) with:
```js
    constructor(options = {}) {
        // Explicit baseUrl = caller-managed client (tests/tools); otherwise bind to the request's env
        const env = options.env || (options.baseUrl ? null : context.requireEnv());
        this.envId = env?.id || 'custom';
        this.baseUrl = options.baseUrl || env.neon.bo.url;
        this.apiKey = options.apiKey || env.neon.bo.apiKey;
        this.userApiKey = options.userApiKey || env.neon.bo.userApiKey;
        this.updateContextId = `neon-integration-${Date.now()}`;

        const insecure = options.insecureTls ?? env?.neon.insecureTls ?? false;
        this.client = axios.create(insecure ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {});
    }
```

In `makeRequest`, change the log line to prefix the env:
```js
        console.log(`➡️  [env=${this.envId}] ${config.method?.toUpperCase() || 'REQUEST'} ${config.url} called by ${callerName} with config:`, '\n', JSON.stringify({ baseURL: this.baseUrl, ...restConfig }, null, 2));
```
Also in `makeRequest`, pass `envId: this.envId` into both `logNeonCall({...})` calls. In `logNeonCall`, add `env: envId` to `entry` and prefix the filename with `${envId}_`.

Replace `const defaultClient = new NeonClient();` (`:430`) with:
```js
const clientCache = new Map();

function clientFor(env) {
    const cached = clientCache.get(env.id);
    if (cached && cached.envRef === env) return cached;
    const client = new NeonClient({ env });
    client.envRef = env;
    clientCache.set(env.id, client);
    return client;
}

function currentClient() {
    return clientFor(context.requireEnv());
}
```
In the `module.exports` flat API, replace every `defaultClient.` with `currentClient().`:
`sed -i '' 's/defaultClient\./currentClient()./g' src/helpers/neon-bo-api-v3.js`. Add `clientFor, currentClient,` right after `NeonClient,`.

Check with `grep -n "defaultClient" src/helpers/neon-bo-api-v3.js`. Expected: no output.

- [ ] **Step 5: Run tests**

Run: `node --test test/neon-env/context.test.js && npm test`
Expected: PASS. Existing tests must still pass, since nothing constructs a client at module load any more.

- [ ] **Step 6: Commit**

```bash
git add src/helpers/neon-env/context.js src/helpers/neon-env/index.js src/helpers/neon-bo-api-v3.js test/neon-env/context.test.js
git commit -m "feat(neon-env): request-scoped env context and per-env NeonClient"
```

---

### Task 3: Request resolver

**Files:**
- Create: `src/helpers/neon-env/resolve.js`, `test/neon-env/resolve.test.js`

**Interfaces:**
- Consumes: `Registry` (Task 1)
- Produces: `resolveRequest(req, registry, { selfHosts? }) → { auth, env, error, setEnvCookie, clearEnvCookie }`
  - `auth = { authenticated: boolean, apikey: string|null, role: 'admin'|'limited'|null, global: boolean }`
  - `error = null | { status: 400|403, message, log? }`
  - `req` needs `{ headers, query, cookies }`. `selfHosts` defaults to `[headers.host, host of process.env.PROJECT_DOMAIN]`.

Resolution order (spec §2, with the planning amendment for host inference):
1. The env-bound key (`extApiKey` → admin, `extApiKeyLimited` → limited) determines the env. `?env`/`x-neon-env` are ignored.
2. With the global admin key:
   - an explicit env (`x-neon-env` header → `?env` → `neonEnv` cookie) is used. An unknown id from header/query gives 400; an unknown id from the cookie is cleared and ignored.
   - otherwise, the first caller host matching `registry.byHost` wins;
   - otherwise, `registry.getDefault()`;
   - otherwise, `env = null`. The request proceeds, and Neon calls throw `NoNeonEnvError`.
3. No key or an unknown key: unauthenticated. In **legacy** mode `env = registry.getDefault()`, so today's keyless routes (webhooks) keep working. In file mode `env = null`.
4. Host check: when the env has `hosts`, every caller host (`origin`, `referer`, `x-forwarded-host`, excluding `null` and self hosts) must be in `env.hosts`. Otherwise it's a 403.

- [ ] **Step 1: Write failing tests**

`test/neon-env/resolve.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRequest } = require('../../src/helpers/neon-env/resolve.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({
  json: registryJson([envJson('a', { default: true, extApiKeyLimited: 'lim-a' }), envJson('b')]),
  envVars: {},
});
const legacy = buildRegistry({ json: null, envVars: { NEON_EXT_APIKEY: 'legacy-key', NEON_BO_URL: 'https://bo/api' } });
const SELF = { selfHosts: ['integrations.onrender.com'] };
function req({ headers = {}, query = {}, cookies = {} } = {}) {
  return { headers: { host: 'integrations.onrender.com', ...headers }, query, cookies };
}

test('env-bound key selects its env (header, query, cookie)', () => {
  assert.equal(resolveRequest(req({ headers: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
  assert.equal(resolveRequest(req({ query: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
  assert.equal(resolveRequest(req({ cookies: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
});

test('header key wins over stale cookie key', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-b' }, cookies: { apikey: 'key-a' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
});

test('limited key gets limited role', () => {
  const r = resolveRequest(req({ headers: { apikey: 'lim-a' } }), reg, SELF);
  assert.equal(r.auth.role, 'limited');
  assert.equal(r.auth.global, false);
});

test('env-bound key ignores ?env and x-neon-env', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', 'x-neon-env': 'b' }, query: { env: 'b' } }), reg, SELF);
  assert.equal(r.env.id, 'a');
  assert.equal(r.setEnvCookie, null);
});

test('admin key + explicit env selects it and asks to persist cookie', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' }, query: { env: 'b' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
  assert.equal(r.auth.global, true);
  assert.equal(r.setEnvCookie, 'b');
});

test('admin key + unknown explicit env -> 400 listing ids', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key', 'x-neon-env': 'zzz' } }), reg, SELF);
  assert.equal(r.error.status, 400);
  assert.match(r.error.message, /a, b/);
});

test('admin key + stale env cookie -> cleared, falls back to default', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' }, cookies: { neonEnv: 'removed' } }), reg, SELF);
  assert.equal(r.error, null);
  assert.equal(r.clearEnvCookie, true);
  assert.equal(r.env.id, 'a');
});

test('admin key without explicit env infers env from caller host', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key', referer: 'https://neon-app-b.example.com/neon/app' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
});

test('admin key, no explicit env, no host, no default -> env null, no error', () => {
  const noDefault = buildRegistry({ json: registryJson([envJson('a'), envJson('b')]), envVars: {} });
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' } }), noDefault, SELF);
  assert.equal(r.env, null);
  assert.equal(r.error, null);
  assert.equal(r.auth.authenticated, true);
});

test('host mismatch -> 403', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', origin: 'https://neon-app-b.example.com' } }), reg, SELF);
  assert.equal(r.error.status, 403);
  assert.match(r.error.log, /host mismatch env=a/);
});

test('self host referer (standalone on Render) is not a mismatch', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', referer: 'https://integrations.onrender.com/widgets/x' } }), reg, SELF);
  assert.equal(r.error, null);
  assert.equal(r.env.id, 'a');
});

test('Origin: null is ignored by host check', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', origin: 'null' } }), reg, SELF);
  assert.equal(r.error, null);
});

test('matching host passes', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', 'x-forwarded-host': 'neon-app-a.example.com' } }), reg, SELF);
  assert.equal(r.env.id, 'a');
});

test('no key in file mode -> unauthenticated, env null', () => {
  const r = resolveRequest(req(), reg, SELF);
  assert.equal(r.auth.authenticated, false);
  assert.equal(r.env, null);
});

test('no key in legacy mode -> unauthenticated but legacy env (keyless webhooks keep working)', () => {
  const r = resolveRequest(req(), legacy, SELF);
  assert.equal(r.auth.authenticated, false);
  assert.equal(r.env.id, 'legacy');
});

test('legacy key authenticates as admin on legacy env', () => {
  const r = resolveRequest(req({ headers: { apikey: 'legacy-key' } }), legacy, SELF);
  assert.equal(r.auth.role, 'admin');
  assert.equal(r.env.id, 'legacy');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/resolve.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement `resolve.js`**

```js
'use strict';
/**
 * Request -> Neon environment resolution.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §2 (+ Amendments)
 */

// Headers that can reveal the calling Neon host. Settle after the /debug/headers probe (Task 13).
const HOST_HEADERS = ['origin', 'referer', 'x-forwarded-host'];

const UNAUTH = Object.freeze({ authenticated: false, apikey: null, role: null, global: false });

function pickApiKey(req) {
  return req.headers?.apikey || req.query?.apikey || req.cookies?.apikey || null;
}

function pickExplicitEnv(req) {
  if (req.headers?.['x-neon-env']) return { id: String(req.headers['x-neon-env']), from: 'header' };
  if (req.query?.env) return { id: String(req.query.env), from: 'query' };
  if (req.cookies?.neonEnv) return { id: String(req.cookies.neonEnv), from: 'cookie' };
  return null;
}

function hostFromHeaderValue(value) {
  if (!value) return null;
  const first = String(value).split(',')[0].trim();
  if (!first || first === 'null') return null;
  try {
    return new URL(first.includes('://') ? first : `https://${first}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function defaultSelfHosts(req) {
  const hosts = [req.headers?.host];
  if (process.env.PROJECT_DOMAIN) hosts.push(hostFromHeaderValue(process.env.PROJECT_DOMAIN));
  return hosts;
}

function callerHosts(req, selfHosts) {
  const self = new Set(selfHosts.filter(Boolean).map((h) => String(h).toLowerCase()));
  const out = new Set();
  for (const name of HOST_HEADERS) {
    const h = hostFromHeaderValue(req.headers?.[name]);
    if (h && !self.has(h)) out.add(h);
  }
  return [...out];
}

function result(auth, env, extra = {}) {
  return { auth, env: env || null, error: null, setEnvCookie: null, clearEnvCookie: false, ...extra };
}

function resolveRequest(req, registry, { selfHosts } = {}) {
  const hosts = callerHosts(req, selfHosts || defaultSelfHosts(req));
  const apikey = pickApiKey(req);
  let auth;
  let env = null;
  const extra = {};

  const bound = apikey ? registry.byKey(apikey) : null;
  if (bound) {
    auth = { authenticated: true, apikey, role: bound.role, global: false };
    env = bound.env;
  } else if (apikey && registry.isAdminKey(apikey)) {
    auth = { authenticated: true, apikey, role: 'admin', global: true };
    const explicit = pickExplicitEnv(req);
    if (explicit) {
      env = registry.get(explicit.id);
      if (!env && explicit.from !== 'cookie') {
        return result(auth, null, {
          error: { status: 400, message: `Unknown Neon environment '${explicit.id}'. Valid: ${registry.ids().join(', ')}` },
        });
      }
      if (!env) extra.clearEnvCookie = true;
      else if (explicit.from !== 'cookie') extra.setEnvCookie = env.id;
    }
    if (!env) env = hosts.map((h) => registry.byHost(h)).find(Boolean) || registry.getDefault();
  } else {
    auth = { ...UNAUTH };
    // Legacy mode keeps today's behaviour: keyless routes (e.g. webhooks) still reach the single Neon.
    env = registry.source === 'legacy' ? registry.getDefault() : null;
  }

  if (env && env.hosts.length) {
    const foreign = hosts.filter((h) => !env.hosts.includes(h));
    if (foreign.length) {
      return result(auth, null, {
        error: {
          status: 403,
          message: `Request host ${foreign.join(', ')} does not belong to Neon environment '${env.id}'`,
          log: `[neon-env] host mismatch env=${env.id} host=${foreign.join(',')}`,
        },
      });
    }
  }

  return result(auth, env, extra);
}

module.exports = { resolveRequest, callerHosts, HOST_HEADERS };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/neon-env/resolve.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/neon-env/resolve.js test/neon-env/resolve.test.js
git commit -m "feat(neon-env): resolve request to environment by key, explicit env and host"
```

---

### Task 4: Fastify plugin, auth wrapper, server wiring, debug probe

**Files:**
- Create: `src/helpers/neon-env/fastify-plugin.js`, `test/neon-env/fastify-plugin.test.js`
- Modify: `src/helpers/auth.js`, `server.js` (register plugin after cookie `:42-46`, `/services` `:194-200`, `/test` `:205-219`, startup `:547-549`, add `/debug/headers`), `src/requestHandlers/neon-config.js:130-140`, `src/requestHandlers/iab-taxonomies.js:394-405`, `src/requestHandlers/tag-manager.js:819-835`, `src/pages/services-dashboard.hbs`, `package.json` (dependency)

**Interfaces:**
- Consumes: `resolveRequest` (Task 3), `context.run` (Task 2), `getRegistry` and `printRegistrySummary` (Task 1)
- Produces:
  - Fastify plugin with options `{ getRegistry? }`. It decorates `request.neonAuth` (the resolver's `auth` shape) and `request.neonEnv` (`Env|null`).
  - `auth.authenticate(request, reply) → { authenticated, apikey, role, env }` (same contract as before, plus `env`)
  - `auth.isAdminRequest(request) → boolean`

- [ ] **Step 1: Install dependency**

Run: `npm install fastify-plugin@^4`
Expected: `package.json` dependencies now list `fastify-plugin`.

- [ ] **Step 2: Write failing tests**

`test/neon-env/fastify-plugin.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { currentEnv } = require('../../src/helpers/neon-env/context.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a', { default: true }), envJson('b')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.get('/whoami', async (request) => {
    await new Promise((r) => setTimeout(r, 5));
    return { env: currentEnv()?.id || null, role: request.neonAuth.role };
  });
  app.get('/page', async (request, reply) => reply.type('text/html').send('<html><head><title>x</title></head><body></body></html>'));
  return app;
}

test('context survives awaits inside the handler and headers are set', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/whoami', headers: { apikey: 'key-b' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { env: 'b', role: 'admin' });
  assert.equal(res.headers['x-neon-env'], 'b');
  assert.equal(res.headers['x-neon-env-bo'], 'neon-bo-b.example.com');
});

test('parallel requests for different envs do not leak context', async () => {
  const app = await buildApp();
  const [ra, rb] = await Promise.all([
    app.inject({ url: '/whoami', headers: { apikey: 'key-a' } }),
    app.inject({ url: '/whoami', headers: { apikey: 'key-b' } }),
  ]);
  assert.equal(ra.json().env, 'a');
  assert.equal(rb.json().env, 'b');
});

test('host mismatch returns 403 before the handler', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/whoami', headers: { apikey: 'key-a', origin: 'https://neon-app-b.example.com' } });
  assert.equal(res.statusCode, 403);
});

test('admin ?env sets neonEnv cookie; stale cookie is cleared', async () => {
  const app = await buildApp();
  const set = await app.inject({ url: '/whoami?env=b', headers: { apikey: 'admin-key' } });
  assert.equal(set.json().env, 'b');
  assert.ok(set.cookies.find((c) => c.name === 'neonEnv' && c.value === 'b'));
  const stale = await app.inject({ url: '/whoami', headers: { apikey: 'admin-key' }, cookies: { neonEnv: 'gone' } });
  assert.equal(stale.json().env, 'a');
  assert.ok(stale.cookies.find((c) => c.name === 'neonEnv' && c.value === ''));
});

test('HTML responses get the console banner injected after <head>', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/page', headers: { apikey: 'key-a' } });
  assert.match(res.body, /<head><script>\(function\(\)\{var e=\{"id":"a"/);
  assert.match(res.body, /\[neon-env\]/);
});
```
Note: the last test depends on Task 12's `page-banner.js`. In this task, the plugin's `onSend` calls `injectBanner` from `./page-banner.js`, so create a **minimal** `page-banner.js` now:
```js
'use strict';
function bannerScript(env) {
  const info = env ? { id: env.id, label: env.label, boHost: env.neon.bo.host } : null;
  const json = JSON.stringify(info).replace(/</g, '\\u003c');
  return `<script>(function(){var e=${json};window.__NEON_ENV__=e;console.log('[neon-env]', e);})();</script>`;
}
function injectBanner(html, env) {
  const m = html.match(/<head[^>]*>/i);
  if (!m) return html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + bannerScript(env) + html.slice(at);
}
module.exports = { bannerScript, injectBanner };
```
Task 12 replaces the body of `bannerScript` with the full console banner and fetch wrapper.

- [ ] **Step 3: Run, verify fail**

Run: `node --test test/neon-env/fastify-plugin.test.js`
Expected: FAIL with `Cannot find module '.../fastify-plugin.js'`

- [ ] **Step 4: Implement `fastify-plugin.js`**

```js
'use strict';
/**
 * Resolves every request to a Neon environment and runs the rest of the
 * request lifecycle inside that environment's AsyncLocalStorage context.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §2-§4
 */
const fp = require('fastify-plugin');
const { resolveRequest } = require('./resolve.js');
const context = require('./context.js');
const { getRegistry } = require('./registry.js');
const { injectBanner } = require('./page-banner.js');

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60,
};

async function neonEnvPlugin(fastify, opts) {
  const registryOf = opts.getRegistry || getRegistry;

  fastify.decorateRequest('neonAuth', null);
  fastify.decorateRequest('neonEnv', null);

  // Callback-style hook: context.run(env, done) makes the rest of the lifecycle run inside the env context
  fastify.addHook('onRequest', (request, reply, done) => {
    const r = resolveRequest(request, registryOf());
    request.neonAuth = r.auth;
    request.neonEnv = r.env;

    if (r.error) {
      if (r.error.log) console.warn(r.error.log);
      reply.code(r.error.status).send({ error: r.error.message });
      return;
    }
    if (r.setEnvCookie) reply.setCookie('neonEnv', r.setEnvCookie, COOKIE_OPTS);
    if (r.clearEnvCookie) reply.clearCookie('neonEnv', { path: '/' });
    if (r.env) {
      reply.header('X-Neon-Env', r.env.id);
      reply.header('X-Neon-Env-Bo', r.env.neon.bo.host || '');
    }
    context.run(r.env, done);
  });

  fastify.addHook('onSend', (request, reply, payload, done) => {
    const type = String(reply.getHeader('content-type') || '');
    if (typeof payload !== 'string' || !type.includes('text/html')) return done(null, payload);
    done(null, injectBanner(payload, request.neonEnv));
  });
}

module.exports = fp(neonEnvPlugin, { name: 'neon-env', dependencies: ['@fastify/cookie'] });
```

- [ ] **Step 5: Run plugin tests**

Run: `node --test test/neon-env/fastify-plugin.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Rewrite `auth.js` `authenticate` and add `isAdminRequest`**

Replace the `authenticate` function (lines 1-37) with:
```js
const { resolveRequest } = require('./neon-env/resolve.js');
const { getRegistry } = require('./neon-env/registry.js');

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 // 24 hours in seconds
};

/**
 * Authentication helper for API endpoints.
 * Uses the result resolved by the neon-env Fastify plugin (request.neonAuth);
 * falls back to resolving on the spot when the plugin is not registered.
 * Sets the apikey cookie on success.
 *
 * @returns {Object} - { authenticated, apikey, role: 'admin'|'limited'|null, env: Env|null }
 */
function authenticate(request, reply) {
  const auth = request.neonAuth || resolveRequest(request, getRegistry()).auth;
  if (!auth.authenticated) {
    return { authenticated: false, apikey: null, role: null, env: null };
  }
  reply.setCookie('apikey', auth.apikey, COOKIE_OPTS);
  return { authenticated: true, apikey: auth.apikey, role: auth.role, env: request.neonEnv || null };
}

/** True when the request carries an admin-role key (global admin or env-bound admin). */
function isAdminRequest(request) {
  const auth = request.neonAuth || resolveRequest(request, getRegistry()).auth;
  return auth.authenticated && auth.role === 'admin';
}
```
Add `isAdminRequest` to `module.exports`.

- [ ] **Step 7: Switch plugin-style route guards to `isAdminRequest`**

- `src/requestHandlers/neon-config.js`: add `const { isAdminRequest } = require('../helpers/auth.js');`. In `registerRoutes`, replace the body of the `preHandler` hook with:
  ```js
      if (!isAdminRequest(request)) {
          return reply.status(401).send({
              success: false,
              error:   'Unauthorized: Invalid or missing API key'
          });
      }
  ```
- `src/requestHandlers/iab-taxonomies.js:398-405`: same replacement (keep that file's existing error body).
- `src/requestHandlers/tag-manager.js:822-835`: replace the `requestApiKey !== apikey` check with `if (!isAdminRequest(request)) { …existing 401… }`. Keep its `reply.setCookie('apikey', …)` but source the value from `request.neonAuth.apikey`.
- In all three files, remove the now-unused `const { apikey } = options;`. In `server.js`, the `registerRoutes(fastify, { apikey: … })` calls stay; the option is simply ignored.

- [ ] **Step 8: Wire into `server.js`**

After the `@fastify/cookie` registration (`:42-46`), add:
```js
// Neon environment resolution (per-request env context, X-Neon-Env headers, console banner)
const neonEnv = require("./src/helpers/neon-env");
const { printRegistrySummary } = require("./src/helpers/neon-env/registry.js");
fastify.register(require("./src/helpers/neon-env/fastify-plugin.js"));
printRegistrySummary(neonEnv.getRegistry());
```
In `/services` (`:194-200`), replace `location: process.env.NEON_EXT_LOCATION || "Unknown",` with:
```js
    location: request.neonEnv?.label || "No environment",
    neonEnvs: neonEnv.getRegistry().list().map(e => ({ id: e.id, label: e.label, boHost: e.neon.bo.host, current: e.id === request.neonEnv?.id })),
    registryWarning: neonEnv.getRegistry().loadError || null,
```
Change the `/services` handler signature to `async function handler(request, reply)` if it doesn't already take `request`.

Replace the `/test` handler body (`:205-219`) with:
```js
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return reply.status(200).send({
    message: "Neon Integrations Up and Running",
    version: appVersion,
    location: request.neonEnv?.label || "No environment",
    neonEnv: request.neonEnv?.id || null,
  });
```
Also ensure `const { authenticate, isAdminRequest } = require("./src/helpers/auth.js");` exists near the top of `server.js`; add it if missing.

Add the temporary probe route (next to `/test`):
```js
// TEMPORARY probe (spec §10 step 2): which headers does the Neon proxy forward? Remove after rollout step 2.
fastify.get("/debug/headers", async function handler(request, reply) {
  if (!isAdminRequest(request)) return reply.status(401).send({ error: "Unauthorized" });
  const redacted = { ...request.headers };
  for (const k of ["apikey", "cookie", "authorization"]) if (redacted[k]) redacted[k] = "[redacted]";
  return { headers: redacted, resolvedEnv: request.neonEnv?.id || null, role: request.neonAuth.role, global: request.neonAuth.global };
});
```
Replace the startup log at `:549` with:
```js
    console.log(`🔗 Neon environments: ${neonEnv.getRegistry().ids().join(', ') || '(none)'}`);
```

- [ ] **Step 9: Services dashboard banner**

In `src/pages/services-dashboard.hbs`, directly after the opening `<body…>` tag, add:
```hbs
{{#if registryWarning}}
<div style="background:#b00020;color:#fff;padding:8px 16px;font-weight:600">⚠️ Neon environment registry unusable, running in legacy mode: {{registryWarning}}</div>
{{/if}}
{{#if neonEnvs.length}}
<div style="padding:6px 16px;font-size:13px;background:#f2f4f7">Neon environments:
  {{#each neonEnvs}}<span style="margin-right:12px">{{#if current}}<b>● {{label}}</b>{{else}}{{label}}{{/if}} <code>{{id}}</code> ({{boHost}})</span>{{/each}}
</div>
{{/if}}
```

- [ ] **Step 10: Smoke test**

Run: `npm test`. Expected: all PASS.
Then: `node --env-file=.env server.js`, and in another shell `curl -s -H "apikey: $NEON_EXT_APIKEY" localhost:3000/test`.
Expected: the startup log shows `[neon-env] registry source: legacy`; the response has `"neonEnv":"legacy"` and headers `X-Neon-Env: legacy`. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add src/helpers/neon-env/fastify-plugin.js src/helpers/neon-env/page-banner.js src/helpers/auth.js server.js src/requestHandlers/neon-config.js src/requestHandlers/iab-taxonomies.js src/requestHandlers/tag-manager.js src/pages/services-dashboard.hbs package.json package-lock.json test/neon-env/fastify-plugin.test.js
git commit -m "feat(neon-env): resolve env per request via Fastify plugin; auth uses resolved key"
```

---

### Task 5: Require auth on metrics and mobile client routes

**Files:**
- Modify: `src/requestHandlers/neon-metrics.js:11,71`, `src/requestHandlers/mobile-client.js:47,64,96,127,148`
- Create: `test/neon-env/routes-auth.test.js`

**Interfaces:**
- Consumes: `authenticate(request, reply)` (Task 4)

- [ ] **Step 1: Write failing test**

`test/neon-env/routes-auth.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  const metrics = require('../../src/requestHandlers/neon-metrics.js');
  const mobile = require('../../src/requestHandlers/mobile-client.js');
  app.get('/neon/api/core/metrics', metrics.getMetricsReportsHandler);
  app.get('/neon/api/core/metrics/*', metrics.getMetricsDataHandler);
  app.get('/mobileclient/api/articles', mobile.getMobileClientApiArticlesHandler);
  app.post('/mobileclient/save', mobile.postMobileClientSaveHandler);
  return app;
}

test('metrics and mobile client routes reject requests without a key', async () => {
  const app = await buildApp();
  for (const [method, url] of [['GET', '/neon/api/core/metrics'], ['GET', '/neon/api/core/metrics/x'], ['GET', '/mobileclient/api/articles'], ['POST', '/mobileclient/save']]) {
    const res = await app.inject({ method, url });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('metrics demo mode works with a key', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/neon/api/core/metrics?demo=true', headers: { apikey: 'key-a' } });
  assert.equal(res.statusCode, 200);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/routes-auth.test.js`
Expected: FAIL (status 200/500 instead of 401)

- [ ] **Step 3: Add auth guards**

In `neon-metrics.js`, add the following as the first statement of both `getMetricsReportsHandler` and `getMetricsDataHandler`:
```js
    const auth = authenticate(request, reply);
    if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });
```
In `mobile-client.js`:
- Add `const { authenticate } = require('../helpers/auth.js');` at the top.
- Rename `_request` to `request` in `getMobileClientHandler` and `getMobileClientApiArticlesHandler`.
- Add the same two-line guard as the first statement of all five handlers (`:47`, `:64`, `:96`, `:127`, `:148`).

The page is opened once as `/mobileclient?apikey=<key>`. `authenticate` sets the `apikey` cookie, and the page's same-origin `fetch` calls send it.

- [ ] **Step 4: Run tests**

Run: `node --test test/neon-env/routes-auth.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/requestHandlers/neon-metrics.js src/requestHandlers/mobile-client.js test/neon-env/routes-auth.test.js
git commit -m "fix(security): require apikey on Neon metrics and mobile client routes"
```

---

### Task 6: Env-bound helpers and templates

**Files:**
- Modify: `src/helpers/sites-helpers.js`, `src/images-importer.js:171`, `src/helpers/neon-content-parser.js:180`, `src/requestHandlers/neon-events.js:12-16`, `src/helpers/pdf-generator.js:20`, `src/mailjet/mailjet.js:67`
- Modify: `neonAppUrl` in `src/requestHandlers/panels.js` (`:44,401,421,579,740,804,820,855`), `src/requestHandlers/widgets.js` (`:126,273,286,415,433,464,602,691,747`), `src/requestHandlers/claude-chat-handler.js:29`, `src/requestHandlers/trello.js:13`
- Create: `test/neon-env/sites-helpers.test.js`

**Interfaces:**
- Consumes: `requireEnv`, `currentEnv`, `appUrl()`, `insecureTls()` (Task 2), `NeonEnvConfigError` (Task 1)
- Produces: `sites-helpers.getFrontOfficeUrl(siteName, environment)` (now exported), which throws `NeonEnvConfigError` (501) when `neon.fo` is missing

- [ ] **Step 1: Write failing test**

`test/neon-env/sites-helpers.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const sites = require('../../src/helpers/sites-helpers.js');
const { envJson, registryJson } = require('./fixtures.js');

const noFo = envJson('nofo'); delete noFo.neon.fo;
const reg = buildRegistry({ json: registryJson([envJson('a'), noFo]), envVars: {} });

test('FO url comes from current env, site name case-insensitive', () => {
  const url = context.run(reg.get('a'), () => sites.getFrontOfficeUrl('TheGlobe', 'live'));
  assert.equal(url, 'https://fo-a.example.com');
});

test('env without neon.fo -> 501 NeonEnvConfigError', () => {
  assert.throws(() => context.run(reg.get('nofo'), () => sites.getFrontOfficeUrl('theglobe', 'live')), (err) => err.name === 'NeonEnvConfigError' && err.statusCode === 501);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/sites-helpers.test.js`
Expected: FAIL with `sites.getFrontOfficeUrl is not a function`

- [ ] **Step 3: Rewrite `sites-helpers.js` config access**

Replace `const NEON_FO_APIKEY = process.env.NEON_FO_APIKEY;` (`:4`) with:
```js
const { requireEnv } = require('./neon-env/context.js');
const { NeonEnvConfigError } = require('./neon-env/errors.js');

function foConfig() {
  const env = requireEnv();
  if (!env.neon.fo) throw new NeonEnvConfigError(`FO not configured for env ${env.id}`, 501);
  return env.neon.fo;
}
```
Replace `getFrontOfficeUrl` with:
```js
function getFrontOfficeUrl(siteName, environment = 'live') {
  const url = foConfig().sites?.[String(siteName).toLowerCase()]?.[String(environment).toLowerCase()];
  console.log(`[getFrontOfficeUrl] env=${requireEnv().id} siteName: ${siteName}, environment: ${environment}, returning: ${url}`);
  return url;
}
```
- Replace every remaining `NEON_FO_APIKEY` identifier in the file with `foConfig().apiKey`.
- Remove `, NEON_FO_APIKEY: ${NEON_FO_APIKEY}` from the `getNodeById` and `getResource` log lines; they log a secret.
- Add `getFrontOfficeUrl` to `module.exports`.

- [ ] **Step 4: Other env-bound reads**

- `src/images-importer.js:171`: delete the line that logs `process.env.NEON_FO_APIKEY`, since it logs a secret. If `NEON_FO_APIKEY` is read elsewhere in that function, replace it with `require('./helpers/neon-env').requireEnv().neon.fo?.apiKey`. Check with `grep -n NEON_FO src/images-importer.js`; expected: no output.
- `src/helpers/neon-content-parser.js:180`: `const neonBaseUrl = require('./neon-env').currentEnv()?.neon.bo.url || '';`
- `src/requestHandlers/neon-events.js:12-16`: replace with:
  ```js
  const env = request.neonEnv;
  const neonAppUrl = env?.neon.app.url;
  const neonBoApiKey = env?.neon.bo.apiKey;
  if (!neonAppUrl || !neonBoApiKey) {
    return reply.status(503).send({ error: `Neon not configured for env ${env?.id || '(none)'}: app url or BO api key missing` });
  }
  ```
- `src/helpers/pdf-generator.js:20` and `src/mailjet/mailjet.js:67`: replace the condition `process.env.NEON_EXT_LOCATION === 'Local'` with `require('<relative>/helpers/neon-env').insecureTls()`. The relative path is `./neon-env` from `pdf-generator.js` and `../helpers/neon-env` from `mailjet.js`; hoist it as `const neonEnv = require(...)` at the top of each file. Legacy maps `Local` → `insecureTls`, so behaviour stays the same.
- `src/helpers/methode-bo-api.js:28-30`: **leave as is**. Méthode uses `axios-cookiejar-support`, which rejects custom `httpsAgent`s, so its Local-only global flag stays (spec Amendments).

- [ ] **Step 5: `neonAppUrl` in templates**

In `panels.js`, `widgets.js`, `claude-chat-handler.js` and `trello.js`:
1. Add near the other requires: `const neonEnv = require("../helpers/neon-env");`. First run `grep -n "neonEnv" <file>`; if the name is already taken, use `neonEnvCtx`.
2. Run `sed -i '' 's/process\.env\.NEON_APP_URL/neonEnv.appUrl()/g' <file>` on each file.
3. In the same `reply.view` param objects, add `neonEnv: request.neonEnv ? { id: request.neonEnv.id, label: request.neonEnv.label, boHost: request.neonEnv.neon.bo.host } : null,`. This is only needed where `window.CONFIG` is built from params in React shells (`neon-grid.hbs`, `print-query-board`, `nss-demo`); the inline banner (Task 12) already covers the console for every page.

Check with `grep -rn "NEON_APP_URL" src | grep -v neon-env`. Expected: no output.

- [ ] **Step 6: Run tests + smoke**

Run: `npm test`. Expected: PASS.
Start the server and open `/services?apikey=$NEON_EXT_APIKEY`. It should render, and a panel with `?demo=true` should still render.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/sites-helpers.js src/images-importer.js src/helpers/neon-content-parser.js src/requestHandlers/neon-events.js src/helpers/pdf-generator.js src/mailjet/mailjet.js src/requestHandlers/panels.js src/requestHandlers/widgets.js src/requestHandlers/claude-chat-handler.js src/requestHandlers/trello.js test/neon-env/sites-helpers.test.js
git commit -m "feat(neon-env): FO, App URL, notifier and TLS read from the request's environment"
```

---

### Task 7: Services config with per-block global fallback

**Files:**
- Create: `src/helpers/neon-env/services.js`, `test/neon-env/services.test.js`
- Modify: `src/helpers/neon-env/index.js`

**Interfaces:**
- Consumes: `currentEnv` (Task 2), `NeonEnvConfigError` (Task 1)
- Produces:
  - `serviceConfig(name, { envVars? }) → object` (including a `source: 'global' | 'env:<id>'` field)
  - `requireService(name, fields[]) → object` (throws `NeonEnvConfigError`)
  - `missingServiceFields(name, fields[]) → string[]`: env var names for the global source, `services.<name>.<field>` for the env source
  - `GLOBAL_SERVICES` map

- [ ] **Step 1: Write failing tests**

`test/neon-env/services.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { serviceConfig, requireService, missingServiceFields } = require('../../src/helpers/neon-env/services.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({
  json: registryJson([
    envJson('a', { services: { trello: { apiKey: 'env-trello', token: 'env-token' }, telegram: { botToken: 'bt', chatIds: { theglobe: 'tg-a' } } } }),
    envJson('b'),
  ]),
  envVars: {},
});
const globals = { TRELLO_APIKEY: 'g-trello', TRELLO_TOKEN: 'g-token', TRELLO_ORGANIZATION_ID: 'g-org', PEXELS_APIKEY: 'g-pex', TELEGRAM_CHAT_ID: 'g-chat' };

test('env block wins and is never merged with globals', () => {
  const cfg = context.run(reg.get('a'), () => serviceConfig('trello', { envVars: globals }));
  assert.equal(cfg.apiKey, 'env-trello');
  assert.equal(cfg.organizationId, undefined);
  assert.equal(cfg.source, 'env:a');
});

test('env without block falls back to globals', () => {
  const cfg = context.run(reg.get('b'), () => serviceConfig('trello', { envVars: globals }));
  assert.equal(cfg.apiKey, 'g-trello');
  assert.equal(cfg.organizationId, 'g-org');
  assert.equal(cfg.source, 'global');
});

test('no context uses globals; nested chatIds map works', () => {
  assert.equal(serviceConfig('pexels', { envVars: globals }).apiKey, 'g-pex');
  assert.equal(serviceConfig('telegram', { envVars: globals }).chatIds.default, 'g-chat');
});

test('requireService names env and missing fields', () => {
  assert.throws(
    () => context.run(reg.get('a'), () => requireService('trello', ['apiKey', 'organizationId'])),
    /trello incomplete for env a: missing services\.trello\.organizationId/
  );
});

test('missingServiceFields reports env var names for globals', () => {
  assert.deepEqual(missingServiceFields('twitter', ['apiKey'], { envVars: {} }), ['TWITTER_API_KEY']);
});

test('unknown service throws', () => {
  assert.throws(() => serviceConfig('nope'), /Unknown service/);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/services.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement `services.js`**

```js
'use strict';
/**
 * Third-party service config: per-environment block, else global env vars.
 * Fallback is per block, never per field (credentials from different accounts never mix).
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §5
 */
const { currentEnv } = require('./context.js');
const { NeonEnvConfigError } = require('./errors.js');

const GLOBAL_SERVICES = {
  anthropic: { apiKey: 'ANTHROPIC_API_KEY', chatModel: 'CLAUDE_CHAT_MODEL' },
  openai: { apiKey: 'OPENAI_APIKEY' },
  pexels: { apiKey: 'PEXELS_APIKEY' },
  youtube: { apiKey: 'YOUTUBE_APIKEY' },
  dailymotion: { apiKey: 'DAILYMOTION_APIKEY', apiSecret: 'DAILYMOTION_APISECRET' },
  trello: { apiKey: 'TRELLO_APIKEY', token: 'TRELLO_TOKEN', organizationId: 'TRELLO_ORGANIZATION_ID', panelDraggable: 'TRELLO_PANEL_DRAGGABLE' },
  guardian: { apiKey: 'GUARDIAN_APIKEY' },
  deepl: { apiKey: 'DEEPL_APIKEY' },
  sendgrid: { apiKey: 'SENDGRID_APIKEY' },
  mailjet: { apiKey: 'MAILJET_APIKEY', apiSecret: 'MAILJET_APISECRET' },
  telegram: { botToken: 'TELEGRAM_BOT_TOKEN', chatIds: { default: 'TELEGRAM_CHAT_ID', theglobe: 'TELEGRAM_THEGLOBE_CHAT_ID' } },
  methode: {
    server: 'EDAPI_SERVER', restEndpoint: 'EDAPI_REST_ENDPOINT', connectionId: 'EDAPI_CONNECTIONID', databaseId: 'EDAPI_DATABASEID',
    username: 'EDAPI_USERNAME', password: 'EDAPI_PASSWORD', swingHost: 'SWING_HOST', swingAppUrl: 'SWING_APP_URL',
  },
  bluesky: { handle: 'BLUESKY_HANDLE', appPassword: 'BLUESKY_APP_PASSWORD' },
  twitter: { apiKey: 'TWITTER_API_KEY', apiSecret: 'TWITTER_API_SECRET', accessToken: 'TWITTER_ACCESS_TOKEN', accessSecret: 'TWITTER_ACCESS_SECRET' },
  facebook: { pageId: 'FACEBOOK_PAGE_ID', pageAccessToken: 'FACEBOOK_PAGE_ACCESS_TOKEN' },
  instagram: { accountId: 'INSTAGRAM_ACCOUNT_ID', accessToken: 'INSTAGRAM_ACCESS_TOKEN' },
  threads: { userId: 'THREADS_USER_ID', accessToken: 'THREADS_ACCESS_TOKEN' },
};

function fromEnvVars(map, envVars) {
  const out = {};
  for (const [field, source] of Object.entries(map)) {
    out[field] = typeof source === 'object' ? fromEnvVars(source, envVars) : envVars[source];
  }
  return out;
}

function serviceConfig(name, { envVars = process.env } = {}) {
  if (!GLOBAL_SERVICES[name]) throw new Error(`Unknown service '${name}'`);
  const env = currentEnv();
  const block = env?.services?.[name];
  if (block) return { ...block, source: `env:${env.id}` };
  return { ...fromEnvVars(GLOBAL_SERVICES[name], envVars), source: 'global' };
}

function missingServiceFields(name, fields, opts = {}) {
  const cfg = serviceConfig(name, opts);
  const missing = fields.filter((f) => !cfg[f]);
  if (cfg.source === 'global') return missing.map((f) => GLOBAL_SERVICES[name][f]);
  return missing.map((f) => `services.${name}.${f}`);
}

function requireService(name, fields, opts = {}) {
  const cfg = serviceConfig(name, opts);
  const missing = missingServiceFields(name, fields, opts);
  if (missing.length) {
    const where = cfg.source === 'global' ? 'not configured' : `incomplete for env ${cfg.source.slice(4)}`;
    throw new NeonEnvConfigError(`${name} ${where}: missing ${missing.join(', ')}`);
  }
  return cfg;
}

module.exports = { GLOBAL_SERVICES, serviceConfig, requireService, missingServiceFields };
```

In `src/helpers/neon-env/index.js`, add `const services = require('./services.js');` and export `serviceConfig: services.serviceConfig, requireService: services.requireService, missingServiceFields: services.missingServiceFields`.

- [ ] **Step 4: Run tests**

Run: `node --test test/neon-env/services.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/neon-env/services.js src/helpers/neon-env/index.js test/neon-env/services.test.js
git commit -m "feat(neon-env): per-environment service config with global fallback"
```

---

### Task 8: Migrate service consumers to `serviceConfig`

**Files:** (every row of the table below)

**Interfaces:**
- Consumes: `serviceConfig`, `missingServiceFields` (Task 7), via `require('<rel>/helpers/neon-env')` (from `src/helpers/*` use `./neon-env`)

**Rule:** each `process.env.X` in the table becomes a **call-time** read `serviceConfig('<svc>').<field>`. A module-level `const X = process.env.X` is deleted and its uses are replaced with the call-time read. Nothing may read a service key at module load.

| File:line | Before | After |
|---|---|---|
| `src/connectors/pexels-connector.js:3` | `const PEXELS_APIKEY = process.env.PEXELS_APIKEY;` | delete; uses → `serviceConfig('pexels').apiKey` |
| `src/connectors/youtube-connector.js:3` | `const YOUTUBE_APIKEY = …` | delete; uses → `serviceConfig('youtube').apiKey` |
| `src/connectors/dailymotion-connector.js:3-4` | module consts | delete; uses → `serviceConfig('dailymotion').apiKey` / `.apiSecret` |
| `src/connectors/guardian-connector.js:7` | `const apiKey = …` | delete; uses → `serviceConfig('guardian').apiKey` |
| `src/stories-populator.js:119` | `process.env.DEEPL_APIKEY` | `serviceConfig('deepl').apiKey` |
| `src/ai/openai.js:6` | module const | delete; uses → `serviceConfig('openai').apiKey` |
| `src/helpers/social-media-helper.js:56,71` | `process.env.ANTHROPIC_API_KEY`, `process.env.OPENAI_APIKEY` | `serviceConfig('anthropic').apiKey`, `serviceConfig('openai').apiKey` |
| `src/helpers/claude-chat-helper.js:12-13,326` | singleton `_anthropic` | see Step 2 |
| `src/sendgrid/sendgrid.js:3` | `sgMail.setApiKey(process.env.SENDGRID_APIKEY)` at load | see Step 3 |
| `src/mailjet/mailjet.js:7` | `process.env.MAILJET_APIKEY` / `…APISECRET` | `const mj = serviceConfig('mailjet');` then `${mj.apiKey}:${mj.apiSecret}` |
| `src/telegram/telegram.js:4,41` | `process.env.TELEGRAM_BOT_TOKEN` | `serviceConfig('telegram').botToken` |
| `src/telegram/telegram.js:94,171,214` | `process.env.TELEGRAM_THEGLOBE_CHAT_ID \|\| process.env.TELEGRAM_CHAT_ID` | `(serviceConfig('telegram').chatIds?.theglobe \|\| serviceConfig('telegram').chatIds?.default)` |
| `src/images-importer.js:14-15,37-38` | `process.env.TRELLO_APIKEY` / `TRELLO_TOKEN` | `serviceConfig('trello').apiKey` / `.token` |
| `src/requestHandlers/panels.js:45-49,93` | `TRELLO_*` | `serviceConfig('trello').apiKey/.token/.organizationId`, `!!serviceConfig('trello').panelDraggable` |
| `src/requestHandlers/panels.js:66-69,148,206,246,260-261,805-808` | `PEXELS_APIKEY`, `YOUTUBE_APIKEY`, `DAILYMOTION_*` | `serviceConfig('pexels').apiKey`, `serviceConfig('youtube').apiKey`, `serviceConfig('dailymotion').apiKey/.apiSecret` |
| `src/requestHandlers/panels.js:402-403,445-446` | `SWING_APP_URL`, `SWING_HOST`, `EDAPI_USERNAME/PASSWORD` | `serviceConfig('methode').swingAppUrl/.swingHost/.username/.password` |
| `src/helpers/methode-bo-api.js:17-21` | `options.x \|\| process.env.EDAPI_*` | `const cfg = serviceConfig('methode');` at the constructor's top; `options.server \|\| cfg.server`, `cfg.restEndpoint`, `cfg.connectionId`, `cfg.databaseId` |
| `src/helpers/methode-bo-api.js:600-601,672-673` | `process.env.EDAPI_USERNAME/PASSWORD` | `serviceConfig('methode').username/.password` |
| `src/neon-to-methode.js:10-11` | module consts `USERNAME`, `PASSWORD` | delete; each use → `serviceConfig('methode').username` / `.password` |
| `src/connectors/bluesky-connector.js:25-26` | `process.env.BLUESKY_HANDLE/APP_PASSWORD` | `serviceConfig('bluesky').handle/.appPassword` |
| `src/connectors/bluesky-connector.js:352-354` | `getStatus` | see Step 4 |
| `src/connectors/twitter-connector.js:9,16,20,29` | `REQUIRED_VARS` + `process.env.TWITTER_*` | `getStatus` per Step 4; `serviceConfig('twitter').apiKey/.accessToken/.apiSecret/.accessSecret` |
| `src/connectors/facebook-connector.js:8,10,14-15,35` | same pattern | `serviceConfig('facebook').pageId/.pageAccessToken` |
| `src/connectors/instagram-connector.js:8,27-28,58` | same pattern | `serviceConfig('instagram').accountId/.accessToken` |
| `src/connectors/threads-connector.js:8,14-15,48` | same pattern | `serviceConfig('threads').userId/.accessToken` |

- [ ] **Step 1: Apply the table**

In each file, add a `const { serviceConfig, missingServiceFields } = require('<rel>/helpers/neon-env');` with the right relative path (`../helpers/neon-env` from `src/connectors`, `src/requestHandlers`, `src/ai`, `src/sendgrid`, `src/mailjet`, `src/telegram`; `./helpers/neon-env` from `src/*.js`; `./neon-env` from `src/helpers/*.js`). Import only what the file uses.

- [ ] **Step 2: Anthropic client cache (`claude-chat-helper.js:10-16`)**

Replace the lazy singleton with a per-key cache:
```js
const anthropicClients = new Map();
function getAnthropic() {
  const { apiKey } = serviceConfig('anthropic');
  if (!apiKey) return null;
  if (!anthropicClients.has(apiKey)) anthropicClients.set(apiKey, new Anthropic({ apiKey }));
  return anthropicClients.get(apiKey);
}
```
Keep the function name the file already uses for the singleton getter. If it differs, rename the function above to match and remove the `_anthropic` variable.
`:326` becomes `model: serviceConfig('anthropic').chatModel || 'claude-sonnet-4-6',`.

- [ ] **Step 3: Sendgrid per-key client (`sendgrid.js:1-3`)**

Replace the module-level `setApiKey` with:
```js
const { MailService } = require('@sendgrid/mail');
const { serviceConfig } = require('../helpers/neon-env');
const mailServices = new Map();
function mailer() {
  const { apiKey } = serviceConfig('sendgrid');
  if (!mailServices.has(apiKey)) {
    const svc = new MailService();
    svc.setApiKey(apiKey);
    mailServices.set(apiKey, svc);
  }
  return mailServices.get(apiKey);
}
```
Then replace each `sgMail.send(` / `sgMail.sendMultiple(` with `mailer().send(` / `mailer().sendMultiple(`, and remove the old `sgMail` require if it's no longer used.

- [ ] **Step 4: Social `getStatus` functions**

Pattern (twitter shown; do the same for facebook, instagram, threads and bluesky with their fields from the `GLOBAL_SERVICES` map):
```js
const REQUIRED_FIELDS = ['apiKey', 'apiSecret', 'accessToken', 'accessSecret'];

function getStatus() {
  const missing = missingServiceFields('twitter', REQUIRED_FIELDS);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true };
}
```
Keep each connector's extra success fields: bluesky returns `handle: serviceConfig('bluesky').handle`, and facebook returns `pageId: serviceConfig('facebook').pageId`.
The bluesky session cache (module-level `session` object): key it by handle, e.g. `const sessions = new Map()` with `sessions.get(handle)`, so two envs with different Bluesky accounts don't share a session. Apply the same change wherever the file reads or writes the cached session.

- [ ] **Step 5: Verify nothing reads service keys from `process.env` any more**

Run: `grep -rnE "process\.env\.(ANTHROPIC|CLAUDE_CHAT|OPENAI|PEXELS|YOUTUBE|DAILYMOTION|TRELLO|GUARDIAN|DEEPL|SENDGRID|MAILJET|TELEGRAM|EDAPI|SWING|BLUESKY|TWITTER|FACEBOOK|INSTAGRAM|THREADS)" src | grep -v "src/helpers/neon-env/"`
Expected: no output. Also run `grep -rn "REQUIRED_VARS" src/connectors`; expected: no output.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS. The existing connector tests set `process.env.TWITTER_*` and run without an env context, so they exercise the global fallback. The error text still contains `Missing` and the env var names.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "refactor(services): read third-party credentials per environment with global fallback"
```

---

### Task 9: Delayed importer bound to its environment

**Files:**
- Modify: `src/delayed-importer.js` (`publicJob :82-95`, `runTick :106`, `createJob`, `getJob`, `listJobs`, `cancelJob`), `src/requestHandlers/neon-delayed-import.js`, `src/requestHandlers/neon-rss-delayed-import.js:118`
- Test: `test/delayed-importer.test.js` (extend)

**Interfaces:**
- Consumes: `context.run`, `currentEnv` (Task 2), `getRegistry` (Task 1)
- Produces:
  - `createJob(body, deps = {}, { envId } = {})`: `envId` defaults to `currentEnv()?.id || null`. `deps.getEnv(id)` is test-only and defaults to `id => getRegistry().get(id)`.
  - `getJob(jobId, { envId } = {})`, `listJobs({ envId } = {})`, `cancelJob(jobId, { envId } = {})`: `envId` null/undefined means no filter (global admin); otherwise jobs of other envs are invisible (treated as not found).
  - `publicJob` adds `envId` and `error`. New state `'failed'`.

- [ ] **Step 1: Write failing tests (append to `test/delayed-importer.test.js`)**

```js
const context = require('../src/helpers/neon-env/context.js');

function fakeEnv(id) { return { id, hosts: [], neon: { bo: { url: `https://${id}` } }, services: {} }; }

test('ticks run inside the job env even when other env requests interleave', async () => {
  const envs = { a: fakeEnv('a'), b: fakeEnv('b') };
  const seen = [];
  const deps = {
    getEnv: (id) => envs[id] || null,
    dispatchStory: async () => { seen.push(context.currentEnv()?.id); return { familyRef: 'x' }; },
  };
  const { jobId } = context.run(envs.a, () => delayedImporter.createJob(basePayload({ duration: 0.0005 }), deps));
  // unrelated work in env b while the job ticks
  await context.run(envs.b, () => new Promise((r) => setTimeout(r, 50)));
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(seen, ['a', 'a', 'a']);
  assert.equal(delayedImporter.getJob(jobId).envId, 'a');
});

test('job fails when its env is no longer registered', async () => {
  const deps = { getEnv: () => null, dispatchStory: async () => ({ familyRef: 'x' }) };
  const { jobId } = delayedImporter.createJob(basePayload(), deps, { envId: 'gone' });
  await new Promise((r) => setTimeout(r, 10));
  const job = delayedImporter.getJob(jobId);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /env 'gone' no longer registered/);
});

test('job list and lookup are filtered by env', () => {
  const deps = { getEnv: () => fakeEnv('a'), dispatchStory: async () => ({}) };
  const { jobId } = delayedImporter.createJob(basePayload({ duration: 60 }), deps, { envId: 'a' });
  assert.ok(delayedImporter.listJobs({ envId: 'a' }).some((j) => j.jobId === jobId));
  assert.ok(!delayedImporter.listJobs({ envId: 'b' }).some((j) => j.jobId === jobId));
  assert.equal(delayedImporter.getJob(jobId, { envId: 'b' }), null);
  assert.equal(delayedImporter.cancelJob(jobId, { envId: 'b' }), null);
  assert.ok(delayedImporter.listJobs().some((j) => j.jobId === jobId && j.envId === 'a'));
  delayedImporter.cancelJob(jobId);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/delayed-importer.test.js`
Expected: the new tests FAIL (`envId` undefined, state not `failed`)

- [ ] **Step 3: Implement**

At the top of `src/delayed-importer.js`:
```js
const context = require('./helpers/neon-env/context.js');
```
In `createJob`, add to `dispatchers`:
```js
    getEnv: deps.getEnv || ((id) => require('./helpers/neon-env/registry.js').getRegistry().get(id)),
```
Change the signature to `function createJob(body, deps = {}, options = {})`, and in the `job` object add:
```js
    envId: options.envId || context.currentEnv()?.id || null,
    error: null,
```
In `runTick`, after `if (job.state !== 'running') return;`, add:
```js
  let env = null;
  if (job.envId) {
    env = deps.getEnv(job.envId);
    if (!env) {
      job.error = `env '${job.envId}' no longer registered`;
      console.error(`❌ delayed-import ${job.jobId}: ${job.error}`);
      finishJob(job, 'failed');
      return;
    }
  }
```
and wrap the dispatch call:
```js
    const outcome = await context.run(env, () => dispatch(item, job));
```
In `publicJob`, add `envId: job.envId,` and `error: job.error,`. In `listJobs`' mapped object, add `envId: job.envId,`.

Add the filter helper and use it:
```js
function visible(job, envId) {
  return !!job && (envId === undefined || envId === null || job.envId === envId);
}

function getJob(jobId, { envId } = {}) {
  const job = jobs.get(jobId);
  return visible(job, envId) ? publicJob(job) : null;
}

function listJobs({ envId } = {}) {
  return Array.from(jobs.values()).filter((job) => visible(job, envId)).map((job) => ({
    jobId: job.jobId,
    envId: job.envId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    nextFireAt: job.nextFireAt,
  }));
}
```
In `cancelJob(jobId, { envId } = {})`: after `const job = jobs.get(jobId);`, return `null` when `!visible(job, envId)`.

In `src/requestHandlers/neon-delayed-import.js`, compute the filter once per handler:
```js
const scope = { envId: request.neonAuth?.global ? null : request.neonEnv?.id };
```
and pass it: `delayedImporter.listJobs(scope)`, `delayedImporter.getJob(request.params.jobId, scope)`, `delayedImporter.cancelJob(request.params.jobId, scope)`. `createJob(request.body)` stays as is, because it picks up `currentEnv()`. The same applies to `neon-rss-delayed-import.js:118`.

- [ ] **Step 4: Run tests**

Run: `node --test test/delayed-importer.test.js && npm test`
Expected: PASS (existing tests unchanged: no context, `envId` null, and ticks run with a `null` env)

- [ ] **Step 5: Commit**

```bash
git add src/delayed-importer.js src/requestHandlers/neon-delayed-import.js src/requestHandlers/neon-rss-delayed-import.js test/delayed-importer.test.js
git commit -m "feat(delayed-import): bind jobs to their Neon environment and filter by caller env"
```

---

### Task 10: Neon config cache per environment + startup warm-up

**Files:**
- Modify: `src/connectors/neon-config-connector.js` (`:5`, `:36`, `:40-80`, `:243-265`, `:299-325`), `server.js:473-495`
- Test: `test/neon-env/neon-config-connector.test.js` (create)

**Interfaces:**
- Consumes: `requireEnv`, `run` (Task 2), `getRegistry` (Task 1)
- Produces:
  - `cacheDir() → string` (`data/neon-config/<envId>`, exported for tests)
  - `initializeAll()` (unchanged contract, current env)
  - new `initializeAllEnvs(registry) → Promise<{ [envId]: results | { error } }>`

- [ ] **Step 1: Write failing test**

`test/neon-env/neon-config-connector.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const context = require('../../src/helpers/neon-env/context.js');
const connector = require('../../src/connectors/neon-config-connector.js');

test('cache dir is per environment', () => {
  const dir = context.run({ id: 'demorc' }, () => connector.cacheDir());
  assert.equal(dir, path.join(process.cwd(), 'data', 'neon-config', 'demorc'));
});

test('cache dir outside env context throws', () => {
  assert.throws(() => connector.cacheDir(), { name: 'NoNeonEnvError' });
});

test('type labels are isolated per env', () => {
  context.run({ id: 'x' }, () => connector.__setTypeLabelsForTest({ article: 'X Article' }));
  assert.equal(context.run({ id: 'x' }, () => connector.getTypeLabel('article')), 'X Article');
  assert.equal(context.run({ id: 'y' }, () => connector.getTypeLabel('article')), 'Article');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/neon-config-connector.test.js`
Expected: FAIL with `connector.cacheDir is not a function`

- [ ] **Step 3: Implement**

Replace `:5` with:
```js
const { requireEnv, run: runInEnv } = require('../helpers/neon-env/context.js');

function cacheDir() {
    return path.join(process.cwd(), 'data', 'neon-config', requireEnv().id);
}
```
Replace every `CACHE_DIR` usage (`:41`, `:42`, `:58`, `:75`) with `cacheDir()`.

Replace `let typeLabels = null;` (`:36`) with:
```js
const typeLabelsByEnv = new Map();
```
In `loadContentTypesConfig`, replace `typeLabels = types.reduce(...)` with `typeLabelsByEnv.set(requireEnv().id, types.reduce(...))`, and the return with `return typeLabelsByEnv.get(requireEnv().id) || DEFAULT_TYPE_LABELS;`.
In `getTypeLabel`, replace `const labels = typeLabels || DEFAULT_TYPE_LABELS;` with `const labels = typeLabelsByEnv.get(requireEnv().id) || DEFAULT_TYPE_LABELS;`.

Add below `initializeAll`:
```js
/**
 * Warm the cache for every registered env with warmup !== false, in parallel.
 * Failures are isolated per env and never reject.
 */
async function initializeAllEnvs(registry) {
    const envs = registry.list().filter((e) => e.warmup);
    const entries = await Promise.all(envs.map(async (env) => {
        try {
            return [env.id, await runInEnv(env, () => initializeAll())];
        } catch (error) {
            return [env.id, { error: error.message }];
        }
    }));
    return Object.fromEntries(entries);
}

function __setTypeLabelsForTest(labels) {
    typeLabelsByEnv.set(requireEnv().id, labels);
}
```
Export `cacheDir`, `initializeAllEnvs` and `__setTypeLabelsForTest`.

In `server.js:473-495`, replace the warm-up block with:
```js
const { initializeAllEnvs: initializeNeonConfigAllEnvs } = require("./src/connectors/neon-config-connector");
setImmediate(async () => {
  console.log('[Neon Config] Initializing cache for all environments...');
  const byEnv = await initializeNeonConfigAllEnvs(neonEnv.getRegistry());
  for (const [envId, results] of Object.entries(byEnv)) {
    if (results.error) {
      console.error(`[Neon Config] [env=${envId}] ✗ ${results.error}`);
      continue;
    }
    console.log(`[Neon Config] [env=${envId}] ✓ fetched: ${results.initialized.join(', ') || '-'} | cached: ${results.cached.join(', ') || '-'}`);
    results.errors.forEach(err => console.error(`[Neon Config] [env=${envId}]   - ${err.type}: ${err.error}`));
  }
});
```

- [ ] **Step 4: Check callers run inside a request**

Run: `grep -n "neonConfigConnector\.\|getTypeLabel\|loadWorkflowsConfig\|loadWorkfoldersConfig" src/requestHandlers/widgets.js`.
Every hit must be inside a request handler, which it is today, so it inherits the env context. Nothing to change unless a hit is at module top level. If one is, move it into the handler.

- [ ] **Step 5: Run tests + smoke**

Run: `npm test`. Expected: PASS.
Start the server. Expected: the log shows `[Neon Config] [env=legacy] ...`, and `data/neon-config/legacy/` gets created.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/neon-config-connector.js server.js test/neon-env/neon-config-connector.test.js
git commit -m "feat(neon-config): cache and warm up Neon config per environment"
```

---

### Task 11: Claude chat sessions scoped to environment

**Files:**
- Modify: `src/helpers/claude-chat-helper.js:281`
- Test: `test/neon-env/claude-chat-session.test.js` (create)

**Interfaces:**
- Consumes: `currentEnv` (Task 2)
- Produces: `sessionKey(sessionId) → string` (exported for the test) = `${currentEnv()?.id || 'none'}:${sessionId}`

- [ ] **Step 1: Write failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const chat = require('../../src/helpers/claude-chat-helper.js');

test('same browser session id maps to different chat sessions per env', () => {
  const a = context.run({ id: 'a' }, () => chat.sessionKey('s1'));
  const b = context.run({ id: 'b' }, () => chat.sessionKey('s1'));
  assert.equal(a, 'a:s1');
  assert.equal(b, 'b:s1');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/claude-chat-session.test.js`
Expected: FAIL with `chat.sessionKey is not a function`

- [ ] **Step 3: Implement**

In `claude-chat-helper.js`, add near the top: `const { currentEnv } = require('./neon-env/context.js');` and
```js
// A chat session never crosses Neon environments: history and tools stay bound to one instance
function sessionKey(sessionId) {
  return `${currentEnv()?.id || 'none'}:${sessionId}`;
}
```
If the session-cleanup `setInterval` at `:27` is not already `.unref()`'d, append `.unref()` to it (otherwise requiring the module keeps `node --test` alive forever).
At `:281`, change `getOrCreateSession(sessionId)` to `getOrCreateSession(sessionKey(sessionId))`. Add `sessionKey` to `module.exports`.
`new NeonClient()` at `:313` already binds to the request env (Task 2), so nothing changes there.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/claude-chat-helper.js test/neon-env/claude-chat-session.test.js
git commit -m "feat(claude-chat): scope chat sessions to the Neon environment"
```

---

### Task 12: Browser console environment banner and per-call logging

**Files:**
- Modify: `src/helpers/neon-env/page-banner.js` (replace the minimal version from Task 4)
- Test: `test/neon-env/page-banner.test.js` (create)

**Interfaces:**
- Consumes: `Env` (Task 1)
- Produces: `bannerScript(env|null) → string`, `injectBanner(html, env|null) → string` (same signatures as the Task 4 stub)

Behaviour (spec §3, amended): a single inline script injected right after `<head>` on every HTML response. It sets `window.__NEON_ENV__`, logs a styled banner, and wraps `window.fetch` once. For **same-origin** responses only, it logs `[neon-env] <id> → <METHOD> <url>`. If the `X-Neon-Env` header is missing (e.g. stripped by the Neon proxy), it logs `[neon-env] (no env header) → …`. It logs a red `console.error` when the response env differs from the page env. Because it wraps the global `fetch`, raw `fetch` calls in the ~33 templates and the React bundles are covered, not only the shared helpers.

- [ ] **Step 1: Write failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { bannerScript, injectBanner } = require('../../src/helpers/neon-env/page-banner.js');

const env = { id: 'demorc', label: 'Demo </script> RC', neon: { bo: { host: 'bo.example.com' } } };

function runScript(html, responseEnv) {
  const logs = [];
  const errors = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) },
    location: { href: 'https://app.example.com/neon/api/demo-integration/widgets/x', origin: 'https://app.example.com' },
    URL,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async () => ({ headers: { get: (h) => (h === 'X-Neon-Env' ? responseEnv : null) } });
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, sandbox);
  return { sandbox, logs, errors };
}

test('banner escapes </script> in labels and injects after <head>', () => {
  const html = injectBanner('<html><head><title>t</title></head></html>', env);
  assert.ok(html.startsWith('<html><head><script>'));
  assert.ok(!bannerScript(env).includes('Demo </script>'));
});

test('logs banner and same-origin calls, flags mismatch', async () => {
  const { sandbox, logs, errors } = runScript(bannerScript(env), 'demorc');
  assert.ok(logs[0].includes('demorc'));
  await sandbox.window.fetch('/api/neon/create', { method: 'POST' });
  assert.ok(logs.some((l) => l.includes('[neon-env] demorc → POST /api/neon/create')));

  const other = runScript(bannerScript(env), 'poc');
  await other.sandbox.window.fetch('/x');
  assert.ok(other.errors.some((e) => e.includes('MISMATCH')));
});

test('missing header is reported, cross-origin calls are silent', async () => {
  const { sandbox, logs } = runScript(bannerScript(env), null);
  await sandbox.window.fetch('/x');
  await sandbox.window.fetch('https://api.pexels.com/v1/search');
  assert.ok(logs.some((l) => l.includes('(no env header) → GET /x')));
  assert.ok(!logs.some((l) => l.includes('pexels')));
});

test('null env prints a neutral banner', () => {
  const { logs } = runScript(bannerScript(null), null);
  assert.ok(logs[0].includes('no Neon environment'));
});

test('HTML without <head> is returned untouched', () => {
  assert.equal(injectBanner('<div>x</div>', env), '<div>x</div>');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/neon-env/page-banner.test.js`
Expected: FAIL (the stub does not wrap fetch or log calls)

- [ ] **Step 3: Implement `page-banner.js`**

```js
'use strict';
/**
 * Inline console banner + fetch logger injected into every HTML page.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §3
 */

// Runs in the browser, before any other script. `e` = { id, label, boHost } | null.
const CLIENT_JS = `
var tag = '[neon-env]';
if (e) console.log('%c🟢 ' + tag + ' ' + e.id + ' (' + e.label + ') → bo: ' + e.boHost, 'background:#0a7d32;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold');
else console.log('%c⚪ ' + tag + ' no Neon environment resolved for this page', 'background:#666;color:#fff;padding:2px 6px;border-radius:3px');
if (!window.fetch || window.fetch.__neonEnvWrapped) return;
var orig = window.fetch;
var wrapped = function (input, init) {
  var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  var url = typeof input === 'string' ? input : (input && input.url) || String(input);
  var sameOrigin = true;
  try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (err) {}
  return orig.apply(this, arguments).then(function (res) {
    if (!sameOrigin) return res;
    var got = res && res.headers && res.headers.get('X-Neon-Env');
    if (!got) console.log(tag + ' (no env header) → ' + method + ' ' + url);
    else if (e && got !== e.id) console.error(tag + ' MISMATCH: page is ' + e.id + ' but ' + method + ' ' + url + ' answered from ' + got);
    else console.log(tag + ' ' + got + ' → ' + method + ' ' + url);
    return res;
  });
};
wrapped.__neonEnvWrapped = true;
window.fetch = wrapped;
`;

function bannerScript(env) {
  const info = env ? { id: env.id, label: env.label, boHost: env.neon.bo.host } : null;
  const json = JSON.stringify(info).replace(/</g, '\\u003c');
  return `<script>(function(){var e=${json};window.__NEON_ENV__=e;${CLIENT_JS}})();</script>`;
}

function injectBanner(html, env) {
  const m = html.match(/<head[^>]*>/i);
  if (!m) return html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + bannerScript(env) + html.slice(at);
}

module.exports = { bannerScript, injectBanner };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/neon-env/page-banner.test.js && npm test`
Expected: PASS. The Task 4 plugin test regex `/<head><script>\(function\(\)\{var e=\{"id":"a"/` still matches.

- [ ] **Step 5: Manual check**

Start the server and open `http://localhost:3000/widgets/neon-grid?demo=true&apikey=$NEON_EXT_APIKEY` in a browser.
DevTools console expected:
- a green `🟢 [neon-env] legacy (…) → bo: …` banner
- `[neon-env] legacy → GET /api/neon/grid/articles?demo=true…` lines

- [ ] **Step 6: Commit**

```bash
git add src/helpers/neon-env/page-banner.js test/neon-env/page-banner.test.js
git commit -m "feat(neon-env): console banner and per-call environment logging in embedded pages"
```

---

### Task 13: Docs, example config and rollout notes

**Files:**
- Modify: `.env.example`, `.claude/CLAUDE.md` (Testing section), `README.md`, `docs/superpowers/specs/2026-09-30-multi-neon-env-design.md` (verify the Amendments section exists)

- [ ] **Step 1: `.env.example`**

Add at the top:
```bash
# ── Neon environments ─────────────────────────────────────────────
# Multi-environment mode: put the registry at ./config/neon-environments.json
# (Render: Secret File "neon-environments.json" → /etc/secrets/neon-environments.json).
# See config/neon-environments.example.json. When the registry exists, the NEON_BO_*,
# NEON_USER_API_KEY, NEON_APP_URL and NEON_FO_* vars below are IGNORED.
# Without a registry, those vars form a single "legacy" environment (today's behaviour).
# NEON_EXT_APIKEY is the global admin key in legacy mode (registry: "adminApiKey").
```

- [ ] **Step 2: `.claude/CLAUDE.md` Testing section**

Replace the "No specific test commands…" paragraph with:
```markdown
- `npm test` - Runs the `node:test` suites (connectors, delayed importer, metadata utils, `test/neon-env/*`)
```
Under "Environment Configuration", add a bullet: `- Neon environments come from the registry (`/etc/secrets/neon-environments.json` or `./config/neon-environments.json`), resolved per request by apikey (see `src/helpers/neon-env/`). Without a registry, legacy `NEON_*` env vars form one "legacy" environment.`

- [ ] **Step 3: `README.md`**

Add a section "Multiple Neon environments" covering:
- the registry location and example file;
- how an environment is resolved: env-bound key; admin key + `?env=` / `x-neon-env` / cookie; admin key + caller host; default;
- the console banner and `X-Neon-Env` headers;
- for each Neon environment, set that env's `extApiKey` as the `apikey` in its panel/widget integration config and append `?apikey=<extApiKey>` to its webhook URL `/in/neon/webhook`;
- the rollout steps from spec §10.

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add .env.example .claude/CLAUDE.md README.md docs/superpowers/specs/2026-09-30-multi-neon-env-design.md
git commit -m "docs: multi-Neon-environment registry, resolution and rollout"
```

---

## After implementation (manual rollout, not a task for subagents)

1. Deploy (legacy mode). Render needs no changes.
2. Probe: from the demorc iframe (DevTools console inside the iframe), run `fetch('/neon/api/demo-integration/debug/headers').then(r => r.json()).then(console.log)`. Record which header carries the Neon host and whether `X-Neon-Env` survives the proxy on the response. Adjust `HOST_HEADERS` in `resolve.js` if needed, then delete the `/debug/headers` route.
3. Create the Render Secret File `neon-environments.json` with 2 environments. Switch each Neon environment's integration apikey and webhook URL to that env's `extApiKey`.
4. Remove the legacy `NEON_*` Neon vars from Render.
