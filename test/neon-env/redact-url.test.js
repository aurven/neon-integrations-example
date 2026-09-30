'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { redactApikeyParam } = require('../../src/helpers/redact-url.js');

test('redacts an apikey query param', () => {
  assert.equal(redactApikeyParam('/in/neon/webhook?apikey=super-secret'), '/in/neon/webhook?apikey=[redacted]');
});

test('redacts apikey mixed in with other params, in either position', () => {
  assert.equal(redactApikeyParam('/x?env=a&apikey=secret&foo=bar'), '/x?env=a&apikey=[redacted]&foo=bar');
  assert.equal(redactApikeyParam('/x?apikey=secret&env=a'), '/x?apikey=[redacted]&env=a');
});

test('is case-insensitive on the param name', () => {
  assert.equal(redactApikeyParam('/x?ApiKey=secret'), '/x?ApiKey=[redacted]');
});

test('leaves URLs without an apikey param untouched', () => {
  assert.equal(redactApikeyParam('/x?env=a&foo=bar'), '/x?env=a&foo=bar');
  assert.equal(redactApikeyParam('/x'), '/x');
});

test('redacts multiple apikey occurrences', () => {
  assert.equal(redactApikeyParam('/x?apikey=one&apikey=two'), '/x?apikey=[redacted]&apikey=[redacted]');
});

test('stops at a following # fragment', () => {
  assert.equal(redactApikeyParam('/x?apikey=secret#frag'), '/x?apikey=[redacted]#frag');
});

test('handles an apikey with no value', () => {
  assert.equal(redactApikeyParam('/x?apikey='), '/x?apikey=[redacted]');
});

test('non-string input is returned as-is', () => {
  assert.equal(redactApikeyParam(undefined), undefined);
  assert.equal(redactApikeyParam(null), null);
});
