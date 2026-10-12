'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const neonApi = require('../../src/helpers/neon-bo-api-v3.js');

function stubbedClient() {
  const client = new neonApi.NeonClient({ baseUrl: 'https://neon-bo.example.com/api', apiKey: 'bo-key', userApiKey: 'user-key' });
  const calls = [];
  client.client.request = async (config) => {
    calls.push(config);
    return { status: 200, data: { ok: true } };
  };
  return { client, calls };
}

async function callOf(invoke) {
  const { client, calls } = stubbedClient();
  const result = await invoke(client);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  const { method, url, params, data, baseURL, headers } = calls[0];
  assert.equal(baseURL, 'https://neon-bo.example.com/api');
  assert.equal(headers['neon-bo-access-key'], 'bo-key');
  return { method, url, params, data };
}

// ── Categories ──────────────────────────────────────────────────────────────

test('getCategory', async () => {
  const c = await callOf((n) => n.getCategory({ categoryRef: 'cat-1', includeDeleted: true, depth: 2, limit: 50, localeForOrdering: 'it' }));
  assert.deepEqual(c, { method: 'get', url: '/core/categories', params: { categoryRef: 'cat-1', includeDeleted: true, depth: 2, limit: 50, localeForOrdering: 'it' }, data: undefined });
});

test('getCategory with no options sends no params', async () => {
  const c = await callOf((n) => n.getCategory());
  assert.deepEqual(c.params, {});
});

test('getCategoryFamilies', async () => {
  const c = await callOf((n) => n.getCategoryFamilies({ includeDeleted: false }));
  assert.deepEqual(c, { method: 'get', url: '/core/categories/families', params: { includeDeleted: false }, data: undefined });
});

test('suggestCategories drops unset params', async () => {
  const c = await callOf((n) => n.suggestCategories({ namePattern: 'pol', limit: 10 }));
  assert.deepEqual(c, { method: 'get', url: '/core/categories/suggest', params: { namePattern: 'pol', limit: 10 }, data: undefined });
});

test('createCategory posts the creator body', async () => {
  const creator = { name: 'Politics', parentRef: 'root' };
  const c = await callOf((n) => n.createCategory(creator));
  assert.deepEqual(c, { method: 'post', url: '/core/categories/create', params: undefined, data: creator });
});

test('updateCategory posts the updater body', async () => {
  const updater = { categoryRef: 'cat-1', name: 'Politics & Gov' };
  const c = await callOf((n) => n.updateCategory(updater));
  assert.deepEqual(c, { method: 'post', url: '/core/categories/update', params: undefined, data: updater });
});

test('deleteCategory / destroyCategory', async () => {
  assert.deepEqual(await callOf((n) => n.deleteCategory('cat-1', 'sc')), { method: 'delete', url: '/core/categories/delete', params: { categoryRef: 'cat-1', secureCode: 'sc' }, data: undefined });
  assert.deepEqual(await callOf((n) => n.destroyCategory('cat-1', 'sc')), { method: 'delete', url: '/core/categories/destroy', params: { categoryRef: 'cat-1', secureCode: 'sc' }, data: undefined });
});

test('bulkDeleteCategories / bulkDestroyCategories post the ref list', async () => {
  assert.deepEqual(await callOf((n) => n.bulkDeleteCategories(['a', 'b'], 'sc')), { method: 'post', url: '/core/categories/bulk/delete', params: { secureCode: 'sc' }, data: ['a', 'b'] });
  assert.deepEqual(await callOf((n) => n.bulkDestroyCategories(['a'], 'sc')), { method: 'post', url: '/core/categories/bulk/destroy', params: { secureCode: 'sc' }, data: ['a'] });
});

test('restoreCategory', async () => {
  const c = await callOf((n) => n.restoreCategory('cat-1', { locale: 'en' }));
  assert.deepEqual(c, { method: 'post', url: '/core/categories/restore', params: { categoryRef: 'cat-1', locale: 'en' }, data: undefined });
});

test('required arguments are validated before any request', async () => {
  const { client, calls } = stubbedClient();
  await assert.rejects(() => client.deleteCategory(undefined, 'sc'), /categoryRef is required/);
  await assert.rejects(() => client.deleteCategory('cat-1'), /secureCode is required/);
  await assert.rejects(() => client.bulkDeleteCategories([], 'sc'), /categoryRefs must be a non-empty array/);
  await assert.rejects(() => client.restoreCategory(''), /categoryRef is required/);
  await assert.rejects(() => client.createCategory(), /categoryCreator is required/);
  await assert.rejects(() => client.getTagByName('Topics'), /tagName is required/);
  await assert.rejects(() => client.createTagFamily(''), /tagFamilyName is required/);
  assert.equal(calls.length, 0);
});

// ── Tags ────────────────────────────────────────────────────────────────────

test('getTagFamilies', async () => {
  const c = await callOf((n) => n.getTagFamilies({ includeDeleted: true }));
  assert.deepEqual(c, { method: 'get', url: '/core/tags/families', params: { includeDeleted: true }, data: undefined });
});

test('getTagsInFamily', async () => {
  const c = await callOf((n) => n.getTagsInFamily('fam-1'));
  assert.deepEqual(c, { method: 'get', url: '/core/tags', params: { tagFamilyId: 'fam-1' }, data: undefined });
});

test('suggestTags', async () => {
  const c = await callOf((n) => n.suggestTags({ tagName: 'sa', tagFamilyName: 'People', limit: 5, locale: 'en' }));
  assert.deepEqual(c, { method: 'get', url: '/core/tags/suggest', params: { tagName: 'sa', tagFamilyName: 'People', limit: 5, locale: 'en' }, data: undefined });
});

test('getTagByName encodes path segments', async () => {
  const c = await callOf((n) => n.getTagByName('People & Places', 'George Santos/US'));
  assert.equal(c.method, 'get');
  assert.equal(c.url, '/core/tags/families/People%20%26%20Places/George%20Santos%2FUS');
});

test('createTagFamily / deleteTagFamily', async () => {
  assert.deepEqual(await callOf((n) => n.createTagFamily('Topics')), { method: 'post', url: '/core/tags/families/Topics', params: undefined, data: undefined });
  assert.deepEqual(await callOf((n) => n.deleteTagFamily('Topics', { destroy: true })), { method: 'delete', url: '/core/tags/families/Topics', params: { destroy: true }, data: undefined });
  assert.deepEqual((await callOf((n) => n.deleteTagFamily('Topics'))).params, {});
});

test('createTag (by family name) / createTagByFamilyId', async () => {
  assert.deepEqual(await callOf((n) => n.createTag('Topics', 'Elections')), { method: 'post', url: '/core/tags/families/Topics/Elections', params: undefined, data: undefined });
  assert.deepEqual(await callOf((n) => n.createTagByFamilyId('fam-1', 'Elections')), { method: 'post', url: '/core/tags/fam-1/Elections', params: undefined, data: undefined });
});

test('deleteTag', async () => {
  const c = await callOf((n) => n.deleteTag('Topics', 'Elections', { destroy: false }));
  assert.deepEqual(c, { method: 'delete', url: '/core/tags/families/Topics/Elections', params: { destroy: false }, data: undefined });
});

test('admin/replication endpoints are not exposed', () => {
  const { client } = stubbedClient();
  for (const name of ['acquireCategoryMastership', 'forceCategoryUnilateralMaster', 'forceCategoryUnilateralReplica']) {
    assert.equal(client[name], undefined);
    assert.equal(neonApi[name], undefined);
  }
});

// ── Flat API uses the request's environment ─────────────────────────────────

test('flat exports exist for every taxonomy method and resolve the env client', async () => {
  const names = [
    'getCategory', 'getCategoryFamilies', 'suggestCategories', 'createCategory', 'updateCategory',
    'deleteCategory', 'destroyCategory', 'bulkDeleteCategories', 'bulkDestroyCategories', 'restoreCategory',
    'getTagFamilies', 'getTagsInFamily', 'suggestTags', 'getTagByName', 'createTagFamily', 'deleteTagFamily',
    'createTag', 'createTagByFamilyId', 'deleteTag',
  ];
  for (const name of names) assert.equal(typeof neonApi[name], 'function', `missing flat export ${name}`);

  const env = { id: 'tax', neon: { insecureTls: false, bo: { url: 'https://neon-bo-tax.example.com/api', apiKey: 'k', userApiKey: 'u' } } };
  const seen = [];
  const envClient = neonApi.clientFor(env);
  envClient.client.request = async (config) => { seen.push(config); return { status: 200, data: [] }; };
  await context.run(env, () => neonApi.getTagFamilies());
  assert.equal(seen.length, 1);
  assert.equal(seen[0].baseURL, 'https://neon-bo-tax.example.com/api');
  assert.equal(seen[0].url, '/core/tags/families');
});
