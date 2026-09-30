'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRequest } = require('../../src/helpers/neon-env/resolve.js');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({
  json: registryJson([envJson('a', { default: true, extApiKeyLimited: 'lim-a' }), envJson('b')]),
  envVars: {},
});
const legacy = buildRegistry({ json: null, envVars: { NEON_EXT_APIKEY: 'legacy-key', NEON_BO_URL: 'https://bo/api' } });
const SELF = { selfHosts: ['integrations.onrender.com'] };
function req({ headers = {}, query = {}, cookies = {} } = {}) {
  return { headers: { host: 'integrations.onrender.com', ...headers }, query, cookies };
}

test('env-bound key selects its env (header, query, cookie)', () => {
  assert.equal(resolveRequest(req({ headers: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
  assert.equal(resolveRequest(req({ query: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
  assert.equal(resolveRequest(req({ cookies: { apikey: 'key-b' } }), reg, SELF).env.id, 'b');
});

test('header key wins over stale cookie key', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-b' }, cookies: { apikey: 'key-a' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
});

test('limited key gets limited role', () => {
  const r = resolveRequest(req({ headers: { apikey: 'lim-a' } }), reg, SELF);
  assert.equal(r.auth.role, 'limited');
  assert.equal(r.auth.global, false);
});

test('env-bound key ignores ?env and x-neon-env', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', 'x-neon-env': 'b' }, query: { env: 'b' } }), reg, SELF);
  assert.equal(r.env.id, 'a');
  assert.equal(r.setEnvCookie, null);
});

test('admin key + explicit env selects it and asks to persist cookie', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' }, query: { env: 'b' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
  assert.equal(r.auth.global, true);
  assert.equal(r.setEnvCookie, 'b');
});

test('admin key + unknown explicit env -> 400 listing ids', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key', 'x-neon-env': 'zzz' } }), reg, SELF);
  assert.equal(r.error.status, 400);
  assert.match(r.error.message, /a, b/);
});

test('admin key + stale env cookie -> cleared, falls back to default', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' }, cookies: { neonEnv: 'removed' } }), reg, SELF);
  assert.equal(r.error, null);
  assert.equal(r.clearEnvCookie, true);
  assert.equal(r.env.id, 'a');
});

test('admin key without explicit env infers env from caller host', () => {
  const r = resolveRequest(req({ headers: { apikey: 'admin-key', referer: 'https://neon-app-b.example.com/neon/app' } }), reg, SELF);
  assert.equal(r.env.id, 'b');
});

test('admin key, no explicit env, no host, no default -> env null, no error', () => {
  const noDefault = buildRegistry({ json: registryJson([envJson('a'), envJson('b')]), envVars: {} });
  const r = resolveRequest(req({ headers: { apikey: 'admin-key' } }), noDefault, SELF);
  assert.equal(r.env, null);
  assert.equal(r.error, null);
  assert.equal(r.auth.authenticated, true);
});

test('host mismatch -> 403', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', origin: 'https://neon-app-b.example.com' } }), reg, SELF);
  assert.equal(r.error.status, 403);
  assert.match(r.error.log, /host mismatch env=a/);
});

test('self host referer (standalone on Render) is not a mismatch', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', referer: 'https://integrations.onrender.com/widgets/x' } }), reg, SELF);
  assert.equal(r.error, null);
  assert.equal(r.env.id, 'a');
});

test('unregistered external referer (https://www.notion.so/x) with key-a -> env a, no error', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', referer: 'https://www.notion.so/x' } }), reg, SELF);
  assert.equal(r.error, null);
  assert.equal(r.env.id, 'a');
});

test('Origin: null is ignored by host check', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', origin: 'null' } }), reg, SELF);
  assert.equal(r.error, null);
});

test('matching host passes', () => {
  const r = resolveRequest(req({ headers: { apikey: 'key-a', 'x-forwarded-host': 'neon-app-a.example.com' } }), reg, SELF);
  assert.equal(r.env.id, 'a');
});

test('no key in file mode -> unauthenticated, env null', () => {
  const r = resolveRequest(req(), reg, SELF);
  assert.equal(r.auth.authenticated, false);
  assert.equal(r.env, null);
});

test('no key in legacy mode -> unauthenticated but legacy env (keyless webhooks keep working)', () => {
  const r = resolveRequest(req(), legacy, SELF);
  assert.equal(r.auth.authenticated, false);
  assert.equal(r.env.id, 'legacy');
});

test('legacy key authenticates as admin on legacy env', () => {
  const r = resolveRequest(req({ headers: { apikey: 'legacy-key' } }), legacy, SELF);
  assert.equal(r.auth.role, 'admin');
  assert.equal(r.env.id, 'legacy');
});
