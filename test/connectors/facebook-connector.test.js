'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const FB_VARS = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'];
const saved = {};
FB_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/facebook-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured with pageId when env vars present', () => {
  process.env.FACEBOOK_PAGE_ID = 'test-page-id';
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'test-token';
  try {
    const status = connector.getStatus();
    assert.equal(status.configured, true);
    assert.equal(status.pageId, 'test-page-id');
  } finally {
    FB_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
  }
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'facebook');
  assert.equal(connector.displayName, 'Facebook');
  assert.equal(connector.maxLength, 63206);
  assert.equal(connector.requiresImage, false);
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
});
