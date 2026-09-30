'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');
const neonWebhookHandlers = require('../../src/requestHandlers/neon-webhooks.js');

async function buildApp(registry) {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => registry });
  app.post('/in/neon/webhook', neonWebhookHandlers.postNeonWebhookHandler);
  app.post('/in/neon/webhook/test', neonWebhookHandlers.postNeonWebhookTest);
  return app;
}

test('file-mode keyless webhook POST -> 401, no Neon environment', async () => {
  const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });
  const app = await buildApp(reg);
  // A body shaped so that, if the handler proceeded past auth, it would be accepted (200),
  // proving the 401 happens before any side effect (Telegram post, etc.) is reached.
  const res = await app.inject({
    method: 'POST',
    url: '/in/neon/webhook',
    payload: { model: { data: { title: 't', id: '1' } }, site: 'TheGlobe', type: 'article', webhookTrigger: 'Created' },
  });
  assert.equal(res.statusCode, 401);
  assert.match(res.json().error, /no Neon environment/);
});

test('file-mode keyless webhook/test POST -> 401 too', async () => {
  const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });
  const app = await buildApp(reg);
  const res = await app.inject({
    method: 'POST',
    url: '/in/neon/webhook/test',
    payload: { model: { data: { title: 't', id: '1' } } },
  });
  assert.equal(res.statusCode, 401);
});

test('legacy registry keyless webhook POST -> not 401 (legacy env resolved, falls through to its own validation)', async () => {
  const legacy = buildRegistry({ json: null, envVars: { NEON_EXT_APIKEY: 'legacy-key', NEON_BO_URL: 'https://bo/api' } });
  const app = await buildApp(legacy);
  // Empty object body avoids the "missing body" 400 while still hitting the
  // "invalid format" 400 early-return, well before any network call.
  const res = await app.inject({ method: 'POST', url: '/in/neon/webhook', payload: {} });
  assert.notEqual(res.statusCode, 401);
  assert.equal(res.statusCode, 400);
});

test('env-bound apikey webhook POST proceeds past the 401 check', async () => {
  const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });
  const app = await buildApp(reg);
  const res = await app.inject({
    method: 'POST',
    url: '/in/neon/webhook',
    headers: { apikey: 'key-a' },
    payload: {},
  });
  assert.notEqual(res.statusCode, 401);
  assert.equal(res.statusCode, 400);
});
