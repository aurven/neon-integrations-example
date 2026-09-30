'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { currentEnv } = require('../../src/helpers/neon-env/context.js');
const { withInsecureEnvParam } = require('../../src/helpers/neon-env/insecure-webhook.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('open', { insecureWebhook: true }), envJson('closed')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  const handler = async (request) => {
    await new Promise((r) => setTimeout(r, 5));
    return { env: currentEnv()?.id || null };
  };
  app.post('/in/neon/webhook/legacy', withInsecureEnvParam(handler, { getRegistry: () => reg }));
  return app;
}

test('opted-in env accepted via ?env without key, context bound', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/in/neon/webhook/legacy?env=open', payload: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().env, 'open');
  assert.equal(res.headers['x-neon-env'], 'open');
});

test('env not opted in and unknown env get the same 403', async () => {
  const app = await buildApp();
  const closed = await app.inject({ method: 'POST', url: '/in/neon/webhook/legacy?env=closed', payload: {} });
  const unknown = await app.inject({ method: 'POST', url: '/in/neon/webhook/legacy?env=nope', payload: {} });
  assert.equal(closed.statusCode, 403);
  assert.equal(unknown.statusCode, 403);
  assert.deepEqual(closed.json(), unknown.json());
});

test('missing env -> 400', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/in/neon/webhook/legacy', payload: {} });
  assert.equal(res.statusCode, 400);
});

test('apikey wins over ?env (even for a non-opted-in env)', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/in/neon/webhook/legacy?env=open&apikey=key-closed', payload: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().env, 'closed');
});
