'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const context = require('../../src/helpers/neon-env/context.js');
const fo = require('../../src/helpers/neon-env/fo-sites.js');
const mailjet = require('../../src/mailjet/mailjet.js');
const DEMORC = require('./fixtures/fo-sites-demorc.json');

const ENV = { id: 'neap-demorc', neon: { insecureTls: false, fo: { url: 'https://neon-fo-demorc.neap.eidosmedia.io', apiKey: 'k' } } };
const inEnv = (fn) => context.run(ENV, fn);

beforeEach(() => {
  fo.clearSiteCache();
  fo.__setHttpForTest(async () => ({ status: 200, data: DEMORC }));
});

test('site from rootData.pubInfo.siteName drives base url and sender name', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'NextFrontier' } }, contentData: { data: {} } }));
  assert.deepEqual(r, { baseUrl: 'https://nextfrontier-demorc.sites.neap.eidosmedia.io', senderName: 'Next Frontier Newsletter' });
});

test('payload siteNode.hostname wins for the base url; label still from the catalog', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ siteNode: { hostname: 'https://custom.example.com/' }, rootData: { pubInfo: { siteName: 'TheGlobe' } } }));
  assert.deepEqual(r, { baseUrl: 'https://custom.example.com', senderName: 'The Globe Newsletter' });
});

test('siteNode.hostname with an unresolvable site -> generic sender name', async () => {
  const r = await inEnv(() => mailjet.resolveNewsletterSite({ siteNode: { hostname: 'https://custom.example.com' }, rootData: { pubInfo: { siteName: 'Nope' } } }));
  assert.deepEqual(r, { baseUrl: 'https://custom.example.com', senderName: 'Newsletter' });
});

test('no siteNode and unknown site -> catalog 404 propagates', async () => {
  await assert.rejects(() => inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'Nope' } } })), (err) => err.statusCode === 404);
});

test('site without a public hostname -> 404', async () => {
  fo.__setHttpForTest(async () => ({ status: 200, data: [{ root: { name: 'Bare' } }] }));
  await assert.rejects(
    () => inEnv(() => mailjet.resolveNewsletterSite({ rootData: { pubInfo: { siteName: 'Bare' } } })),
    (err) => err.statusCode === 404 && err.message === "site 'Bare' in env neap-demorc has no public hostname"
  );
});

test('no hard-coded site or eks-dev host left in mailjet.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/mailjet/mailjet.js'), 'utf8');
  assert.ok(!/eks-dev/.test(src), 'eks-dev host still present');
  assert.ok(!/['"]theglobe['"]/i.test(src), "'theglobe' literal still present");
  assert.ok(!/TheGlobe Newsletter/.test(src), 'hard-coded sender name still present');
});
