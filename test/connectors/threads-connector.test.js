'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const TH_VARS = ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'];
const saved = {};
TH_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/threads-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when env vars present', () => {
  process.env.THREADS_USER_ID = 'test-user';
  process.env.THREADS_ACCESS_TOKEN = 'test-token';
  try {
    const status = connector.getStatus();
    assert.equal(status.configured, true);
  } finally {
    TH_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
  }
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'threads');
  assert.equal(connector.displayName, 'Threads');
  assert.equal(connector.maxLength, 500);
  assert.equal(connector.requiresImage, false);
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
});
