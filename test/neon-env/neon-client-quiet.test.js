'use strict';
/** NeonClient quiet mode + timeout option (jobs spec: final review fix 1). No network. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const neonApi = require('../../src/helpers/neon-bo-api-v3.js');
const { errorMessage } = require('../../src/helpers/site-builder/create-site.js');

function clientWith(options, request) {
  const client = new neonApi.NeonClient({ baseUrl: 'https://x/api', apiKey: 'k', userApiKey: 'u', ...options });
  client.client.request = request;
  return client;
}

async function capture(fn) {
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => logs.push(args);
  console.error = (...args) => errors.push(args);
  let thrown = null;
  try { await fn(); } catch (e) { thrown = e; } finally { console.log = origLog; console.error = origError; }
  return { logs, errors, thrown };
}

const post = (client) => client.makeRequest({ method: 'post', url: '/core/categories/create', data: {} }, 'created', true);

test('quiet client: success prints nothing', async () => {
  const client = clientWith({ quiet: true }, async () => ({ status: 200, data: { ok: true } }));
  const out = await capture(() => post(client));
  assert.equal(out.thrown, null);
  assert.equal(out.logs.length, 0);
  assert.equal(out.errors.length, 0);
});

test('quiet client: failure prints one compact line and rethrows', async () => {
  const boom = Object.assign(new Error('bad gateway'), { response: { status: 502, data: { detail: 'x' } } });
  const client = clientWith({ quiet: true }, async () => { throw boom; });
  const out = await capture(() => post(client));
  assert.equal(out.thrown, boom);
  assert.equal(out.logs.length, 0);
  assert.equal(out.errors.length, 1);
  assert.equal(out.errors[0].length, 1);
  assert.match(out.errors[0][0], /^❌ \[env=custom\] POST \/core\/categories\/create failed: 502$/);
});

test('non-quiet client still logs the request line', async () => {
  const client = clientWith({}, async () => ({ status: 200, data: { ok: true } }));
  const out = await capture(() => post(client));
  assert.ok(out.logs.some((args) => String(args[0]).startsWith('➡️')));
});

test('timeoutMs is passed to axios; default is unset', () => {
  assert.equal(new neonApi.NeonClient({ baseUrl: 'https://x/api', timeoutMs: 1234 }).client.defaults.timeout, 1234);
  const dflt = new neonApi.NeonClient({ baseUrl: 'https://x/api' }).client.defaults.timeout;
  assert.ok(dflt === 0 || dflt === undefined);
});

test('a timeout error maps to a readable item message', () => {
  const error = Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' });
  assert.ok(errorMessage(error).length > 0);
});
