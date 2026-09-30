'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a')]), envVars: {} });

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  const metrics = require('../../src/requestHandlers/neon-metrics.js');
  const mobile = require('../../src/requestHandlers/mobile-client.js');
  app.get('/neon/api/core/metrics', metrics.getMetricsReportsHandler);
  app.get('/neon/api/core/metrics/*', metrics.getMetricsDataHandler);
  app.get('/mobileclient/api/articles', mobile.getMobileClientApiArticlesHandler);
  app.post('/mobileclient/save', mobile.postMobileClientSaveHandler);
  return app;
}

test('metrics and mobile client routes reject requests without a key', async () => {
  const app = await buildApp();
  for (const [method, url] of [['GET', '/neon/api/core/metrics'], ['GET', '/neon/api/core/metrics/x'], ['GET', '/mobileclient/api/articles'], ['POST', '/mobileclient/save']]) {
    const res = await app.inject({ method, url });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('metrics demo mode works with a key', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/neon/api/core/metrics?demo=true', headers: { apikey: 'key-a' } });
  assert.equal(res.statusCode, 200);
});
