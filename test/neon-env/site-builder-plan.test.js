'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify, parseOutline, buildPlan, sectionPayload, MAX_SECTIONS } = require('../../src/helpers/site-builder/plan.js');

const ENV = { id: 'sandbox', neon: { fo: { url: 'https://neon-fo.neon.test', apiKey: 'k', siteHostSuffix: '-canary.neon.test:3000' } } };

test('slugify', () => {
  assert.equal(slugify('Il Mio Nuovo Sito'), 'il-mio-nuovo-sito');
  assert.equal(slugify('Prima Sottosezione'), 'prima-sottosezione');
  assert.equal(slugify('Città & Cultura!'), 'citta-cultura');
  assert.equal(slugify('  --Économie__2026--  '), 'economie-2026');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(undefined), '');
});

test('parseOutline: nesting with spaces, paths and parents', () => {
  const { sections, errors } = parseOutline('Prima Sezione\n  Prima Sottosezione\n    Terzo Livello\nSeconda Sezione\n  Altra Sottosezione');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => [s.depth, s.name, s.path, s.parentIndex]), [
    [1, 'prima-sezione', '/prima-sezione/', null],
    [2, 'prima-sottosezione', '/prima-sezione/prima-sottosezione/', 0],
    [3, 'terzo-livello', '/prima-sezione/prima-sottosezione/terzo-livello/', 1],
    [1, 'seconda-sezione', '/seconda-sezione/', null],
    [2, 'altra-sottosezione', '/seconda-sezione/altra-sottosezione/', 3],
  ]);
  assert.equal(sections[0].title, 'Prima Sezione');
  assert.equal(sections[0].line, 1);
});

test('parseOutline: tabs = 2 spaces, CRLF and blank lines ignored', () => {
  const { sections, errors } = parseOutline('A\r\n\tB\r\n  C\r\n\r\n\t\tD\r\nE');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => [s.depth, s.path]), [
    [1, '/a/'], [2, '/a/b/'], [2, '/a/c/'], [3, '/a/c/d/'], [1, '/e/'],
  ]);
});

test('parseOutline: a much wider line is still exactly one level deeper', () => {
  const { sections } = parseOutline('A\n        B');
  assert.deepEqual(sections.map((s) => s.depth), [1, 2]);
});

test('parseOutline: back-dedent to a matching open level', () => {
  const { sections, errors } = parseOutline('A\n  B\n    C\n  D');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => s.path), ['/a/', '/a/b/', '/a/b/c/', '/a/d/']);
});

test('parseOutline: indentation errors', () => {
  assert.deepEqual(parseOutline('  A\nB').errors, ['line 1: first section cannot be indented']);
  assert.deepEqual(parseOutline('A\n    B\n  C').errors, ['line 3: indentation does not match any parent level']);
});

test('parseOutline: unusable titles and duplicate siblings', () => {
  assert.deepEqual(parseOutline('A\n  !!!').errors, ['line 2: "!!!" has no usable characters for a name']);
  assert.deepEqual(parseOutline('News\n  Sport\n  sport!\nnews').errors, [
    'line 3: duplicate section "sport" under /news/',
    'line 4: duplicate section "news" under /',
  ]);
  assert.deepEqual(parseOutline('A\n  X\nB\n  X').errors, []);
});

test('buildPlan: site payload and hostname from the reference example', () => {
  const plan = buildPlan({ title: '  Il Mio Nuovo Sito ', outline: 'Prima Sezione\n  Prima Sottosezione' }, ENV);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.site, {
    name: 'il-mio-nuovo-sito',
    title: 'Il Mio Nuovo Sito',
    liveHostname: 'https://ilmionuovosito-canary.neon.test:3000',
    payload: {
      type: 'site/headless', name: 'il-mio-nuovo-sito', description: '', parentRef: '', familyRef: '',
      title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000', group: '',
    },
  });
});

test('sectionPayload matches the reference payloads', () => {
  const plan = buildPlan({ title: 'Il Mio Nuovo Sito', outline: 'Prima Sezione\n  Prima Sottosezione' }, ENV);
  assert.deepEqual(sectionPayload(plan.sections[0], 'il-mio-nuovo-sito', '40ec-3774c37ee54c-9ccd1bdde21f-2000'), {
    siteName: 'il-mio-nuovo-sito', parentId: '40ec-3774c37ee54c-9ccd1bdde21f-2000', name: 'prima-sezione', type: 'section',
    title: 'Prima Sezione', description: null, path: '/prima-sezione/',
    style: { theme: null, variant: null, type: null, template: null }, status: null,
  });
  assert.deepEqual(sectionPayload(plan.sections[1], 'il-mio-nuovo-sito', '40ec-e686376c1ef5-0d86c42db72b-2001'), {
    siteName: 'il-mio-nuovo-sito', parentId: '40ec-e686376c1ef5-0d86c42db72b-2001', name: 'prima-sottosezione', type: 'section',
    title: 'Prima Sottosezione', description: null, path: '/prima-sezione/prima-sottosezione/',
    style: { theme: null, variant: null, type: null, template: null }, status: null,
  });
});

test('buildPlan: title errors', () => {
  assert.deepEqual(buildPlan({ title: '   ', outline: '' }, ENV).errors, ['title is required']);
  const bad = buildPlan({ title: '!!!', outline: '' }, ENV);
  assert.deepEqual(bad.errors, ['title has no usable characters for a site name']);
  assert.equal(bad.site.liveHostname, null);
});

test('buildPlan: missing siteHostSuffix', () => {
  const env = { id: 'nosuffix', neon: { fo: { url: 'https://x', apiKey: 'k', siteHostSuffix: null } } };
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, env).errors, ['site creation not configured for env nosuffix: neon.fo.siteHostSuffix missing']);
  const noFo = { id: 'nofo', neon: { fo: null } };
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, noFo).errors, ['site creation not configured for env nofo: neon.fo.siteHostSuffix missing']);
});

test('buildPlan: empty outline is allowed; section limit enforced', () => {
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, ENV).sections, []);
  const many = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => `S ${i}`).join('\n');
  assert.deepEqual(buildPlan({ title: 'Sito', outline: many }, ENV).errors, [`outline has ${MAX_SECTIONS + 1} sections; the limit is ${MAX_SECTIONS}`]);
});
