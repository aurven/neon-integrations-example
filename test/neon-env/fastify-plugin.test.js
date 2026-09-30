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
