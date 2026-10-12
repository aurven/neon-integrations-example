# Taxonomy Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bulk-create Neon category families (category trees) and tag families (tags) from two indented outlines. Existing items are merged, so a run can be repeated safely. The feature is exposed as preview and create endpoints and driven by a React "Taxonomy Builder" widget.

**Architecture:**
- **Outline parsing:** the Site Builder's indentation algorithm is extracted to `src/helpers/outline/parse-indented.js` and reused by the Site Builder and a new pure taxonomy plan module.
- **Merge and create service:** reads the existing families, subtrees and tags, marks each outline item `new` or `exists`, then creates the missing items parent-first, continuing past failures.
- **Endpoints and widget:** admin-only endpoints and a Vite IIFE React widget mirror the Site Builder.

**Tech Stack:** Node 20, Fastify 4, `node:test`, React 18 + Vite 5 (`src/react-widgets`), Neon design tokens.

**Spec:** `docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md`. It builds on `docs/superpowers/specs/2026-10-12-site-builder-design.md`.

## Global Constraints

### Payloads

All requests go through BO, with paths prefixed `/core`.

| Item | Call | Body |
|---|---|---|
| Category family | `POST /core/categories/create` | `{ categoryName, categoryMeta: { description: '', type: 'root', defaultLanguage } }` |
| Category | `POST /core/categories/create` | `{ categoryName, categoryMeta: { description: '', type: 'item' }, parentRef, rootRef }` |
| Tag family | `POST /core/tags/families/{encodeURIComponent(name)}` | `{ familyName: name }` |
| Tag | `POST /core/tags/{familyId}/{encodeURIComponent(tagName)}` | `{ tagName, familyName: familyId }` |

- **New ids:** a category's comes from `categoryRef`, falling back to `id`. A tag family's or tag's comes from `id`.
- **`defaultLanguage`** defaults to `en-uk`.

### Outlines

- The indentation rules are identical to the Site Builder's.
- **Names:** trimmed text; no slugs.
- **Duplicates:** siblings whose names match ignoring case are an error.
- **Tags outline:** depth 1 is the family, depth 2 is a tag, and depth 3 or more is an error.
- **Size limit:** at most 500 items in total across both outlines.

### Merge

- Match by name, ignoring case, among items whose `deleted !== true`, at the same level under the same matched parent.
- A list may be an array, or an object with a `result` or `items` array.
- A category's ref is `categoryRef`, falling back to `id`. Its name is `name`, falling back to the last ` / `-separated segment of `categoryInfo.names`. Its children are `children`, falling back to `items`.
- Any read failure or unexpected shape is an error, and nothing is written.

### Statuses and responses

- **Item statuses:** `exists`, `created`, `failed`, `skipped`. A skipped item's error is `parent "<parent name>" was not created`.
- **Admin only:** 401 when unauthenticated; 403 `taxonomy creation requires an admin key` for a non-admin role.
- **Create responses:**
  - 400 `{ errors }` for parse or read errors.
  - 502 when at least one create was attempted and none succeeded.
  - 200 otherwise, including when everything already exists.

### Exact error messages

- `line N: first line cannot be indented`
- `line N: indentation does not match any parent level`
- `<categories|tags> line N: duplicate "<name>" under <parent name or "top level">`
- `tags line N: tags cannot be nested under a tag`
- `outline has N items; the limit is 500`
- `could not read existing category families in env <id>: <message>`
- `could not read existing categories of "<name>" in env <id>: <message>`
- `could not read existing tag families in env <id>: <message>`
- `could not read existing tags of "<name>" in env <id>: <message>`
- `created but no id returned`
- `body must be { categories: string, tags: string, defaultLanguage?: string }`

Parse errors (the first two lines above) are prefixed `categories ` or `tags `.

### Other

- **Site Builder:** its behaviour and messages are unchanged by the parser extraction.
- **Tests:** use `node:test`, with no network.
- **Branch and commits:** work in branch `develop` (worktree `.claude/worktrees/develop`), with one commit per task. Do not push. The baseline `npm test` result is 275/275.

## Review Focus

1. **Category names that differ only in case or spacing** from an existing Neon category (`gruppobello` vs `GruppoBello`, `" Livello 1 "`) must reuse the existing one, not create a duplicate. Test in Task 3.
2. **A soft-deleted existing family with the same name** (`deleted: true`) must be ignored, so a new family is created. Test in Task 3.
3. **New children added under an existing family** must carry that family's existing ref as both `parentRef` (depth 2) and `rootRef` (every depth). Test in Task 3.
4. **Tag names containing `/`, `&` or spaces** must be URL-encoded in the path, while the body keeps the raw name. Test in Task 1.
5. **Re-running the same outline after a full success** must make zero create calls and return 200 with everything `exists`. Test in Task 3.

---

## File Structure

**Create:**
- `src/helpers/outline/parse-indented.js`: the shared indentation parser
- `src/helpers/taxonomy-builder/plan.js`: parse both outlines and build payloads (pure)
- `src/helpers/taxonomy-builder/create-taxonomy.js`: `readExisting`, `previewView`, `createTaxonomy`, `demoReport`
- `src/requestHandlers/taxonomy-builder.js`: the two endpoint handlers
- `src/react-widgets/src/taxonomy-builder/{main.jsx,api.js,TaxonomyBuilderWidget.jsx,taxonomy-builder.css}`
- `src/react-widgets/vite.taxonomy-builder.config.js`
- `src/widgets/taxonomy-builder.hbs`
- `public/js/react/taxonomy-builder.{js,css}`: build output, committed
- Tests:
  - `test/neon-env/outline-parse-indented.test.js`
  - `test/neon-env/taxonomy-plan.test.js`
  - `test/neon-env/taxonomy-create.test.js`
  - `test/neon-env/taxonomy-routes.test.js`

**Modify:**
- `src/helpers/site-builder/plan.js`: use the shared parser
- `src/helpers/site-builder/create-site.js`: export `errorMessage`
- `src/helpers/neon-bo-api-v3.js`: three raw methods
- `test/neon-env/neon-core-taxonomy.test.js`
- `server.js`
- `src/requestHandlers/widgets.js`
- `src/react-widgets/package.json`
- `README.md`

---

### Task 1: Shared indentation parser + raw taxonomy client methods

**Files:**
- Create: `src/helpers/outline/parse-indented.js`, `test/neon-env/outline-parse-indented.test.js`
- Modify: `src/helpers/site-builder/plan.js` (`parseOutline` delegates to the shared parser), `src/helpers/neon-bo-api-v3.js`, `test/neon-env/neon-core-taxonomy.test.js`

**Interfaces:**
- **Produces:**
  - `parseIndented(text, { firstLineNoun = 'line', accept } = {}) → { entries: [{ line, text, depth, parentIndex }], errors: string[] }`.
    - `accept(text)` returns an error string to reject the line, or a falsy value to keep it.
    - A rejected line produces `line N: <error>`. It is not added to the entries, and the indentation stack is left unchanged.
    - `parentIndex` indexes into `entries`.
  - Three `NeonClient` methods, each also exported as a flat function:
    - `createCategoryRaw(body) → Promise<object>`
    - `createTagFamilyRaw(name) → Promise<object>`
    - `createTagRaw(familyId, tagName) → Promise<object>`

- [ ] **Step 1: Write the failing tests**

`test/neon-env/outline-parse-indented.test.js`:
```js
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
```

Append to `test/neon-env/neon-core-taxonomy.test.js`:
```js
test('createCategoryRaw posts the body unchanged', async () => {
  const body = { categoryName: 'Livello 1', categoryMeta: { description: '', type: 'item' }, parentRef: '21cfe1a0a85a-8b6a226ac675', rootRef: '21cfe1a0a85a-8b6a226ac675' };
  assert.deepEqual(await callOf((n) => n.createCategoryRaw(body)), { method: 'post', url: '/core/categories/create', params: undefined, data: body });
});

test('createTagFamilyRaw encodes the name in the path and sends familyName', async () => {
  const c = await callOf((n) => n.createTagFamilyRaw('Nuova Famiglia'));
  assert.deepEqual(c, { method: 'post', url: '/core/tags/families/Nuova%20Famiglia', params: undefined, data: { familyName: 'Nuova Famiglia' } });
});

test('createTagRaw encodes the tag, sends tagName and familyName = family id', async () => {
  const c = await callOf((n) => n.createTagRaw('21cfe337d5c5-f642bdca2d4e', 'Nuovo Tag/A&B'));
  assert.deepEqual(c, {
    method: 'post', url: '/core/tags/21cfe337d5c5-f642bdca2d4e/Nuovo%20Tag%2FA%26B', params: undefined,
    data: { tagName: 'Nuovo Tag/A&B', familyName: '21cfe337d5c5-f642bdca2d4e' },
  });
});

test('raw taxonomy methods validate arguments and are flat-exported', async () => {
  const { client, calls } = stubbedClient();
  await assert.rejects(() => client.createCategoryRaw(), /body is required/);
  await assert.rejects(() => client.createTagFamilyRaw(''), /name is required/);
  await assert.rejects(() => client.createTagRaw('fam'), /tagName is required/);
  assert.equal(calls.length, 0);
  for (const name of ['createCategoryRaw', 'createTagFamilyRaw', 'createTagRaw']) assert.equal(typeof neonApi[name], 'function');
});
```
That test file already defines `stubbedClient()` and `callOf(invoke)`, which returns `{ method, url, params, data }`. Reuse them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/neon-env/outline-parse-indented.test.js test/neon-env/neon-core-taxonomy.test.js`
Expected: FAIL. The module is not found, and `createCategoryRaw` is not a function.

- [ ] **Step 3: Implement `src/helpers/outline/parse-indented.js`**

```js
'use strict';
/**
 * Shared indented-outline parser (Site Builder, Taxonomy Builder).
 * Tab = 2 spaces; wider than the previous line = child (depth + 1); equal = sibling;
 * narrower must match an open level exactly. Pure, no network.
 */
const TAB_WIDTH = 2;

function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH;
    else break;
  }
  return width;
}

function parseIndented(text, { firstLineNoun = 'line', accept } = {}) {
  const entries = [];
  const errors = [];
  let stack = []; // open levels: { width, depth, index }

  String(text ?? '').replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const width = indentWidth(raw);
    const value = raw.trim();

    let parent = null;
    let depth;
    let nextStack;
    if (stack.length === 0) {
      if (width !== 0) { errors.push(`line ${line}: first ${firstLineNoun} cannot be indented`); return; }
      depth = 1;
      nextStack = [];
    } else if (width > stack[stack.length - 1].width) {
      parent = stack[stack.length - 1];
      depth = parent.depth + 1;
      nextStack = [...stack];
    } else {
      const s = [...stack];
      while (s.length && s[s.length - 1].width > width) s.pop();
      const level = s[s.length - 1];
      if (!level || level.width !== width) { errors.push(`line ${line}: indentation does not match any parent level`); return; }
      s.pop();
      parent = s[s.length - 1] || null;
      depth = level.depth;
      nextStack = s;
    }

    const rejection = accept ? accept(value) : null;
    if (rejection) { errors.push(`line ${line}: ${rejection}`); return; }

    const index = entries.length;
    entries.push({ line, text: value, depth, parentIndex: parent ? parent.index : null });
    nextStack.push({ width, depth, index });
    stack = nextStack;
  });

  return { entries, errors };
}

module.exports = { parseIndented };
```

- [ ] **Step 4: Make the Site Builder use the shared parser**

In `src/helpers/site-builder/plan.js`:
- Remove `TAB_WIDTH` and `indentWidth`.
- Add `const { parseIndented } = require('../outline/parse-indented.js');`.
- Replace the body of `parseOutline` up to (but not including) the duplicate check with:

```js
function parseOutline(outline) {
  const parsed = parseIndented(outline, {
    firstLineNoun: 'section',
    accept: (title) => (slugify(title) ? null : `"${title}" has no usable characters for a name`),
  });
  const errors = [...parsed.errors];
  const sections = [];
  for (const entry of parsed.entries) {
    const name = slugify(entry.text);
    const parentPath = entry.parentIndex === null ? '/' : sections[entry.parentIndex].path;
    sections.push({ line: entry.line, title: entry.text, name, depth: entry.depth, parentIndex: entry.parentIndex, path: `${parentPath}${name}/` });
  }
```
Keep the existing duplicate-check loop and `return { sections, errors };` unchanged. `entries` and `sections` share indices, so `parentIndex` stays valid.

Run: `node --test test/neon-env/site-builder-plan.test.js`. Expected: all existing Site Builder plan tests PASS with no changes to the tests.

- [ ] **Step 5: Add the raw client methods**

In `src/helpers/neon-bo-api-v3.js`, in the `NeonClient` class directly after `getTagsInFamily`:
```js
    // ── Raw-body taxonomy creation, as sent by the Neon UI (Taxonomy Builder) ──

    async createCategoryRaw(body) {
        requireArg(body, 'body');
        return await this.makeRequest({
            method: 'post',
            url: '/core/categories/create',
            data: body
        }, `Category ${body.categoryName} created`, true);
    }

    async createTagFamilyRaw(name) {
        requireArg(name, 'name');
        return await this.makeRequest({
            method: 'post',
            url: `/core/tags/families/${segment(name)}`,
            data: { familyName: name }
        }, `Tag family ${name} created`, true);
    }

    async createTagRaw(familyId, tagName) {
        requireArg(familyId, 'familyId');
        requireArg(tagName, 'tagName');
        return await this.makeRequest({
            method: 'post',
            url: `/core/tags/${segment(familyId)}/${segment(tagName)}`,
            data: { tagName, familyName: familyId }
        }, `Tag ${tagName} created in family ${familyId}`, true);
    }
```
Add the flat exports next to `getTagsInFamily:`:
```js
    createCategoryRaw: (body) => currentClient().createCategoryRaw(body),
    createTagFamilyRaw: (name) => currentClient().createTagFamilyRaw(name),
    createTagRaw: (familyId, tagName) => currentClient().createTagRaw(familyId, tagName),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/neon-env/outline-parse-indented.test.js test/neon-env/neon-core-taxonomy.test.js test/neon-env/site-builder-plan.test.js && npm test`
Expected: PASS. The Site Builder tests are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/outline/parse-indented.js test/neon-env/outline-parse-indented.test.js src/helpers/site-builder/plan.js src/helpers/neon-bo-api-v3.js test/neon-env/neon-core-taxonomy.test.js
git commit -m "refactor(outline): shared indentation parser; feat: raw taxonomy create client methods"
```

---

### Task 2: Taxonomy plan (`src/helpers/taxonomy-builder/plan.js`)

**Files:**
- Create: `src/helpers/taxonomy-builder/plan.js`, `test/neon-env/taxonomy-plan.test.js`

**Interfaces:**
- **Consumes:** `parseIndented` (Task 1).
- **Produces:**
  - `buildTaxonomyPlan({ categories, tags, defaultLanguage }) → { defaultLanguage, categories: Item[], tags: Item[], errors }`
    - `Item = { line, name, depth, parentIndex, path, kind }`
    - for categories, `kind` is `'family'` at depth 1, otherwise `'category'`
    - for tags, `kind` is `'family'` or `'tag'`
    - `path` is the names joined by ` / `
  - `categoryFamilyPayload(name, defaultLanguage)`
  - `categoryPayload(name, parentRef, rootRef)`
  - `familyIndexOf(items, index)`: the index of the depth-1 ancestor
  - `MAX_ITEMS = 500`, `DEFAULT_LANGUAGE = 'en-uk'`

- [ ] **Step 1: Write the failing tests `test/neon-env/taxonomy-plan.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaxonomyPlan, categoryFamilyPayload, categoryPayload, familyIndexOf, MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/neon-env/taxonomy-plan.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement `src/helpers/taxonomy-builder/plan.js`**

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/neon-env/taxonomy-plan.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/taxonomy-builder/plan.js test/neon-env/taxonomy-plan.test.js
git commit -m "feat(taxonomy-builder): categories and tags outline plan with payload builders"
```

---

### Task 3: Merge and create service (`src/helpers/taxonomy-builder/create-taxonomy.js`)

**Files:**
- Create: `src/helpers/taxonomy-builder/create-taxonomy.js`, `test/neon-env/taxonomy-create.test.js`
- Modify: `src/helpers/site-builder/create-site.js` (export `errorMessage`)

**Interfaces:**
- **Consumes:**
  - `buildTaxonomyPlan`, `categoryFamilyPayload`, `categoryPayload` and `familyIndexOf` (Task 2)
  - `errorMessage(error)` from `src/helpers/site-builder/create-site.js`
  - a client with `getCategoryFamilies()`, `getCategory({ categoryRef, depth })`, `getTagFamilies()`, `getTagsInFamily(familyId)`, `createCategoryRaw(body)`, `createTagFamilyRaw(name)` and `createTagRaw(familyId, tagName)`
- **Produces:**
  - `readExisting(plan, neon, envId) → Promise<{ existing: { categories: Match[], tags: Match[] }, errors: string[] }>`
    - `Match = { status: 'new' | 'exists', ref?: string, node?: object }`
    - for tags, the id is stored in `ref`
  - `previewView(plan, existing, envId, errors) → { env, categories, tags, toCreate, errors }`
  - `createTaxonomy(plan, existing, neon, envId) → Promise<Report>`
  - `demoReport(plan, envId) → Report`
  - `Report = { env, counts: { created, exists, failed, skipped }, categories: [{ path, name, depth, kind, status, ref?, error? }], tags: [{ path, name, depth, kind, status, id?, error? }] }`
  - `httpStatusFor(report) → 200 | 502`

- [ ] **Step 1: Export `errorMessage` from the Site Builder**

In `src/helpers/site-builder/create-site.js`, change the export line to `module.exports = { checkPlan, createSiteFromPlan, demoReport, errorMessage };`.

- [ ] **Step 2: Write the failing tests `test/neon-env/taxonomy-create.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaxonomyPlan } = require('../../src/helpers/taxonomy-builder/plan.js');
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/neon-env/taxonomy-create.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 4: Implement `src/helpers/taxonomy-builder/create-taxonomy.js`**

```js
'use strict';
/**
 * Taxonomy Builder: read existing families/categories/tags, merge by name, create what is missing
 * parent-first, continuing past failures. Spec: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §2-§3
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
  if (node && typeof node.name === 'string') return node.name;
  const names = node && node.categoryInfo && node.categoryInfo.names;
  return typeof names === 'string' ? names.split('/').pop().trim() : '';
}

function childrenOf(node) { return asList(node && node.children) || asList(node && node.items) || []; }

function findLive(list, name) {
  const wanted = name.trim().toLowerCase();
  return list.find((n) => n && n.deleted !== true && nameOf(n).trim().toLowerCase() === wanted) || null;
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
    catch (error) { errors.push(`could not read existing category families in env ${envId}: ${error.message}`); }
    if (families) {
      for (let i = 0; i < plan.categories.length; i += 1) {
        const item = plan.categories[i];
        if (item.depth !== 1) continue;
        const match = findLive(families, item.name);
        if (!match) continue;
        categories[i] = { status: 'exists', ref: refOf(match), node: match };
        const depth = maxDepthUnder(plan.categories, i) - 1;
        if (depth < 1) continue;
        try {
          const tree = await neon.getCategory({ categoryRef: refOf(match), depth });
          if (!tree || typeof tree !== 'object') throw unexpected();
          categories[i].node = tree;
        } catch (error) {
          errors.push(`could not read existing categories of "${item.name}" in env ${envId}: ${error.message}`);
        }
      }
      for (let i = 0; i < plan.categories.length; i += 1) {
        const item = plan.categories[i];
        if (item.depth === 1) continue;
        const parent = categories[item.parentIndex];
        if (parent.status !== 'exists' || !parent.node) continue;
        const match = findLive(childrenOf(parent.node), item.name);
        if (match) categories[i] = { status: 'exists', ref: refOf(match), node: match };
      }
    }
  }

  if (plan.tags.length) {
    let families = null;
    try { families = await readList(() => neon.getTagFamilies()); }
    catch (error) { errors.push(`could not read existing tag families in env ${envId}: ${error.message}`); }
    if (families) {
      for (let i = 0; i < plan.tags.length; i += 1) {
        const item = plan.tags[i];
        if (item.depth !== 1) continue;
        const match = findLive(families, item.name);
        if (!match) continue;
        tags[i] = { status: 'exists', ref: match.id };
        if (!plan.tags.some((t) => t.parentIndex === i)) continue;
        let existingTags;
        try { existingTags = await readList(() => neon.getTagsInFamily(match.id)); }
        catch (error) { errors.push(`could not read existing tags of "${item.name}" in env ${envId}: ${error.message}`); continue; }
        plan.tags.forEach((t, j) => {
          if (t.parentIndex !== i) return;
          const found = findLive(existingTags, t.name);
          if (found) tags[j] = { status: 'exists', ref: found.id };
        });
      }
    }
  }

  return { existing: { categories, tags }, errors };
}

function previewView(plan, existing, envId, errors) {
  const view = (items, matches) => items.map((item, i) => ({ path: item.path, name: item.name, depth: item.depth, kind: item.kind, status: matches[i].status }));
  const categories = view(plan.categories, existing.categories);
  const tags = view(plan.tags, existing.tags);
  const toCreate = [...categories, ...tags].filter((i) => i.status === 'new').length;
  return { env: envId, categories, tags, toCreate, errors };
}

function emptyResult(item) {
  return { path: item.path, name: item.name, depth: item.depth, kind: item.kind, status: 'skipped' };
}

function finalize(report) {
  for (const item of [...report.categories, ...report.tags]) report.counts[item.status] += 1;
  return report;
}

async function runItems(items, matches, idKey, create) {
  const results = items.map(emptyResult);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const result = results[i];
    if (matches[i].status === 'exists') {
      result.status = 'exists';
      result[idKey] = matches[i].ref;
      continue;
    }
    if (item.parentIndex !== null) {
      const parent = results[item.parentIndex];
      if (parent.status !== 'created' && parent.status !== 'exists') {
        result.error = `parent "${parent.name}" was not created`;
        continue;
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
  }
  return results;
}

async function createTaxonomy(plan, existing, neon, envId) {
  const report = { env: envId, counts: { created: 0, exists: 0, failed: 0, skipped: 0 }, categories: [], tags: [] };

  report.categories = await runItems(plan.categories, existing.categories, 'ref', async (item, i, results) => {
    if (item.depth === 1) {
      const res = await neon.createCategoryRaw(categoryFamilyPayload(item.name, plan.defaultLanguage));
      return (res && (res.categoryRef || res.id)) || null;
    }
    const parentRef = results[item.parentIndex].ref;
    const rootRef = results[familyIndexOf(plan.categories, i)].ref;
    const res = await neon.createCategoryRaw(categoryPayload(item.name, parentRef, rootRef));
    return (res && (res.categoryRef || res.id)) || null;
  });

  report.tags = await runItems(plan.tags, existing.tags, 'id', async (item, i, results) => {
    const res = item.depth === 1
      ? await neon.createTagFamilyRaw(item.name)
      : await neon.createTagRaw(results[item.parentIndex].id, item.name);
    return (res && res.id) || null;
  });

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

module.exports = { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/neon-env/taxonomy-create.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/helpers/taxonomy-builder/create-taxonomy.js test/neon-env/taxonomy-create.test.js src/helpers/site-builder/create-site.js
git commit -m "feat(taxonomy-builder): merge with existing taxonomy and create missing items parent-first"
```

---

### Task 4: HTTP endpoints (`src/requestHandlers/taxonomy-builder.js`)

**Files:**
- Create: `src/requestHandlers/taxonomy-builder.js`, `test/neon-env/taxonomy-routes.test.js`
- Modify: `server.js` (the routes, placed after the Site Builder API routes, and two services dashboard entries placed after "Site Builder Create")

**Interfaces:**
- **Consumes:** `authenticate`, `buildTaxonomyPlan`, and `readExisting`, `previewView`, `createTaxonomy`, `demoReport`, `httpStatusFor`.
- **Produces:**
  - `previewTaxonomyHandler`, `createTaxonomyHandler`
  - `__setClientProviderForTest(fn | null)`
  - routes `POST /api/neon/taxonomy-builder/preview` and `POST /api/neon/taxonomy-builder/create`

- [ ] **Step 1: Write the failing tests `test/neon-env/taxonomy-routes.test.js`**

```js
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const handlers = require('../../src/requestHandlers/taxonomy-builder.js');
const { envJson, registryJson } = require('./fixtures.js');

const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKeyLimited: 'lim-a' })]), envVars: {} });

let neon;
function fakeNeon({ catFamilies = [] } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async getCategoryFamilies() { calls.push('getCategoryFamilies'); return catFamilies; },
    async getCategory() { calls.push('getCategory'); return { children: [] }; },
    async getTagFamilies() { calls.push('getTagFamilies'); return []; },
    async getTagsInFamily() { calls.push('getTagsInFamily'); return []; },
    async createCategoryRaw() { calls.push('createCategoryRaw'); return { categoryRef: `c-${(n += 1)}` }; },
    async createTagFamilyRaw() { calls.push('createTagFamilyRaw'); return { id: `t-${(n += 1)}` }; },
    async createTagRaw() { calls.push('createTagRaw'); return { id: `t-${(n += 1)}` }; },
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/api/neon/taxonomy-builder/preview', handlers.previewTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/create', handlers.createTaxonomyHandler);
  return app;
}

const BODY = { categories: 'GruppoBello\n  Livello 1', tags: 'Nuova Famiglia\n  Nuovo Tag' };
const post = (app, url, opts = {}) => app.inject({ method: 'POST', url, headers: { apikey: 'key-a', ...(opts.headers || {}) }, payload: opts.payload ?? BODY });

beforeEach(() => {
  neon = fakeNeon();
  handlers.__setClientProviderForTest(() => neon);
});

test('401 without key, 403 for limited key, no Neon calls', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/neon/taxonomy-builder/preview', payload: BODY })).statusCode, 401);
  const limited = await post(app, '/api/neon/taxonomy-builder/create', { headers: { apikey: 'lim-a' } });
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'taxonomy creation requires an admin key' });
  assert.equal(neon.calls.length, 0);
});

test('400 on bad body (wrong types or both outlines empty)', async () => {
  const app = await buildApp();
  for (const payload of [{ categories: 'A' }, { categories: 1, tags: '' }, { categories: '  ', tags: '\n' }, { categories: 'A', tags: '', defaultLanguage: '' }]) {
    const res = await post(app, '/api/neon/taxonomy-builder/preview', { payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(res.json(), { error: 'body must be { categories: string, tags: string, defaultLanguage?: string }' });
  }
});

test('preview reads only and marks statuses', async () => {
  neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'GruppoBello' }] });
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/preview');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.env, 'a');
  assert.deepEqual(body.categories.map((i) => i.status), ['exists', 'new']);
  assert.equal(body.toCreate, 3);
  assert.deepEqual(body.errors, []);
  assert.ok(!neon.calls.some((c) => c.startsWith('create')));
});

test('create with parse errors -> 400 and no Neon calls', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create', { payload: { categories: '  A', tags: '' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { errors: ['categories line 1: first line cannot be indented'] });
  assert.equal(neon.calls.length, 0);
});

test('create runs and returns the report; re-run with everything existing -> 200 and no writes', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/create');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().counts, { created: 4, exists: 0, failed: 0, skipped: 0 });

  neon = {
    ...fakeNeon(),
    async getCategoryFamilies() { return [{ categoryRef: 'r', name: 'GruppoBello' }]; },
    async getCategory() { return { categoryRef: 'r', children: [{ categoryRef: 'c', name: 'Livello 1' }] }; },
    async getTagFamilies() { return [{ id: 'tf', name: 'Nuova Famiglia' }]; },
    async getTagsInFamily() { return [{ id: 't', name: 'Nuovo Tag' }]; },
  };
  const again = await post(app, '/api/neon/taxonomy-builder/create');
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json().counts, { created: 0, exists: 4, failed: 0, skipped: 0 });
});

test('demo mode never touches Neon', async () => {
  const app = await buildApp();
  const preview = await post(app, '/api/neon/taxonomy-builder/preview?demo=true');
  assert.equal(preview.json().toCreate, 4);
  const create = await post(app, '/api/neon/taxonomy-builder/create?demo=true');
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().counts.created, 4);
  assert.equal(neon.calls.length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/neon-env/taxonomy-routes.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement `src/requestHandlers/taxonomy-builder.js`**

```js
'use strict';
/**
 * Taxonomy Builder endpoints: preview (reads only) and create.
 * Spec: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildTaxonomyPlan } = require('../helpers/taxonomy-builder/plan.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor } = require('../helpers/taxonomy-builder/create-taxonomy.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const BAD_BODY = 'body must be { categories: string, tags: string, defaultLanguage?: string }';

let clientProvider = () => neonApi.currentClient();

function readRequest(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return null; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'taxonomy creation requires an admin key' }); return null; }
  const { categories, tags, defaultLanguage } = request.body || {};
  const validLanguage = defaultLanguage === undefined || (typeof defaultLanguage === 'string' && defaultLanguage.trim().length > 0);
  if (typeof categories !== 'string' || typeof tags !== 'string' || !validLanguage || (!categories.trim() && !tags.trim())) {
    reply.status(400).send({ error: BAD_BODY });
    return null;
  }
  if (!request.neonEnv) {
    reply.status(400).send({ errors: ['No Neon environment selected for this request'] });
    return null;
  }
  return { categories, tags, defaultLanguage, env: request.neonEnv, demo: request.query?.demo === 'true' };
}

function newState(plan) {
  return { categories: plan.categories.map(() => ({ status: 'new' })), tags: plan.tags.map(() => ({ status: 'new' })) };
}

async function planWithReads(req) {
  const plan = buildTaxonomyPlan(req);
  if (plan.errors.length || req.demo) return { plan, existing: newState(plan), errors: [...plan.errors] };
  const { existing, errors } = await readExisting(plan, clientProvider(), req.env.id);
  return { plan, existing, errors };
}

async function previewTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req);
  return reply.status(200).send(previewView(plan, existing, req.env.id, errors));
}

async function createTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req);
  if (errors.length) return reply.status(400).send({ errors });
  if (req.demo) return reply.status(200).send(demoReport(plan, req.env.id));
  const report = await createTaxonomy(plan, existing, clientProvider(), req.env.id);
  console.log(`[taxonomy-builder] env=${req.env.id} counts=${JSON.stringify(report.counts)}`);
  return reply.status(httpStatusFor(report)).send(report);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || (() => neonApi.currentClient());
}

module.exports = { previewTaxonomyHandler, createTaxonomyHandler, __setClientProviderForTest };
```

In `server.js`:
- Directly after the three Site Builder API route lines (the `siteBuilderHandlers` require and its two `fastify.post` lines), add:
  ```js
  // Taxonomy Builder (bulk category and tag families)
  const taxonomyBuilderHandlers = require("./src/requestHandlers/taxonomy-builder.js");
  fastify.post("/api/neon/taxonomy-builder/preview", taxonomyBuilderHandlers.previewTaxonomyHandler);
  fastify.post("/api/neon/taxonomy-builder/create", taxonomyBuilderHandlers.createTaxonomyHandler);
  ```
- In the services dashboard, after the "Site Builder Create" entry, add:
  ```js
      { name: "Taxonomy Builder Preview", endpoint: "POST /api/neon/taxonomy-builder/preview", description: "Plan category/tag families from { categories, tags } outlines, merged with what exists, without writing (admin key; ?demo=true supported)" },
      { name: "Taxonomy Builder Create", endpoint: "POST /api/neon/taxonomy-builder/create", description: "Create missing category families/categories and tag families/tags from outlines, reusing existing ones (admin key; ?demo=true supported)" },
  ```
  Fix the commas so the array stays valid, then run `node --check server.js`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/neon-env/taxonomy-routes.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/requestHandlers/taxonomy-builder.js test/neon-env/taxonomy-routes.test.js server.js
git commit -m "feat(taxonomy-builder): preview and create endpoints (admin only, demo mode)"
```

---

### Task 5: Taxonomy Builder React widget

**Follow the existing Site Builder widget as the template.** It lives in `src/react-widgets/src/site-builder/`, `src/react-widgets/vite.site-builder.config.js`, `src/widgets/site-builder.hbs`, `siteBuilderWidgetHandler` in `src/requestHandlers/widgets.js`, and its route and dashboard entry in `server.js`. Also read `~/.claude/skills/neon-react-widget/SKILL.md`.

**Files:**
- Create:
  - `src/react-widgets/vite.taxonomy-builder.config.js`
  - `src/react-widgets/src/taxonomy-builder/{main.jsx,api.js,TaxonomyBuilderWidget.jsx,taxonomy-builder.css}`
  - `src/widgets/taxonomy-builder.hbs`
  - `public/js/react/taxonomy-builder.{js,css}` (build output, committed)
- Modify: `src/react-widgets/package.json`, `src/requestHandlers/widgets.js`, `server.js`, `README.md`

**Interfaces:**
- **Consumes:** `POST /api/neon/taxonomy-builder/preview|create` with body `{ categories, tags, defaultLanguage }`, using the response shapes from Task 4.

- [ ] **Step 1: Build config, script, `main.jsx`, `api.js`**

- `vite.taxonomy-builder.config.js`: copy `vite.site-builder.config.js` with `WIDGET = 'taxonomy-builder'` and `name: 'TaxonomyBuilderWidget'`.
- `package.json`: add `"build:taxonomy-builder": "vite build --config vite.taxonomy-builder.config.js"`.
- `main.jsx`: same as the Site Builder's, mounting `TaxonomyBuilderWidget` and importing `./taxonomy-builder.css`.
- `api.js`: same as the Site Builder's, but posting to `/api/neon/taxonomy-builder/${path}`:
  ```js
  export const previewTaxonomy = (body) => post('preview', body);
  export const createTaxonomy = (body) => post('create', body);
  ```
  Here `post(path, body)` sends `body` as-is.

- [ ] **Step 2: `TaxonomyBuilderWidget.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { previewTaxonomy, createTaxonomy } from './api.js';

const CATEGORY_PLACEHOLDER = 'GruppoBello\n  Livello 1\n    Livello 2';
const TAG_PLACEHOLDER = 'Nuova Famiglia\n  Nuovo Tag';
const LABEL = { new: 'New', exists: 'Exists', created: 'Created', failed: 'Failed', skipped: 'Skipped' };

function insertTab(e, value, setValue) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const { selectionStart: start, selectionEnd: end } = el;
  setValue(`${value.slice(0, start)}  ${value.slice(end)}`);
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
}

function Tree({ items, statusKey = 'status' }) {
  return (
    <ul className="tbw-tree">
      {items.map((i) => (
        <li key={`${i.kind}:${i.path}`} style={{ paddingLeft: `${(i.depth - 1) * 20}px` }}>
          <span className={`tbw-badge tbw-${i[statusKey]}`}>{LABEL[i[statusKey]] || i[statusKey]}</span>{' '}
          <span className={i.kind === 'family' ? 'tbw-family' : ''}>{i.name}</span>
          {(i.ref || i.id) && <code className="tbw-muted"> {i.ref || i.id}</code>}
          {i.error && <span className="tbw-error"> {i.error}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function TaxonomyBuilderWidget() {
  const envLabel = window.CONFIG?.neonEnv?.label || window.CONFIG?.neonEnv?.id || 'current environment';
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('en-uk');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!categories.trim() && !tags.trim()) {
      requestSeq.current += 1;
      setLoading(false); setPreview(null); setPreviewError(null);
      return undefined;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { status, data } = await previewTaxonomy({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
        if (seq !== requestSeq.current) return;
        if (status === 200 && data && Array.isArray(data.categories)) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data?.error || (data?.errors || []).join('; ') || `Preview failed (HTTP ${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [categories, tags, defaultLanguage, refreshKey]);

  const errors = preview?.errors || [];
  const toCreate = preview?.toCreate || 0;
  const canCreate = !!preview && errors.length === 0 && toCreate > 0 && !loading && !creating;

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create ${toCreate} items in ${envLabel}?`)) return;
    setCreating(true);
    setReport(null);
    try {
      const { status, data } = await createTaxonomy({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
      if (data && data.counts && Array.isArray(data.categories) && Array.isArray(data.tags)) {
        setReport(data);
        if (data.counts.created > 0) setRefreshKey((k) => k + 1);
      } else {
        setReport({ errors: data?.errors || [data?.error || data?.message || `Create failed (HTTP ${status}). Check Neon before retrying: some items may have been created.`] });
      }
    } catch (e) {
      setReport({ errors: [e.message] });
    } finally {
      setCreating(false);
    }
  }

  const clearReport = (setter) => (e) => { setter(e.target.value); setReport(null); };

  return (
    <div className="tbw">
      <header className="tbw-header">
        <h1>Taxonomy Builder</h1>
        <span className="tbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>
      <div className="tbw-body">
        <section className="tbw-form">
          <label className="tbw-label" htmlFor="tbw-categories">Categories (top level = family, indent to nest)</label>
          <textarea id="tbw-categories" className="tbw-outline" value={categories} placeholder={CATEGORY_PLACEHOLDER} spellCheck={false}
            onChange={clearReport(setCategories)} onKeyDown={(e) => insertTab(e, categories, setCategories)} />
          <label className="tbw-label" htmlFor="tbw-tags">Tags (top level = family, indented once = tag)</label>
          <textarea id="tbw-tags" className="tbw-outline" value={tags} placeholder={TAG_PLACEHOLDER} spellCheck={false}
            onChange={clearReport(setTags)} onKeyDown={(e) => insertTab(e, tags, setTags)} />
          <label className="tbw-label" htmlFor="tbw-lang">Default language (new category families)</label>
          <input id="tbw-lang" className="tbw-input" value={defaultLanguage} onChange={clearReport(setDefaultLanguage)} />
          <button type="button" className="tbw-button" disabled={!canCreate} onClick={onCreate}>
            {creating ? 'Creating…' : `Create ${toCreate} item${toCreate === 1 ? '' : 's'}`}
          </button>
        </section>
        <section className="tbw-preview" aria-live="polite">
          <h2>Preview {loading && <span className="tbw-muted">updating…</span>}</h2>
          {previewError && <p className="tbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="tbw-muted">Type categories or tags to see the preview.</p>}
          {preview && (
            <>
              {errors.length > 0 && <ul className="tbw-errors">{errors.map((err) => <li key={err}>{err}</li>)}</ul>}
              <p className="tbw-muted">{toCreate} to create</p>
              {preview.categories.length > 0 && (<><h3>Categories</h3><Tree items={preview.categories} /></>)}
              {preview.tags.length > 0 && (<><h3>Tags</h3><Tree items={preview.tags} /></>)}
            </>
          )}
          {report && (
            <div className="tbw-report">
              <h2>Result</h2>
              {report.errors ? (
                <ul className="tbw-errors">{report.errors.map((err) => <li key={err}>{err}</li>)}</ul>
              ) : (
                <>
                  <p className="tbw-muted">{report.counts.created} created · {report.counts.exists} existing · {report.counts.failed} failed · {report.counts.skipped} skipped</p>
                  {report.categories.length > 0 && (<><h3>Categories</h3><Tree items={report.categories} /></>)}
                  {report.tags.length > 0 && (<><h3>Tags</h3><Tree items={report.tags} /></>)}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS, HBS shell, handler, route, dashboard, README**

- `taxonomy-builder.css`: mirror `site-builder.css`, using the `tbw-` prefix in place of `sbw-`. Add:
  - `tbw-new` (blue, using the theme token)
  - `tbw-exists` (grey)
  - `tbw-family` (font-weight 600)
  - `h3` (small section heading)
- `src/widgets/taxonomy-builder.hbs`: a copy of `site-builder.hbs` with `taxonomy-builder` asset names and the title.
- `src/requestHandlers/widgets.js`: add and export `taxonomyBuilderWidgetHandler`. It is identical to `siteBuilderWidgetHandler` except for the view (`/src/widgets/taxonomy-builder.hbs`) and the seo title/description (`"Taxonomy Builder — create Neon category and tag families"`).
- `server.js`:
  - Add `fastify.get("/widgets/taxonomy-builder", widgetHandlers.taxonomyBuilderWidgetHandler);` next to the site-builder route.
  - Add a widgets dashboard entry: `{ name: "Taxonomy Builder", endpoint: "GET /widgets/taxonomy-builder", demoUrl: "/widgets/taxonomy-builder?demo=true", description: "Bulk-create category families/categories and tag families/tags from outlines, merging with what exists (admin key; demo mode simulates creation)" }`.
  - Run `node --check server.js`.
- `README.md`: add a "Taxonomy Builder" subsection after "Site Builder". It covers:
  - the widget URL and both endpoints;
  - the outline rules (categories nest freely; tags are one level under a family);
  - merging by case-insensitive name, so re-running is safe;
  - admin only;
  - status codes: 200, 400 (parse or read errors, nothing written), and 502 when every attempted create failed.

- [ ] **Step 4: Build and verify**

```bash
cd src/react-widgets && npm run build:taxonomy-builder && cd ../..
ls -l public/js/react/taxonomy-builder.js public/js/react/taxonomy-builder.css
npm test
```
Then smoke-test in legacy mode with demo. Move the registry aside and restore it afterwards, and never print it:
```bash
mv config/neon-environments.json /tmp/tb-registry-backup.json 2>/dev/null
NEON_EXT_APIKEY=test-admin PORT=3999 node server.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3999/widgets/taxonomy-builder?demo=true&apikey=test-admin"   # 200
curl -s -X POST "http://localhost:3999/api/neon/taxonomy-builder/create?demo=true" -H "apikey: test-admin" -H "Content-Type: application/json" \
  -d '{"categories":"GruppoBello\n  Livello 1","tags":"Nuova Famiglia\n  Nuovo Tag"}'   # counts.created 4
kill %1; mv /tmp/tb-registry-backup.json config/neon-environments.json 2>/dev/null
ls config/neon-environments.json; lsof -iTCP -sTCP:LISTEN -P | grep node   # file exists; nothing listening
```
Revert any `src/react-widgets/package-lock.json` churn.

- [ ] **Step 5: Commit**

```bash
git add src/react-widgets/vite.taxonomy-builder.config.js src/react-widgets/package.json src/react-widgets/src/taxonomy-builder src/widgets/taxonomy-builder.hbs src/requestHandlers/widgets.js server.js README.md public/js/react/taxonomy-builder.js public/js/react/taxonomy-builder.css
git commit -m "feat(taxonomy-builder): React Taxonomy Builder widget with merge preview and per-item report"
```

---

## After implementation (manual)

1. Pick an environment that loads, using an admin key.
2. Preview an outline that names one existing family and one new family. Confirm the `exists` and `new` labels, which checks the read shapes.
3. Create a small taxonomy and check it in Neon. Then run the same outline again and confirm everything shows `exists` with no writes.
