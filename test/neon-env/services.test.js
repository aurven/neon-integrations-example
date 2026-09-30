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
