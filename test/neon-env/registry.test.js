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
