'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseIndented } = require('../../src/helpers/outline/parse-indented.js');

const shape = (r) => r.entries.map((e) => [e.depth, e.text, e.parentIndex]);

test('nesting, siblings, back-dedent', () => {
  const r = parseIndented('A\n  B\n    C\n  D\nE');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(shape(r), [[1, 'A', null], [2, 'B', 0], [3, 'C', 1], [2, 'D', 0], [1, 'E', null]]);
  assert.equal(r.entries[2].line, 3);
});

test('tabs = 2 spaces, CRLF stripped, blank lines ignored, text trimmed', () => {
  const r = parseIndented('A \r\n\tB\r\n\r\n  C  \r\n');
  assert.deepEqual(shape(r), [[1, 'A', null], [2, 'B', 0], [2, 'C', 0]]);
});

test('a much wider line is exactly one level deeper', () => {
  assert.deepEqual(shape(parseIndented('A\n        B')), [[1, 'A', null], [2, 'B', 0]]);
});

test('indentation errors use the configured first-line noun', () => {
  assert.deepEqual(parseIndented('  A\nB').errors, ['line 1: first line cannot be indented']);
  assert.deepEqual(parseIndented('  A', { firstLineNoun: 'section' }).errors, ['line 1: first section cannot be indented']);
  assert.deepEqual(parseIndented('A\n    B\n  C').errors, ['line 3: indentation does not match any parent level']);
});

test('accept() rejects a line without changing the stack', () => {
  const r = parseIndented('A\n  !!!\n  B', { accept: (t) => (t === '!!!' ? 'bad name' : null) });
  assert.deepEqual(r.errors, ['line 2: bad name']);
  assert.deepEqual(shape(r), [[1, 'A', null], [2, 'B', 0]]);
});
