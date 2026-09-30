'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../../src/helpers/neon-env/context.js');

const TWITTER_VARS = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];

test('twitter-connector getStatus uses per-env services block even when global env vars are absent', () => {
  const saved = {};
  TWITTER_VARS.forEach((v) => { saved[v] = process.env[v]; delete process.env[v]; });

  try {
    const env = {
      id: 'per-env-twitter-test',
      services: {
        twitter: {
          apiKey: 'env-api-key',
          apiSecret: 'env-api-secret',
          accessToken: 'env-access-token',
          accessSecret: 'env-access-secret',
        },
      },
    };

    const status = run(env, () => require('../../src/connectors/twitter-connector.js').getStatus());

    assert.deepEqual(status, { configured: true });
  } finally {
    TWITTER_VARS.forEach((v) => {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    });
  }
});
