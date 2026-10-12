'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaxonomyPlan } = require('../../src/helpers/taxonomy-builder/plan.js');
const { errorMessage } = require('../../src/helpers/site-builder/create-site.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor } = require('../../src/helpers/taxonomy-builder/create-taxonomy.js');

const plan = (categories, tags = '') => buildTaxonomyPlan({ categories, tags });

function fakeNeon({ catFamilies = [], trees = {}, tagFamilies = [], tagsByFamily = {}, fail = {}, failNames = [], noIdNames = [] } = {}) {
  const calls = [];
  let n = 0;
  const nextId = () => `new-${(n += 1)}`;
  const maybeFail = (key) => { if (fail[key]) throw fail[key]; };
  return {
    calls,
    async getCategoryFamilies() { calls.push(['getCategoryFamilies']); maybeFail('getCategoryFamilies'); return catFamilies; },
    async getCategory(o) { calls.push(['getCategory', o]); maybeFail('getCategory'); return trees[o.categoryRef]; },
    async getTagFamilies() { calls.push(['getTagFamilies']); maybeFail('getTagFamilies'); return tagFamilies; },
    async getTagsInFamily(id) { calls.push(['getTagsInFamily', id]); maybeFail('getTagsInFamily'); return tagsByFamily[id] || []; },
    async createCategoryRaw(body) {
      calls.push(['createCategoryRaw', body]);
      if (failNames.includes(body.categoryName)) { const e = new Error('x'); e.response = { status: 409, data: { message: 'conflict' } }; throw e; }
      return noIdNames.includes(body.categoryName) ? {} : { categoryRef: nextId() };
    },
    async createTagFamilyRaw(name) { calls.push(['createTagFamilyRaw', name]); if (failNames.includes(name)) throw new Error('tag family failed'); return { id: nextId() }; },
    async createTagRaw(familyId, tagName) { calls.push(['createTagRaw', familyId, tagName]); return { id: nextId() }; },
  };
}

const writes = (neon) => neon.calls.filter((c) => c[0].startsWith('create'));

test('all new: creates families then children with correct parentRef/rootRef', async () => {
  const p = plan('GruppoBello\n  Livello 1\n    Livello 2', 'Nuova Famiglia\n  Nuovo Tag');
  const neon = fakeNeon();
  const { existing, errors } = await readExisting(p, neon, 'env1');
  assert.deepEqual(errors, []);
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.deepEqual(writes(neon).map((c) => c.slice(1)), [
    [{ categoryName: 'GruppoBello', categoryMeta: { description: '', type: 'root', defaultLanguage: 'en-uk' } }],
    [{ categoryName: 'Livello 1', categoryMeta: { description: '', type: 'item' }, parentRef: 'new-1', rootRef: 'new-1' }],
    [{ categoryName: 'Livello 2', categoryMeta: { description: '', type: 'item' }, parentRef: 'new-2', rootRef: 'new-1' }],
    ['Nuova Famiglia'],
    ['new-4', 'Nuovo Tag'],
  ]);
  assert.deepEqual(report.counts, { created: 5, exists: 0, failed: 0, skipped: 0 });
  assert.deepEqual(report.categories.map((i) => [i.path, i.status, i.ref]), [
    ['GruppoBello', 'created', 'new-1'], ['GruppoBello / Livello 1', 'created', 'new-2'], ['GruppoBello / Livello 1 / Livello 2', 'created', 'new-3'],
  ]);
  assert.deepEqual(report.tags.map((i) => [i.path, i.status, i.id]), [['Nuova Famiglia', 'created', 'new-4'], ['Nuova Famiglia / Nuovo Tag', 'created', 'new-5']]);
  assert.equal(httpStatusFor(report), 200);
});

test('existing family (case-insensitive) reused; new children carry its ref as parentRef and rootRef', async () => {
  const p = plan('gruppobello\n  Livello 1\n  Nuovo');
  const neon = fakeNeon({
    catFamilies: [{ categoryRef: 'root-1', name: 'GruppoBello', deleted: false }],
    trees: { 'root-1': { categoryRef: 'root-1', name: 'GruppoBello', children: [{ categoryRef: 'c-1', name: 'Livello 1', deleted: false }] } },
  });
  const { existing } = await readExisting(p, neon, 'env1');
  assert.deepEqual(neon.calls.find((c) => c[0] === 'getCategory')[1], { categoryRef: 'root-1', depth: 1 });
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.deepEqual(writes(neon).map((c) => c[1]), [{ categoryName: 'Nuovo', categoryMeta: { description: '', type: 'item' }, parentRef: 'root-1', rootRef: 'root-1' }]);
  assert.deepEqual(report.categories.map((i) => [i.status, i.ref]), [['exists', 'root-1'], ['exists', 'c-1'], ['created', 'new-1']]);
});

test('soft-deleted existing family is ignored -> created anew', async () => {
  const p = plan('GruppoBello');
  const neon = fakeNeon({ catFamilies: [{ categoryRef: 'old', name: 'GruppoBello', deleted: true }] });
  const { existing } = await readExisting(p, neon, 'env1');
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.equal(report.categories[0].status, 'created');
});

test('defensive shapes: result wrapper, id, categoryInfo.names, items', async () => {
  const p = plan('Fam\n  Child', 'TF\n  T1');
  const neon = fakeNeon({
    catFamilies: { result: [{ id: 'root-9', categoryInfo: { names: 'Fam' } }] },
    trees: { 'root-9': { id: 'root-9', items: [{ id: 'c-9', categoryInfo: { names: 'Fam / Child' } }] } },
    tagFamilies: { items: [{ id: 'tf-1', name: 'TF' }] },
    tagsByFamily: { 'tf-1': { result: [{ id: 't-1', name: 't1' }] } },
  });
  const { existing, errors } = await readExisting(p, neon, 'env1');
  assert.deepEqual(errors, []);
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.equal(writes(neon).length, 0);
  assert.deepEqual(report.counts, { created: 0, exists: 4, failed: 0, skipped: 0 });
  assert.equal(httpStatusFor(report), 200);
});

test('read failures block with clear errors', async () => {
  const p = plan('Fam\n  Child', 'TF\n  T1');
  const r1 = await readExisting(p, fakeNeon({ fail: { getCategoryFamilies: new Error('ECONNREFUSED') } }), 'env1');
  assert.ok(r1.errors.includes('could not read existing category families in env env1: ECONNREFUSED'));
  const r2 = await readExisting(plan('Fam\n  Child'), fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'Fam' }], fail: { getCategory: new Error('boom') } }), 'env1');
  assert.deepEqual(r2.errors, ['could not read existing categories of "Fam" in env env1: boom']);
  const r3 = await readExisting(plan('', 'TF'), fakeNeon({ tagFamilies: 'not a list' }), 'env1');
  assert.deepEqual(r3.errors, ['could not read existing tag families in env env1: unexpected response']);
  const r4 = await readExisting(plan('', 'TF\n  T'), fakeNeon({ tagFamilies: [{ id: 'tf', name: 'TF' }], fail: { getTagsInFamily: new Error('nope') } }), 'env1');
  assert.deepEqual(r4.errors, ['could not read existing tags of "TF" in env env1: nope']);
});

test('only reads what the outline needs', async () => {
  const neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'Fam' }] });
  await readExisting(plan('Fam'), neon, 'env1');
  assert.deepEqual(neon.calls.map((c) => c[0]), ['getCategoryFamilies']);
  const empty = fakeNeon();
  await readExisting(plan('', ''), empty, 'env1');
  assert.deepEqual(empty.calls, []);
});

test('failure cascades: failed category skips its subtree, siblings continue', async () => {
  const p = plan('F\n  A\n    A1\n  B', 'TF\n  T');
  const neon = fakeNeon({ failNames: ['A', 'TF'] });
  const { existing } = await readExisting(p, neon, 'env1');
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.deepEqual(report.categories.map((i) => [i.name, i.status, i.error]), [
    ['F', 'created', undefined], ['A', 'failed', '409: conflict'], ['A1', 'skipped', 'parent "A" was not created'], ['B', 'created', undefined],
  ]);
  assert.deepEqual(report.tags.map((i) => [i.name, i.status]), [['TF', 'failed'], ['T', 'skipped']]);
  assert.deepEqual(report.counts, { created: 2, exists: 0, failed: 2, skipped: 2 });
  assert.equal(httpStatusFor(report), 200);
});

test('created without id -> failed; all attempts failing -> 502', async () => {
  const p = plan('F\n  C');
  const neon = fakeNeon({ noIdNames: ['F'] });
  const { existing } = await readExisting(p, neon, 'env1');
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.deepEqual(report.categories.map((i) => [i.status, i.error]), [['failed', 'created but no id returned'], ['skipped', 'parent "F" was not created']]);
  assert.equal(httpStatusFor(report), 502);
});

test('previewView marks new/exists and counts toCreate', async () => {
  const p = plan('Fam\n  New', 'TF');
  const neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'Fam' }], trees: { r: { categoryRef: 'r', name: 'Fam', children: [] } } });
  const { existing, errors } = await readExisting(p, neon, 'env1');
  const view = previewView(p, existing, 'env1', errors);
  assert.deepEqual(view.categories.map((i) => [i.path, i.kind, i.status]), [['Fam', 'family', 'exists'], ['Fam / New', 'category', 'new']]);
  assert.deepEqual(view.tags.map((i) => [i.path, i.status]), [['TF', 'new']]);
  assert.equal(view.toCreate, 2);
  assert.equal(view.env, 'env1');
});

test('demoReport simulates success', () => {
  const report = demoReport(plan('F\n  C', 'TF\n  T'), 'env1');
  assert.deepEqual(report.counts, { created: 4, exists: 0, failed: 0, skipped: 0 });
  assert.deepEqual(report.categories.map((i) => i.ref), ['demo-1', 'demo-2']);
  assert.deepEqual(report.tags.map((i) => i.id), ['demo-3', 'demo-4']);
});

test('F1: matched items without ref/id are read errors, not "exists"', async () => {
  const neon1 = fakeNeon({ catFamilies: [{ name: 'Fam' }] });
  const r1 = await readExisting(plan('Fam\n  Child'), neon1, 'env1');
  assert.deepEqual(r1.errors, ['could not read existing categories of "Fam" in env env1: matched "Fam" has no ref']);
  assert.ok(!neon1.calls.some((c) => c[0] === 'getCategory'));

  const r2 = await readExisting(plan('Fam\n  Child'), fakeNeon({
    catFamilies: [{ categoryRef: 'r', name: 'Fam' }],
    trees: { r: { categoryRef: 'r', children: [{ name: 'Child' }] } },
  }), 'env1');
  assert.deepEqual(r2.errors, ['could not read existing categories of "Fam" in env env1: matched "Child" has no ref']);

  const neon3 = fakeNeon({ tagFamilies: [{ name: 'TF' }] });
  const r3 = await readExisting(plan('', 'TF\n  T'), neon3, 'env1');
  assert.deepEqual(r3.errors, ['could not read existing tags of "TF" in env env1: matched "TF" has no id']);
  assert.ok(!neon3.calls.some((c) => c[0] === 'getTagsInFamily'));

  const r4 = await readExisting(plan('', 'TF\n  T'), fakeNeon({ tagFamilies: [{ id: 'tf', name: 'TF' }], tagsByFamily: { tf: [{ name: 'T' }] } }), 'env1');
  assert.deepEqual(r4.errors, ['could not read existing tags of "TF" in env env1: matched "T" has no id']);
});

test('F1: backstop - no parent/root ref or family id means failed with no write', async () => {
  const p = plan('Fam\n  Child', 'TF\n  T');
  const neon = fakeNeon();
  const existing = { categories: [{ status: 'exists', ref: null }, { status: 'new' }], tags: [{ status: 'exists', ref: null }, { status: 'new' }] };
  const report = await createTaxonomy(p, existing, neon, 'env1');
  assert.deepEqual(report.categories[1].status, 'failed');
  assert.equal(report.categories[1].error, 'missing parent or root ref');
  assert.equal(report.tags[1].status, 'failed');
  assert.equal(report.tags[1].error, 'missing family id');
  assert.equal(writes(neon).length, 0);
});

test('F2: malformed children is a read error; null children means none', async () => {
  const catFamilies = [{ categoryRef: 'r', name: 'Fam' }];
  const bad = await readExisting(plan('Fam\n  Child'), fakeNeon({ catFamilies, trees: { r: { categoryRef: 'r', children: { not: 'a list' } } } }), 'env1');
  assert.deepEqual(bad.errors, ['could not read existing categories of "Fam" in env env1: unexpected children shape']);
  const nul = await readExisting(plan('Fam\n  Child'), fakeNeon({ catFamilies, trees: { r: { categoryRef: 'r', children: null } } }), 'env1');
  assert.deepEqual(nul.errors, []);
  assert.equal(nul.existing.categories[1].status, 'new');
});

test('F3: matching ignores case, repeated/NBSP whitespace and Unicode normalisation', async () => {
  const r1 = await readExisting(plan('Gruppo  Bello'), fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'gruppo bello' }] }), 'env1');
  assert.equal(r1.existing.categories[0].status, 'exists');
  const r2 = await readExisting(plan('Gruppo Bello'), fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'Gruppo Bello' }] }), 'env1');
  assert.equal(r2.existing.categories[0].status, 'exists');
  const r3 = await readExisting(plan('Café'), fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'Café' }] }), 'env1');
  assert.equal(r3.existing.categories[0].status, 'exists');
});

test('F3: read errors surface the Neon HTTP status/message', async () => {
  const e = new Error('Request failed'); e.response = { status: 503, data: { message: 'unavailable' } };
  const r = await readExisting(plan('Fam'), fakeNeon({ fail: { getCategoryFamilies: e } }), 'env1');
  assert.equal(r.errors[0], `could not read existing category families in env env1: ${errorMessage(e)}`);
  assert.notEqual(errorMessage(e), 'Request failed');
});

test('F3: plan flags duplicates that differ only by whitespace/case', () => {
  const p = plan('Root\n  A  B\n  a b');
  assert.ok(p.errors.some((m) => /duplicate/.test(m)), JSON.stringify(p.errors));
});
