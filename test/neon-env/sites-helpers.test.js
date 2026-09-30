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
