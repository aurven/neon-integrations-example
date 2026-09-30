'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const context = require('../../src/helpers/neon-env/context.js');
const connector = require('../../src/connectors/neon-config-connector.js');

test('cache dir is per environment', () => {
  const dir = context.run({ id: 'demorc' }, () => connector.cacheDir());
  assert.equal(dir, path.join(process.cwd(), 'data', 'neon-config', 'demorc'));
});

test('cache dir outside env context throws', () => {
  assert.throws(() => connector.cacheDir(), { name: 'NoNeonEnvError' });
});

test('type labels are isolated per env', () => {
  context.run({ id: 'x' }, () => connector.__setTypeLabelsForTest({ article: 'X Article' }));
  assert.equal(context.run({ id: 'x' }, () => connector.getTypeLabel('article')), 'X Article');
  assert.equal(context.run({ id: 'y' }, () => connector.getTypeLabel('article')), 'Article');
});
