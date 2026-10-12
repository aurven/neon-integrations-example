'use strict';
/**
 * Taxonomy Builder: read existing families/categories/tags, merge by name, create what is missing
 * parent-first, continuing past failures. Spec: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §2-§3
 * Jobs/scale: docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §2-§3
 */
const { categoryFamilyPayload, categoryPayload, familyIndexOf } = require('./plan.js');
const { errorMessage } = require('../site-builder/create-site.js');

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.result)) return value.result;
  if (value && Array.isArray(value.items)) return value.items;
  return null;
}

function refOf(node) { return (node && (node.categoryRef || node.id)) || null; }

function nameOf(node) {
  if (node && typeof node.name === 'string' && node.name.trim()) return node.name;
  const names = node && node.categoryInfo && node.categoryInfo.names;
  return typeof names === 'string' ? names.split('/').pop().trim() : '';
}

function childrenOf(node) {
  const raw = node && (node.children != null ? node.children : node.items);
  if (raw === undefined || raw === null) return [];
  const list = asList(raw);
  if (!list) throw new Error('unexpected children shape');
  return list;
}

function normaliseName(s) { return String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase(); }

// Name index per Neon list, built once: re-runs of a 35k outline would otherwise rescan siblings per item.
const liveIndexes = new WeakMap();

function liveIndex(list) {
  let index = liveIndexes.get(list);
  if (!index) {
    index = new Map();
    for (const node of list) {
      if (!node || node.deleted === true) continue;
      const key = normaliseName(nameOf(node));
      if (!index.has(key)) index.set(key, node);
    }
    liveIndexes.set(list, index);
  }
  return index;
}

function findLive(list, name) {
  return liveIndex(list).get(normaliseName(name)) || null;
}

function unexpected() { return new Error('unexpected response'); }

async function readList(fn) {
  const list = asList(await fn());
  if (!list) throw unexpected();
  return list;
}

function maxDepthUnder(items, familyIndex) {
  let max = 1;
  items.forEach((item, i) => { if (familyIndexOf(items, i) === familyIndex) max = Math.max(max, item.depth); });
  return max;
}

async function readExisting(plan, neon, envId) {
  const errors = [];
  const categories = plan.categories.map(() => ({ status: 'new' }));
  const tags = plan.tags.map(() => ({ status: 'new' }));

  if (plan.categories.length) {
    let families = null;
    try { families = await readList(() => neon.getCategoryFamilies()); }
    catch (error) { errors.push(`could not read existing category families in env ${envId}: ${errorMessage(error)}`); }
    if (families) {
      for (let i = 0; i < plan.categories.length; i += 1) {
        const item = plan.categories[i];
        if (item.depth !== 1) continue;
        const match = findLive(families, item.name);
        if (!match) continue;
        if (!refOf(match)) {
          errors.push(`could not read existing categories of "${item.name}" in env ${envId}: matched "${item.name}" has no ref`);
          continue;
        }
        categories[i] = { status: 'exists', ref: refOf(match), node: match };
        const depth = maxDepthUnder(plan.categories, i) - 1;
        if (depth < 1) continue;
        try {
          // Neon CategoriesResource documents depth as "the number of children levels (0 = no children, null = all)",
          // so the levels below the family = outline max depth - 1. NEVER pass `limit`: the Neon UI uses limit 100,
          // which would truncate the read and cause duplicate creates.
          const tree = await neon.getCategory({ categoryRef: refOf(match), depth });
          if (!tree || typeof tree !== 'object') throw unexpected();
          categories[i].node = tree;
        } catch (error) {
          errors.push(`could not read existing categories of "${item.name}" in env ${envId}: ${errorMessage(error)}`);
        }
      }
      for (let i = 0; i < plan.categories.length; i += 1) {
        const item = plan.categories[i];
        if (item.depth === 1) continue;
        const parent = categories[item.parentIndex];
        if (parent.status !== 'exists' || !parent.node) continue;
        const family = plan.categories[familyIndexOf(plan.categories, i)].name;
        let match;
        try { match = findLive(childrenOf(parent.node), item.name); }
        catch (error) {
          const message = `could not read existing categories of "${family}" in env ${envId}: ${errorMessage(error)}`;
          if (!errors.includes(message)) errors.push(message);
          continue;
        }
        if (!match) continue;
        if (!refOf(match)) {
          errors.push(`could not read existing categories of "${family}" in env ${envId}: matched "${item.name}" has no ref`);
          continue;
        }
        categories[i] = { status: 'exists', ref: refOf(match), node: match };
      }
    }
  }

  if (plan.tags.length) {
    let families = null;
    try { families = await readList(() => neon.getTagFamilies()); }
    catch (error) { errors.push(`could not read existing tag families in env ${envId}: ${errorMessage(error)}`); }
    if (families) {
      for (let i = 0; i < plan.tags.length; i += 1) {
        const item = plan.tags[i];
        if (item.depth !== 1) continue;
        const match = findLive(families, item.name);
        if (!match) continue;
        if (!match.id) {
          errors.push(`could not read existing tags of "${item.name}" in env ${envId}: matched "${item.name}" has no id`);
          continue;
        }
        tags[i] = { status: 'exists', ref: match.id };
        if (!plan.tags.some((t) => t.parentIndex === i)) continue;
        let existingTags;
        try { existingTags = await readList(() => neon.getTagsInFamily(match.id)); }
        catch (error) { errors.push(`could not read existing tags of "${item.name}" in env ${envId}: ${errorMessage(error)}`); continue; }
        plan.tags.forEach((t, j) => {
          if (t.parentIndex !== i) return;
          const found = findLive(existingTags, t.name);
          if (!found) return;
          if (!found.id) {
            errors.push(`could not read existing tags of "${item.name}" in env ${envId}: matched "${t.name}" has no id`);
            return;
          }
          tags[j] = { status: 'exists', ref: found.id };
        });
      }
    }
  }

  return { existing: { categories, tags }, errors };
}

const FULL_PREVIEW_MAX = 500;
const PREVIEW_CAP = 200;

function levelRows(outline, items) {
  const rows = [];
  for (const item of items) {
    let row = rows[item.depth - 1];
    if (!row) row = rows[item.depth - 1] = { outline, depth: item.depth, kind: item.kind, total: 0, new: 0, exists: 0 };
    row.total += 1;
    row[item.status === 'exists' ? 'exists' : 'new'] += 1;
  }
  return rows.filter(Boolean);
}

function previewView(plan, existing, envId, errors) {
  const view = (items, matches) => items.map((item, i) => ({ path: item.path, name: item.name, depth: item.depth, kind: item.kind, status: matches[i].status }));
  const categories = view(plan.categories, existing.categories);
  const tags = view(plan.tags, existing.tags);
  const total = categories.length + tags.length;
  let toCreate = 0;
  for (const item of categories) if (item.status === 'new') toCreate += 1;
  for (const item of tags) if (item.status === 'new') toCreate += 1;
  if (total <= FULL_PREVIEW_MAX) return { env: envId, mode: 'full', categories, tags, toCreate, errors, errorCount: errors.length };
  return {
    env: envId,
    mode: 'summary',
    total,
    toCreate,
    levels: [...levelRows('categories', categories), ...levelRows('tags', tags)],
    sample: { categories: categories.slice(0, PREVIEW_CAP), tags: tags.slice(0, PREVIEW_CAP) },
    errors: errors.slice(0, PREVIEW_CAP),
    errorCount: errors.length,
  };
}

function emptyResult(item) {
  return { path: item.path, name: item.name, depth: item.depth, kind: item.kind, status: 'skipped' };
}

function finalize(report) {
  for (const item of [...report.categories, ...report.tags]) report.counts[item.status] += 1;
  return report;
}

// One item, sync and job paths alike: exists → reuse; parent not created → skipped; else create.
async function attemptItem(items, matches, results, i, idKey, create) {
  const item = items[i];
  const result = results[i];
  if (matches[i].status === 'exists') {
    result.status = 'exists';
    result[idKey] = matches[i].ref;
    return result;
  }
  if (item.parentIndex !== null) {
    const parent = results[item.parentIndex];
    if (parent.status !== 'created' && parent.status !== 'exists') {
      result.status = 'skipped';
      result.error = `parent "${parent.name}" was not created`;
      return result;
    }
  }
  try {
    const id = await create(item, i, results);
    if (id) { result.status = 'created'; result[idKey] = id; }
    else { result.status = 'failed'; result.error = 'created but no id returned'; }
  } catch (error) {
    result.status = 'failed';
    result.error = errorMessage(error);
  }
  return result;
}

async function runItems(items, matches, idKey, create) {
  const results = items.map(emptyResult);
  for (let i = 0; i < items.length; i += 1) await attemptItem(items, matches, results, i, idKey, create);
  return results;
}

function categoryCreator(plan, neon) {
  return async (item, i, results) => {
    if (item.depth === 1) {
      const res = await neon.createCategoryRaw(categoryFamilyPayload(item.name, plan.defaultLanguage));
      return (res && (res.categoryRef || res.id)) || null;
    }
    const parentRef = results[item.parentIndex].ref;
    const rootRef = results[familyIndexOf(plan.categories, i)].ref;
    if (!parentRef || !rootRef) throw new Error('missing parent or root ref');
    const res = await neon.createCategoryRaw(categoryPayload(item.name, parentRef, rootRef));
    return (res && (res.categoryRef || res.id)) || null;
  };
}

function tagCreator(neon) {
  return async (item, i, results) => {
    if (item.depth !== 1 && !results[item.parentIndex].id) throw new Error('missing family id');
    const res = item.depth === 1
      ? await neon.createTagFamilyRaw(item.name)
      : await neon.createTagRaw(results[item.parentIndex].id, item.name);
    return (res && res.id) || null;
  };
}

async function createTaxonomy(plan, existing, neon, envId) {
  const report = { env: envId, counts: { created: 0, exists: 0, failed: 0, skipped: 0 }, categories: [], tags: [] };
  report.categories = await runItems(plan.categories, existing.categories, 'ref', categoryCreator(plan, neon));
  report.tags = await runItems(plan.tags, existing.tags, 'id', tagCreator(neon));
  return finalize(report);
}

function demoReport(plan, envId) {
  let n = 0;
  const demo = (items, idKey) => items.map((item) => ({ ...emptyResult(item), status: 'created', [idKey]: `demo-${(n += 1)}` }));
  const report = { env: envId, counts: { created: 0, exists: 0, failed: 0, skipped: 0 }, categories: demo(plan.categories, 'ref'), tags: demo(plan.tags, 'id') };
  return finalize(report);
}

function httpStatusFor(report) {
  const attempted = report.counts.created + report.counts.failed;
  return attempted > 0 && report.counts.created === 0 ? 502 : 200;
}

module.exports = {
  readExisting, previewView, createTaxonomy, demoReport, httpStatusFor,
  emptyResult, attemptItem, categoryCreator, tagCreator, FULL_PREVIEW_MAX, PREVIEW_CAP,
};
