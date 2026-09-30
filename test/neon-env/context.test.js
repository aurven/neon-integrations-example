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
