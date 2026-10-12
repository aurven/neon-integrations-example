'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { servicesRegistryView } = require('../../src/helpers/neon-env/services-view.js');
const { envJson, registryJson } = require('./fixtures.js');

function reg() {
  return buildRegistry({ json: registryJson([envJson('a'), envJson('b')]), envVars: {} });
}

test('admin, no loadError: full env list, current env flagged, no warning', () => {
  const view = servicesRegistryView(reg(), true, 'b');
  assert.deepEqual(view.neonEnvs.map((e) => e.id), ['a', 'b']);
  assert.equal(view.neonEnvs.find((e) => e.id === 'b').current, true);
  assert.equal(view.neonEnvs.find((e) => e.id === 'a').current, false);
  assert.equal(view.registryWarning, null);
});

test('anonymous, no loadError: empty env list, no warning', () => {
  const view = servicesRegistryView(reg(), false, 'a');
  assert.deepEqual(view.neonEnvs, []);
  assert.equal(view.registryWarning, null);
});

test('admin, with loadError: detailed message shown, includes raw error', () => {
  const r = reg();
  r.loadError = 'config/neon-environments.json: Unexpected token } in JSON at position 42';
  const view = servicesRegistryView(r, true, null);
  assert.match(view.registryWarning, /Unexpected token/);
  assert.match(view.registryWarning, /registry unusable/);
});

test('anonymous, with loadError: env list empty, generic fixed message (no leaked detail)', () => {
  const r = reg();
  r.loadError = 'config/neon-environments.json: Unexpected token } in JSON at position 42';
  const view = servicesRegistryView(r, false, null);
  assert.deepEqual(view.neonEnvs, []);
  assert.equal(view.registryWarning, 'Neon environment registry unusable — running in legacy mode (see server log)');
  assert.ok(!view.registryWarning.includes('Unexpected token'));
});

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

test('servicesRegistryView: admin sees skipped envs with id and reason', () => {
  const r = reg();
  r.skipped = [{ id: 'old', reason: 'neon.fo.url missing' }];
  assert.deepEqual(servicesRegistryView(r, true, null).skippedEnvs, [{ id: 'old', reason: 'neon.fo.url missing' }]);
});

test('servicesRegistryView: anonymous gets no skipped envs', () => {
  const r = reg();
  r.skipped = [{ id: 'old', reason: 'neon.fo.url missing' }];
  assert.deepEqual(servicesRegistryView(r, false, null).skippedEnvs, []);
});
