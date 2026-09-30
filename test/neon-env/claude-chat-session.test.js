'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const chat = require('../../src/helpers/claude-chat-helper.js');

test('same browser session id maps to different chat sessions per env', () => {
  const a = context.run({ id: 'a' }, () => chat.sessionKey('s1'));
  const b = context.run({ id: 'b' }, () => chat.sessionKey('s1'));
  assert.equal(a, 'a:s1');
  assert.equal(b, 'b:s1');
});
