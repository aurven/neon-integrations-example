'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const fo = require('../../src/helpers/neon-env/fo-sites.js');
const { modelImagesToMethode } = require('../../src/images-importer.js');
const DEMORC = require('./fixtures/fo-sites-demorc.json');

const ENV = { id: 'a', neon: { insecureTls: false, fo: { url: 'https://neon-fo-a.example.com', apiKey: 'k' } } };
const OPTS = { workFolder: '/wf', channel: 'ch', issueDate: '2026-10-12' };

// Any call on this client is a test failure.
const methodeClient = new Proxy({}, {
  get: (_t, prop) => () => { throw new Error(`methodeClient.${String(prop)} must not be called`); },
});

function model(siteName) {
  return {
    pubInfo: { siteName },
    links: { hyperlink: { image: [{ targetId: 'i1' }, { targetId: 'i2' }, { targetId: 'i3' }] } },
  };
}

let calls;
function stub(responder) {
  calls = [];
  fo.__setHttpForTest(async (config, e) => {
    calls.push({ config, envId: e.id });
    return responder(config, e, calls.length);
  });
}

beforeEach(() => {
  fo.clearSiteCache();
  fo.__setNowForTest(null);
});

test('catalog down: one FO call in total, no Methode calls, resolves', async () => {
  stub(() => { const err = new Error('Service Unavailable'); err.response = { status: 503 }; throw err; });
  const result = await context.run(ENV, () => modelImagesToMethode(methodeClient, model('TheGlobe'), OPTS));
  assert.deepEqual(result, {});
  assert.equal(calls.length, 1);
});

test('unknown site: catalog fetched twice (list + refresh), no node/resource calls', async () => {
  stub(() => ({ status: 200, data: DEMORC }));
  const result = await context.run(ENV, () => modelImagesToMethode(methodeClient, model('Nope'), OPTS));
  assert.deepEqual(result, {});
  assert.equal(calls.length, 2);
  for (const c of calls) assert.match(c.config.url, /\/api\/sites\/live$/);
});
