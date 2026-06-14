'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const IG_VARS = ['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'];
const saved = {};
IG_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/instagram-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when env vars present', () => {
  process.env.INSTAGRAM_ACCOUNT_ID = 'test-account';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  try {
    const status = connector.getStatus();
    assert.equal(status.configured, true);
  } finally {
    IG_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
  }
});

test('requiresImage is true', () => {
  assert.equal(connector.requiresImage, true);
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'instagram');
  assert.equal(connector.displayName, 'Instagram');
  assert.equal(connector.maxLength, 2200);
  assert.equal(connector.requiresImage, true);
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
});
