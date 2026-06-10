'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const delayedImporter = require('../src/delayed-importer.js');

function basePayload(overrides = {}) {
  return {
    duration: 1,
    site: 'demo-site',
    workspace: 'Demo Workspace',
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'story', title: 'B', content: '<p>b</p>' },
      { type: 'story', title: 'C', content: '<p>c</p>' },
    ],
    ...overrides,
  };
}

test('validatePayload accepts a valid mixed payload', () => {
  const payload = basePayload({
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'image', url: 'https://example.com/pic.jpg' },
    ],
  });
  assert.deepEqual(delayedImporter.validatePayload(payload), { valid: true });
});

test('validatePayload rejects missing body', () => {
  assert.equal(delayedImporter.validatePayload(null).valid, false);
});

test('validatePayload rejects bad duration', () => {
  for (const duration of [undefined, 0, -5, 'ten']) {
    const result = delayedImporter.validatePayload(basePayload({ duration }));
    assert.equal(result.valid, false);
    assert.match(result.error, /duration/);
  }
});

test('validatePayload rejects missing site or workspace', () => {
  assert.match(delayedImporter.validatePayload(basePayload({ site: undefined })).error, /site/);
  assert.match(delayedImporter.validatePayload(basePayload({ workspace: undefined })).error, /workspace/);
});

test('validatePayload rejects empty or missing items', () => {
  assert.equal(delayedImporter.validatePayload(basePayload({ items: [] })).valid, false);
  assert.equal(delayedImporter.validatePayload(basePayload({ items: undefined })).valid, false);
});

test('validatePayload rejects invalid item type with index in message', () => {
  const payload = basePayload({
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'video', url: 'https://example.com/x' },
    ],
  });
  const result = delayedImporter.validatePayload(payload);
  assert.equal(result.valid, false);
  assert.match(result.error, /items\[1\]/);
});

test('validatePayload enforces per-type required fields', () => {
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'story', content: '<p>a</p>' }] })).error,
    /items\[0\].*title/
  );
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'story', title: 'A' }] })).error,
    /items\[0\].*content/
  );
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'image' }] })).error,
    /items\[0\].*url/
  );
});
