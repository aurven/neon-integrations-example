'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaxonomyPlan, categoryFamilyPayload, categoryPayload, familyIndexOf, MAX_ITEMS, JOB_MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');

test('categories outline: families and nested categories with paths', () => {
  const plan = buildTaxonomyPlan({ categories: 'GruppoBello\n  Livello 1\n    Livello 2\nAltro', tags: '' });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.categories.map((i) => [i.kind, i.depth, i.name, i.path, i.parentIndex]), [
    ['family', 1, 'GruppoBello', 'GruppoBello', null],
    ['category', 2, 'Livello 1', 'GruppoBello / Livello 1', 0],
    ['category', 3, 'Livello 2', 'GruppoBello / Livello 1 / Livello 2', 1],
    ['family', 1, 'Altro', 'Altro', null],
  ]);
  assert.equal(familyIndexOf(plan.categories, 2), 0);
  assert.equal(plan.defaultLanguage, 'en-uk');
});

test('tags outline: families and tags; nesting under a tag is an error', () => {
  const ok = buildTaxonomyPlan({ categories: '', tags: 'Nuova Famiglia\n  Nuovo Tag\n  Altro Tag' });
  assert.deepEqual(ok.tags.map((i) => [i.kind, i.name, i.parentIndex]), [['family', 'Nuova Famiglia', null], ['tag', 'Nuovo Tag', 0], ['tag', 'Altro Tag', 0]]);
  const bad = buildTaxonomyPlan({ categories: '', tags: 'F\n  T\n    Sub' });
  assert.deepEqual(bad.errors, ['tags line 3: tags cannot be nested under a tag']);
});

test('parse errors are prefixed with the outline name', () => {
  const plan = buildTaxonomyPlan({ categories: '  A', tags: 'F\n    T\n  U' });
  assert.deepEqual(plan.errors, ['categories line 1: first line cannot be indented', 'tags line 3: indentation does not match any parent level']);
});

test('duplicate siblings are detected case-insensitively', () => {
  const plan = buildTaxonomyPlan({ categories: 'News\n  Sport\n  sport\nnews', tags: 'F\n  T\n  t' });
  assert.deepEqual(plan.errors, [
    'categories line 3: duplicate "sport" under News',
    'categories line 4: duplicate "news" under top level',
    'tags line 3: duplicate "t" under F',
  ]);
  assert.deepEqual(buildTaxonomyPlan({ categories: 'A\n  X\nB\n  X', tags: '' }).errors, []);
});

test('custom defaultLanguage and item limit', () => {
  assert.equal(buildTaxonomyPlan({ categories: 'A', tags: '', defaultLanguage: 'it' }).defaultLanguage, 'it');
  const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => `C ${i}`).join('\n');
  assert.deepEqual(buildTaxonomyPlan({ categories: many, tags: '' }).errors, [`outline has ${MAX_ITEMS + 1} items; the limit is ${MAX_ITEMS}`]);
});

test('payload builders match the reference payloads', () => {
  assert.deepEqual(categoryFamilyPayload('GruppoBello', 'en-uk'), { categoryName: 'GruppoBello', categoryMeta: { description: '', type: 'root', defaultLanguage: 'en-uk' } });
  assert.deepEqual(categoryPayload('Livello 1', '21cfe1a0a85a-8b6a226ac675', '21cfe1a0a85a-8b6a226ac675'), {
    categoryName: 'Livello 1', categoryMeta: { description: '', type: 'item' }, parentRef: '21cfe1a0a85a-8b6a226ac675', rootRef: '21cfe1a0a85a-8b6a226ac675',
  });
});

test('taxonomy outlines ignore # comment lines', () => {
  const plan = buildTaxonomyPlan({ categories: '# France\nFrance\n  # regions\n  Bretagne', tags: '# none\nF\n  T' });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.categories.map((i) => [i.line, i.path]), [[2, 'France'], [4, 'France / Bretagne']]);
  assert.deepEqual(plan.tags.map((i) => i.path), ['F', 'F / T']);
});

test('item limit is a parameter: 500 by default, 50000 for jobs', () => {
  assert.equal(MAX_ITEMS, 500);
  assert.equal(JOB_MAX_ITEMS, 50000);
  const many = ['F', ...Array.from({ length: 600 }, (_, i) => `  C ${i}`)].join('\n');
  assert.deepEqual(buildTaxonomyPlan({ categories: many, tags: '' }).errors, ['outline has 601 items; the limit is 500']);
  assert.deepEqual(buildTaxonomyPlan({ categories: many, tags: '', maxItems: JOB_MAX_ITEMS }).errors, []);
  const huge = ['F', ...Array.from({ length: 50000 }, (_, i) => `  C ${i}`)].join('\n');
  assert.deepEqual(buildTaxonomyPlan({ categories: huge, tags: '', maxItems: JOB_MAX_ITEMS }).errors, ['outline has 50001 items; the limit is 50000']);
});
