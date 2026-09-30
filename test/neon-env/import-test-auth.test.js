'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');
const { importTest } = require('../../src/requestHandlers/neon-import.js');

const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/in/neon/from/guardian/test', importTest);
  return app;
}

test('importTest rejects requests without a valid apikey', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/in/neon/from/guardian/test', payload: { section: 'world' } });
  assert.equal(res.statusCode, 401);
});

test('importTest authenticates with the resolved env-bound key (not just the global key)', async () => {
  const app = await buildApp();
  // Missing `section` triggers the handler's own 400 validation, proving auth passed
  // without ever reaching the Guardian API (no network call needed for this assertion).
  const res = await app.inject({ method: 'POST', url: '/in/neon/from/guardian/test', headers: { apikey: 'key-a' }, payload: {} });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /target section/);
});
