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
    Headers,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async () => ({ headers: { get: (h) => (h === 'X-Neon-Env' ? responseEnv : null) } });
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, sandbox);
  return { sandbox, logs, errors };
}

// Records the init actually handed to the underlying fetch, to assert on header pinning.
function runScriptRecording(html) {
  const calls = [];
  const sandbox = {
    console: { log: () => {}, error: () => {} },
    location: { href: 'https://app.example.com/neon/api/demo-integration/widgets/x', origin: 'https://app.example.com' },
    URL,
    Headers,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async (input, init) => {
    calls.push({ input, init });
    return { headers: { get: () => null } };
  };
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, sandbox);
  return { sandbox, calls };
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

test('same-origin fetches are pinned to the page env via x-neon-env header', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  await sandbox.window.fetch('/api/x');
  assert.equal(calls[0].init.headers.get('x-neon-env'), 'demorc');
});

test('an explicit caller-supplied x-neon-env header (plain object) is not overwritten', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  await sandbox.window.fetch('/api/x', { headers: { 'x-neon-env': 'other' } });
  // Untouched (transparent): the wrapper leaves a header source it did not need to modify as-is.
  assert.equal(new Headers(calls[0].init.headers).get('x-neon-env'), 'other');
});

test('an explicit caller-supplied x-neon-env header (array of pairs) is not overwritten', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  await sandbox.window.fetch('/api/x', { headers: [['x-neon-env', 'other']] });
  assert.equal(new Headers(calls[0].init.headers).get('x-neon-env'), 'other');
});

test('an explicit caller-supplied x-neon-env header (Headers instance) is not overwritten', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  await sandbox.window.fetch('/api/x', { headers: new Headers({ 'x-neon-env': 'other' }) });
  assert.equal(calls[0].init.headers.get('x-neon-env'), 'other');
});

test('a Request input already carrying x-neon-env is left untouched (init.headers absent)', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  const req = new Request('https://app.example.com/api/x', { headers: { 'x-neon-env': 'other' } });
  await sandbox.window.fetch(req);
  assert.equal(calls[0].input, req);
  assert.equal(calls[0].init, undefined);
});

test('a Request input without a header gets pinned via a copied Headers set', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  const req = new Request('https://app.example.com/api/x');
  await sandbox.window.fetch(req);
  assert.equal(calls[0].init.headers.get('x-neon-env'), 'demorc');
});

test('cross-origin calls get no x-neon-env header', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(env));
  await sandbox.window.fetch('https://api.pexels.com/v1/search');
  assert.equal(calls[0].init, undefined);
});

test('null page env adds no header', async () => {
  const { sandbox, calls } = runScriptRecording(bannerScript(null));
  await sandbox.window.fetch('/api/x');
  assert.equal(calls[0].init, undefined);
});

test('HTML without <head> is returned untouched', () => {
  assert.equal(injectBanner('<div>x</div>', env), '<div>x</div>');
});

test('a <header> tag before <head> is not mistaken for it', () => {
  const html = '<html><body><header>site header</header></body><head><title>t</title></head></html>';
  const out = injectBanner(html, env);
  assert.ok(out.includes('<header>site header</header>'), 'header element left untouched');
  assert.ok(!out.slice(0, out.indexOf('<head>')).includes('<script>'), 'banner not injected before <head>');
  assert.ok(out.startsWith('<html><body><header>site header</header></body><head><script>'));
});

test('<head lang="x"> (attributes on head) still gets the banner', () => {
  const html = '<html><head lang="x"><title>t</title></head></html>';
  const out = injectBanner(html, env);
  assert.ok(out.startsWith('<html><head lang="x"><script>'));
});

test('escapes U+2028 and U+2029 in labels, and runScript parses correctly', () => {
  const envWithLineBreaks = { id: 'test', label: 'Demo  RC', neon: { bo: { host: 'bo.example.com' } } };
  const script = bannerScript(envWithLineBreaks);
  assert.ok(!script.includes(' '), 'raw U+2028 should be escaped');
  assert.ok(!script.includes(' '), 'raw U+2029 should be escaped');
  const { logs } = runScript(script, 'test');
  assert.ok(logs[0].includes('test'), 'banner should still log correctly after escaping');
});
