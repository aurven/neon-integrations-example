'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { bannerScript, injectBanner } = require('../../src/helpers/neon-env/page-banner.js');

const env = { id: 'demorc', label: 'Demo </script> RC', neon: { bo: { host: 'bo.example.com' } } };

function runScript(html, responseEnv) {
  const logs = [];
  const errors = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) },
    location: { href: 'https://app.example.com/neon/api/demo-integration/widgets/x', origin: 'https://app.example.com' },
    URL,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async () => ({ headers: { get: (h) => (h === 'X-Neon-Env' ? responseEnv : null) } });
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, sandbox);
  return { sandbox, logs, errors };
}

test('banner escapes </script> in labels and injects after <head>', () => {
  const html = injectBanner('<html><head><title>t</title></head></html>', env);
  assert.ok(html.startsWith('<html><head><script>'));
  assert.ok(!bannerScript(env).includes('Demo </script>'));
});

test('logs banner and same-origin calls, flags mismatch', async () => {
  const { sandbox, logs, errors } = runScript(bannerScript(env), 'demorc');
  assert.ok(logs[0].includes('demorc'));
  await sandbox.window.fetch('/api/neon/create', { method: 'POST' });
  assert.ok(logs.some((l) => l.includes('[neon-env] demorc → POST /api/neon/create')));

  const other = runScript(bannerScript(env), 'poc');
  await other.sandbox.window.fetch('/x');
  assert.ok(other.errors.some((e) => e.includes('MISMATCH')));
});

test('missing header is reported, cross-origin calls are silent', async () => {
  const { sandbox, logs } = runScript(bannerScript(env), null);
  await sandbox.window.fetch('/x');
  await sandbox.window.fetch('https://api.pexels.com/v1/search');
  assert.ok(logs.some((l) => l.includes('(no env header) → GET /x')));
  assert.ok(!logs.some((l) => l.includes('pexels')));
});

test('null env prints a neutral banner', () => {
  const { logs } = runScript(bannerScript(null), null);
  assert.ok(logs[0].includes('no Neon environment'));
});

test('HTML without <head> is returned untouched', () => {
  assert.equal(injectBanner('<div>x</div>', env), '<div>x</div>');
});
