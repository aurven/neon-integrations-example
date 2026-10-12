'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaxonomyPlan } = require('../../src/helpers/taxonomy-builder/plan.js');
const { errorMessage } = require('../../src/helpers/site-builder/create-site.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor } = require('../../src/helpers/taxonomy-builder/create-taxonomy.js');
const { JOB_MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');
const { attemptItem, categoryCreator, tagCreator, emptyResult } = require('../../src/helpers/taxonomy-builder/create-taxonomy.js');

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
  assert.equal(view.mode, 'full');
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

function franceOutline({ regions = 19, departments = 106, communes = 34960 } = {}) {
  const lines = ['# generated', 'France'];
  let d = 0;
  let c = 0;
  for (let r = 0; r < regions; r += 1) {
    lines.push(`  Region ${r}`);
    const dEnd = Math.round(((r + 1) * departments) / regions);
    for (; d < dEnd; d += 1) {
      lines.push(`    Dept ${d}`);
      const cEnd = Math.round(((d + 1) * communes) / departments);
      for (; c < cEnd; c += 1) lines.push(`      Commune ${c}`);
    }
  }
  return lines.join('\n');
}

test('small previews are full mode with errorCount', async () => {
  const p = plan('Fam\n  New', 'TF');
  const view = previewView(p, { categories: [{ status: 'exists' }, { status: 'new' }], tags: [{ status: 'new' }] }, 'env1', ['e1']);
  assert.equal(view.mode, 'full');
  assert.equal(view.errorCount, 1);
  assert.deepEqual(view.errors, ['e1']);
  assert.equal(view.toCreate, 2);
});

test('previews above 500 items are summaries with per-level rows and capped sample/errors', () => {
  const p = buildTaxonomyPlan({ categories: franceOutline({ regions: 2, departments: 4, communes: 600 }), tags: 'TF\n  T1\n  T2', maxItems: JOB_MAX_ITEMS });
  assert.deepEqual(p.errors, []);
  const existing = { categories: p.categories.map((_, i) => ({ status: p.categories[i].depth <= 2 ? 'exists' : 'new' })), tags: p.tags.map(() => ({ status: 'new' })) };
  const errors = Array.from({ length: 250 }, (_, i) => `err ${i}`);
  const view = previewView(p, existing, 'env1', errors);
  assert.equal(view.mode, 'summary');
  assert.equal(view.env, 'env1');
  assert.equal(view.total, 1 + 2 + 4 + 600 + 3);
  assert.equal(view.toCreate, view.total - 3);
  assert.deepEqual(view.levels, [
    { outline: 'categories', depth: 1, kind: 'family', total: 1, new: 0, exists: 1 },
    { outline: 'categories', depth: 2, kind: 'category', total: 2, new: 0, exists: 2 },
    { outline: 'categories', depth: 3, kind: 'category', total: 4, new: 4, exists: 0 },
    { outline: 'categories', depth: 4, kind: 'category', total: 600, new: 600, exists: 0 },
    { outline: 'tags', depth: 1, kind: 'family', total: 1, new: 1, exists: 0 },
    { outline: 'tags', depth: 2, kind: 'tag', total: 2, new: 2, exists: 0 },
  ]);
  assert.equal(view.sample.categories.length, 200);
  assert.deepEqual(view.sample.categories[0], { path: 'France', name: 'France', depth: 1, kind: 'family', status: 'exists' });
  assert.equal(view.sample.tags.length, 3);
  assert.equal(view.errors.length, 200);
  assert.equal(view.errorCount, 250);
  assert.equal(view.categories, undefined);
});

test('attemptItem applies the per-item rules shared by sync create and jobs', async () => {
  const p = plan('F\n  C\nG\n  D', '');
  const results = p.categories.map(emptyResult);
  const matches = [{ status: 'exists', ref: 'f-ref' }, { status: 'new' }, { status: 'new' }, { status: 'new' }];
  const created = [];
  const create = async (item) => { created.push(item.name); if (item.name === 'G') throw new Error('boom'); return `id-${item.name}`; };
  assert.equal((await attemptItem(p.categories, matches, results, 0, 'ref', create)).status, 'exists');
  assert.deepEqual(await attemptItem(p.categories, matches, results, 1, 'ref', create), { path: 'F / C', name: 'C', depth: 2, kind: 'category', status: 'created', ref: 'id-C' });
  assert.deepEqual(await attemptItem(p.categories, matches, results, 2, 'ref', create), { path: 'G', name: 'G', depth: 1, kind: 'family', status: 'failed', error: 'boom' });
  assert.deepEqual(await attemptItem(p.categories, matches, results, 3, 'ref', create), { path: 'G / D', name: 'D', depth: 2, kind: 'category', status: 'skipped', error: 'parent "G" was not created' });
  assert.deepEqual(created, ['C', 'G']);
  const noId = await attemptItem(p.categories, [{ status: 'new' }], [emptyResult(p.categories[0])], 0, 'ref', async () => null);
  assert.equal(noId.error, 'created but no id returned');
});

test('categoryCreator and tagCreator build the reference payloads', async () => {
  const neon = fakeNeon();
  const p = plan('F\n  C', 'TF\n  T');
  const cats = p.categories.map(emptyResult);
  const createCat = categoryCreator(p, neon);
  cats[0].status = 'created'; cats[0].ref = await createCat(p.categories[0], 0, cats);
  cats[1].ref = await createCat(p.categories[1], 1, cats);
  const tags = p.tags.map(emptyResult);
  const createTag = tagCreator(neon);
  tags[0].status = 'created'; tags[0].id = await createTag(p.tags[0], 0, tags);
  tags[1].id = await createTag(p.tags[1], 1, tags);
  assert.deepEqual(neon.calls, [
    ['createCategoryRaw', { categoryName: 'F', categoryMeta: { description: '', type: 'root', defaultLanguage: 'en-uk' } }],
    ['createCategoryRaw', { categoryName: 'C', categoryMeta: { description: '', type: 'item' }, parentRef: 'new-1', rootRef: 'new-1' }],
    ['createTagFamilyRaw', 'TF'],
    ['createTagRaw', 'new-3', 'T'],
  ]);
});

test('readExisting matches a 35k all-existing tree quickly (indexed lookups)', async () => {
  const p = buildTaxonomyPlan({ categories: franceOutline(), tags: '', maxItems: JOB_MAX_ITEMS });
  assert.deepEqual(p.errors, []);
  assert.equal(p.categories.length, 35086);
  // Build the Neon tree mirroring the outline.
  const nodes = p.categories.map((item, i) => ({ categoryRef: `ref-${i}`, name: item.name, children: [] }));
  p.categories.forEach((item, i) => { if (item.parentIndex !== null) nodes[item.parentIndex].children.push(nodes[i]); });
  const neon = fakeNeon({ catFamilies: [{ categoryRef: 'ref-0', name: 'France' }], trees: { 'ref-0': nodes[0] } });
  const started = Date.now();
  const { existing, errors } = await readExisting(p, neon, 'env1');
  const elapsed = Date.now() - started;
  assert.deepEqual(errors, []);
  assert.ok(existing.categories.every((m) => m.status === 'exists'));
  assert.equal(existing.categories[35085].ref, 'ref-35085');
  assert.ok(elapsed < 3000, `readExisting took ${elapsed} ms`);
});
