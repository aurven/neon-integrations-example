'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Temporarily clear all twitter env vars to test unconfigured state
const TWITTER_VARS = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
const saved = {};
TWITTER_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/twitter-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when all env vars present', () => {
  TWITTER_VARS.forEach(v => { process.env[v] = 'test-value'; });
  try {
    const status = connector.getStatus();
    assert.equal(status.configured, true);
  } finally {
    TWITTER_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
  }
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'twitter');
  assert.equal(connector.displayName, 'Twitter / X');
  assert.equal(connector.maxLength, 280);
  assert.equal(connector.requiresImage, false);
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
});
