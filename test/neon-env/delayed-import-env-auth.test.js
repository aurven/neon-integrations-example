'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');
const delayedImportHandlers = require('../../src/requestHandlers/neon-delayed-import.js');
const rssDelayedImportHandlers = require('../../src/requestHandlers/neon-rss-delayed-import.js');

// Admin key, no explicit env, no host match, no default -> authenticated but env is null.
const reg = buildRegistry({ json: registryJson([envJson('a'), envJson('b')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/in/delayed-import', delayedImportHandlers.submitJobHandler);
  app.post('/in/delayed-import/from/rss', rssDelayedImportHandlers.submitRssDelayedImportHandler);
  return app;
}

test('submitJobHandler: authenticated admin with no resolvable env -> 400, not a job', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/in/delayed-import',
    headers: { apikey: 'admin-key' },
    payload: { duration: 1, site: 's', workspace: 'w', items: [{ contentType: 'story', title: 'A', content: '<p>a</p>' }] },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /No Neon environment selected/);
});

test('submitJobHandler: env-bound key proceeds past the env check', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/in/delayed-import',
    headers: { apikey: 'key-a' },
    payload: { duration: 1, site: 's', workspace: 'w', items: [{ contentType: 'story', title: 'A', content: '<p>a</p>' }] },
  });
  assert.equal(res.statusCode, 202);
});

test('submitRssDelayedImportHandler: authenticated admin with no resolvable env -> 400, no RSS fetch attempted', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/in/delayed-import/from/rss',
    headers: { apikey: 'admin-key' },
    payload: { rssUrl: 'https://example.invalid/feed.xml', site: 's', workspace: 'w' },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /No Neon environment selected/);
});
