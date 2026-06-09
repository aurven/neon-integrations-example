'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../src/connectors/connector-registry');

test('getConnector returns all expected platforms', () => {
  for (const platform of ['twitter', 'facebook', 'instagram', 'threads', 'bluesky']) {
    const connector = registry.getConnector(platform);
    assert.equal(connector.platform, platform, `connector.platform mismatch for ${platform}`);
    assert.equal(typeof connector.getStatus, 'function', `getStatus missing for ${platform}`);
    assert.equal(typeof connector.publish, 'function', `publish missing for ${platform}`);
    assert.equal(typeof connector.getMetrics, 'function', `getMetrics missing for ${platform}`);
  }
});

test('getConnector throws for unknown platform', () => {
  assert.throws(
    () => registry.getConnector('myspace'),
    { message: 'Unknown platform: myspace' }
  );
});

test('getAllConnectors returns 5 entries', () => {
  const all = registry.getAllConnectors();
  assert.equal(all.length, 5);
});
