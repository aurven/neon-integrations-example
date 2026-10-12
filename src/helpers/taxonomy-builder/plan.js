'use strict';
/**
 * Taxonomy Builder plan: categories + tags outlines → items + validation errors. Pure, no network.
 * Spec: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §1
 */
const { parseIndented } = require('../outline/parse-indented.js');

const MAX_ITEMS = 500;
const DEFAULT_LANGUAGE = 'en-uk';

function parseKind(text, label, childKind) {
  const parsed = parseIndented(text);
  const errors = parsed.errors.map((e) => `${label} ${e}`);
  const items = [];
  for (const entry of parsed.entries) {
    const parentPath = entry.parentIndex === null ? null : items[entry.parentIndex].path;
    items.push({
      line: entry.line,
      name: entry.text,
      depth: entry.depth,
      parentIndex: entry.parentIndex,
      path: parentPath ? `${parentPath} / ${entry.text}` : entry.text,
      kind: entry.depth === 1 ? 'family' : childKind,
    });
  }
  const seen = new Set();
  for (const item of items) {
    const key = `${item.parentIndex}|${item.name.toLowerCase()}`;
    if (seen.has(key)) {
      const parentName = item.parentIndex === null ? 'top level' : items[item.parentIndex].name;
      errors.push(`${label} line ${item.line}: duplicate "${item.name}" under ${parentName}`);
    } else {
      seen.add(key);
    }
  }
  return { items, errors };
}

function familyIndexOf(items, index) {
  let i = index;
  while (items[i].parentIndex !== null) i = items[i].parentIndex;
  return i;
}

function buildTaxonomyPlan({ categories, tags, defaultLanguage } = {}) {
  const cat = parseKind(categories, 'categories', 'category');
  const tag = parseKind(tags, 'tags', 'tag');
  const errors = [...cat.errors, ...tag.errors];
  for (const item of tag.items) {
    if (item.depth > 2) errors.push(`tags line ${item.line}: tags cannot be nested under a tag`);
  }
  const total = cat.items.length + tag.items.length;
  if (total > MAX_ITEMS) errors.push(`outline has ${total} items; the limit is ${MAX_ITEMS}`);
  return {
    defaultLanguage: (typeof defaultLanguage === 'string' && defaultLanguage.trim()) || DEFAULT_LANGUAGE,
    categories: cat.items,
    tags: tag.items,
    errors,
  };
}

function categoryFamilyPayload(name, defaultLanguage) {
  return { categoryName: name, categoryMeta: { description: '', type: 'root', defaultLanguage } };
}

function categoryPayload(name, parentRef, rootRef) {
  return { categoryName: name, categoryMeta: { description: '', type: 'item' }, parentRef, rootRef };
}

module.exports = { MAX_ITEMS, DEFAULT_LANGUAGE, buildTaxonomyPlan, categoryFamilyPayload, categoryPayload, familyIndexOf };
