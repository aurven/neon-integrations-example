# Taxonomy Builder Jobs (50k items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Taxonomy Builder import up to 50,000 items (e.g. `france-municipalities.txt`, 35,086 items) through server-side background jobs that the widget starts, follows, cancels and reports on.

**Architecture:** `#` comment lines are ignored by the taxonomy parser; the item limit becomes a parameter (sync create 500, preview and jobs 50,000). Preview returns a summary above 500 items. A new in-memory job runner (`src/helpers/taxonomy-builder/jobs.js`) shares the per-item creation logic with the sync create and runs level by level with 4 concurrent Neon calls. Five new admin-only endpoints expose jobs; the widget loads `.txt` files, shows the summary and a polling progress panel.

**Tech Stack:** Node 20, Fastify 4, `node:test`, React 18 + Vite 5 (IIFE widget).

**Spec:** `docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md` (builds on `docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md`).

## Global Constraints

- Run all commands from the worktree root `/Users/aureliano.ventrella/Repos/neon-integrations-example/.claude/worktrees/develop`. Branch `develop`. Never push, never merge.
- Test command: `npm test` (runs `test/neon-env/*.test.js` among others). Baseline is 314 passing; every task ends with the whole suite green.
- No network in tests. No new npm dependencies.
- Never print, cat or commit `config/neon-environments.json` (it contains secrets).
- Stop any server or watcher you start before you finish.
- Sync limit message: `outline has N items; the limit is 500`. Job/preview limit message: `outline has N items; the limit is 50000`.
- Body limit on the four taxonomy POST routes: `5 * 1024 * 1024` bytes (route option `bodyLimit`). Larger → 413 from Fastify.
- Job id format: `txj-<yyyymmdd>-<6 hex>`. `CONCURRENCY = 4`. Retention 24 h after `finishedAt`, at most 20 finished jobs per env. Status view returns the first 5000 failures plus `failureCount`.
- Log prefix for jobs: `[taxonomy-job] <jobId> env=<id> …` (start, every 1000 items, end).
- Messages verbatim: `a taxonomy job is already running in env <id>` (409), `job is not running` (409), `taxonomy creation requires an admin key` (403), `job not found` (404), `cancelled` (skipped item error on cancel), `parent "<name>" was not created`, `created but no id returned`.
- Admin only (401/403 as today). Job visibility: global admin key sees all jobs; an env-bound key sees only its env's jobs.
- Code style: `'use strict'`, CommonJS, 2-space indent, single quotes, small functions, file header comment naming the spec — match the existing taxonomy files.

## Review Focus

1. **Re-running the 35k reference file after a partial import** — preview/job reads must stay fast (the existing `findLive` is a linear scan per item: 35k × ~600 siblings). Expected: `readExisting` on an all-existing 35k tree finishes in well under 3 s. Pinned in Task 2 (`liveIndex` + scale test).
2. **An env-bound admin key without a resolved env asking for jobs** — must never see other envs' jobs. Pinned in Task 4 (`scopeOf` returns `''` → nothing visible; test).
3. **Cancel while 4 calls are in flight** — in-flight items finish and count; every untouched item is `skipped`/`cancelled`; `done === total`. Pinned in Task 3.
4. **A lane throws outside the per-item try/catch** — job ends `failed`, no lane keeps mutating after finish (`Promise.allSettled`), remaining items `skipped`. Pinned in Task 3.
5. **Job start with thousands of indentation errors** — 400 carries at most 200 errors plus `errorCount`, and no job is created. Pinned in Task 4.

---

## File map

| File | Change |
|---|---|
| `src/helpers/outline/parse-indented.js` | `comments` option |
| `src/helpers/taxonomy-builder/plan.js` | comments on, `maxItems` param, `JOB_MAX_ITEMS` |
| `src/helpers/taxonomy-builder/create-taxonomy.js` | indexed `findLive`, summary `previewView`, shared `attemptItem`/`categoryCreator`/`tagCreator` |
| `src/helpers/taxonomy-builder/jobs.js` | **new** job runner |
| `src/requestHandlers/taxonomy-builder.js` | preview uses 50k, job handlers, `BODY_LIMIT` |
| `server.js` | route options + 5 routes + dashboard entries |
| `README.md` | Taxonomy Builder section: jobs |
| `src/react-widgets/src/taxonomy-builder/*` | file load, summary, job panel, jobs list |
| `public/js/react/taxonomy-builder.{js,css}` | rebuilt bundle |
| tests in `test/neon-env/` | `outline-parse-indented`, `taxonomy-plan`, `taxonomy-create`, **new** `taxonomy-jobs`, `taxonomy-routes` |

---

### Task 1: Parser comments + plan item limit parameter

**Files:**
- Modify: `src/helpers/outline/parse-indented.js`
- Modify: `src/helpers/taxonomy-builder/plan.js`
- Test: `test/neon-env/outline-parse-indented.test.js`, `test/neon-env/taxonomy-plan.test.js`

**Interfaces:**
- Produces: `parseIndented(text, { firstLineNoun, accept, comments = false })`; `buildTaxonomyPlan({ categories, tags, defaultLanguage, maxItems = MAX_ITEMS })` (comments always ignored for taxonomy); exports `MAX_ITEMS = 500`, `JOB_MAX_ITEMS = 50000`.

- [ ] **Step 1: Write failing tests**

Append to `test/neon-env/outline-parse-indented.test.js` (it already imports `test`, `assert`, `parseIndented`; check the top of the file and reuse its imports):

```js
test('comments option skips # lines, indented or not, without touching indentation', () => {
  const text = '# header\nA\n  # note under A\n  B\n    # deep note\n    C\n# trailing\nD';
  const { entries, errors } = parseIndented(text, { comments: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(entries.map((e) => [e.line, e.text, e.depth, e.parentIndex]), [
    [2, 'A', 1, null],
    [4, 'B', 2, 0],
    [6, 'C', 3, 1],
    [8, 'D', 1, null],
  ]);
});

test('an indented comment as the first non-blank line is not an indentation error', () => {
  const { entries, errors } = parseIndented('   # banner\nA', { comments: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(entries.map((e) => e.text), ['A']);
});

test('comments are off by default (Site Builder unchanged)', () => {
  const { entries } = parseIndented('# not a comment\nA');
  assert.deepEqual(entries.map((e) => e.text), ['# not a comment', 'A']);
});
```

Append to `test/neon-env/taxonomy-plan.test.js` and add `JOB_MAX_ITEMS` to its existing `require` destructuring:

```js
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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/neon-env/outline-parse-indented.test.js test/neon-env/taxonomy-plan.test.js`
Expected: the new tests FAIL (comment lines parsed as entries; `JOB_MAX_ITEMS` undefined).

- [ ] **Step 3: Implement**

In `src/helpers/outline/parse-indented.js`, change the signature and the blank-line check:

```js
function parseIndented(text, { firstLineNoun = 'line', accept, comments = false } = {}) {
```

```js
    if (!raw.trim()) return;
    if (comments && raw.trim().startsWith('#')) return;
```

Update the header comment's first line to mention: `Optional comments: lines whose first non-blank character is # are skipped.`

In `src/helpers/taxonomy-builder/plan.js`:

```js
const MAX_ITEMS = 500;
const JOB_MAX_ITEMS = 50000;
```

```js
function parseKind(text, label, childKind) {
  const parsed = parseIndented(text, { comments: true });
```

```js
function buildTaxonomyPlan({ categories, tags, defaultLanguage, maxItems = MAX_ITEMS } = {}) {
```

```js
  if (total > maxItems) errors.push(`outline has ${total} items; the limit is ${maxItems}`);
```

Add `JOB_MAX_ITEMS` to `module.exports`. Update the header comment to cite also `docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §1`.

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/neon-env/outline-parse-indented.test.js test/neon-env/taxonomy-plan.test.js` → PASS. Then `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/outline/parse-indented.js src/helpers/taxonomy-builder/plan.js test/neon-env/outline-parse-indented.test.js test/neon-env/taxonomy-plan.test.js
git commit -m "feat(taxonomy-builder): ignore # comment lines; item limit parameter (500 sync, 50000 jobs)"
```

---

### Task 2: Indexed matching, summary preview, shared per-item create

**Files:**
- Modify: `src/helpers/taxonomy-builder/create-taxonomy.js`
- Test: `test/neon-env/taxonomy-create.test.js`

**Interfaces:**
- Consumes: `buildTaxonomyPlan({ …, maxItems })`, `JOB_MAX_ITEMS` (Task 1).
- Produces (all exported from `create-taxonomy.js`, alongside the existing exports):
  - `previewView(plan, existing, envId, errors)` → `{ env, mode: 'full', categories, tags, toCreate, errors, errorCount }` when total ≤ 500, else `{ env, mode: 'summary', total, toCreate, levels: [{ outline, depth, kind, total, new, exists }], sample: { categories, tags }, errors, errorCount }` (sample and errors capped at 200).
  - `emptyResult(item)` → `{ path, name, depth, kind, status: 'skipped' }`.
  - `attemptItem(items, matches, results, i, idKey, create)` → `Promise<result>`; mutates and returns `results[i]` with the sync per-item rules.
  - `categoryCreator(plan, neon)` → `async (item, i, results) => ref | null`.
  - `tagCreator(neon)` → `async (item, i, results) => id | null`.
  - Constants `FULL_PREVIEW_MAX = 500`, `PREVIEW_CAP = 200`.

- [ ] **Step 1: Write failing tests**

Append to `test/neon-env/taxonomy-create.test.js`. Add `JOB_MAX_ITEMS` to a new require line and extend the `create-taxonomy.js` require with `attemptItem, categoryCreator, tagCreator, emptyResult`:

```js
const { JOB_MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');
const { attemptItem, categoryCreator, tagCreator, emptyResult } = require('../../src/helpers/taxonomy-builder/create-taxonomy.js');

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
  const existing = { categories: p.categories.map((_, i) => ({ status: i < 3 ? 'exists' : 'new' })), tags: p.tags.map(() => ({ status: 'new' })) };
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
```

Also update the existing test `'previewView marks new/exists and counts toCreate'` by adding `assert.equal(view.mode, 'full');` at its end.

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/neon-env/taxonomy-create.test.js`
Expected: new tests FAIL (`attemptItem` not a function; `mode` undefined). The 35k read test may also time out or exceed 3000 ms.

- [ ] **Step 3: Implement**

In `src/helpers/taxonomy-builder/create-taxonomy.js`:

(a) Replace `findLive` with an indexed version (keep `normaliseName` and `nameOf` as they are):

```js
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
```

(b) Replace `previewView` with:

```js
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
```

(Note: `[...categories, ...tags].filter(...)` is avoided because spreading 50k items is wasteful, not wrong.)

(c) Replace `runItems` and the inline creators in `createTaxonomy` with shared pieces:

```js
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
```

Update `module.exports`:

```js
module.exports = {
  readExisting, previewView, createTaxonomy, demoReport, httpStatusFor,
  emptyResult, attemptItem, categoryCreator, tagCreator, FULL_PREVIEW_MAX, PREVIEW_CAP,
};
```

Header comment: add `Jobs/scale: docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §2-§3`.

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/neon-env/taxonomy-create.test.js` → PASS (all existing sync tests unchanged and green). Then `npm test` → all green. The routes test `preview reads only and marks statuses` must stay green (it does not deep-equal the body).

- [ ] **Step 5: Commit**

```bash
git add src/helpers/taxonomy-builder/create-taxonomy.js test/neon-env/taxonomy-create.test.js
git commit -m "feat(taxonomy-builder): summary preview above 500 items, indexed matching, shared per-item create"
```

---

### Task 3: Job runner `jobs.js`

**Files:**
- Create: `src/helpers/taxonomy-builder/jobs.js`
- Test: `test/neon-env/taxonomy-jobs.test.js` (new)

**Interfaces:**
- Consumes: `emptyResult`, `attemptItem`, `categoryCreator`, `tagCreator` (Task 2); `buildTaxonomyPlan`, `JOB_MAX_ITEMS` (Task 1); `context.run(env, fn)` from `src/helpers/neon-env/context.js`.
- Produces (exports of `jobs.js`):
  - `startJob({ plan, existing, env, client })` → status view; throws `JobConflictError` (`.jobId`) if `env.id` has a running job.
  - `startDemoJob({ plan, envId, durationMs = 3000 })` → status view; same conflict rule.
  - `runningJobId(envId)` → `string | null`.
  - `getJob(jobId, { envId })` → status view | `null`. `envId === null` means "all envs".
  - `listJobs({ envId })` → summary views, newest first.
  - `getReport(jobId, { envId })` → `{ jobId, envId, state, counts, categories, tags }` | `null`.
  - `cancelJob(jobId, { envId })` → `null` (not visible) | `{ error: 'job is not running' }` | status view.
  - `waitForJob(jobId)` → `Promise<void>` (resolves when the job finishes; tests and demo).
  - `JobConflictError`, `CONCURRENCY`, `RETENTION_MS`, `MAX_FINISHED_PER_ENV`, `FAILURE_CAP`, `__resetForTest()`, `__setRetentionMsForTest(ms)`.
  - Status view: `{ jobId, envId, state, phase, createdAt, finishedAt, total, done, counts, failures: <first 5000>, failureCount, error? }`. Summary view: `{ jobId, envId, state, createdAt, finishedAt, total, done, counts }`.

Rulings baked in here (spec is silent): `failures` lists only `failed` items (not cascaded `skipped`); report items not yet attempted have `status: 'pending'`; on an unexpected crash the untouched items become `skipped` with `job failed: <message>` and are counted, so `done === total` for every finished job.

- [ ] **Step 1: Write failing tests**

Create `test/neon-env/taxonomy-jobs.test.js`:

```js
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const context = require('../../src/helpers/neon-env/context.js');
const { buildTaxonomyPlan, JOB_MAX_ITEMS } = require('../../src/helpers/taxonomy-builder/plan.js');
const jobs = require('../../src/helpers/taxonomy-builder/jobs.js');

const ENV = { id: 'env1' };
const OTHER = { id: 'env2' };
const planOf = (categories, tags = '') => buildTaxonomyPlan({ categories, tags, maxItems: JOB_MAX_ITEMS });
const allNew = (plan) => ({ categories: plan.categories.map(() => ({ status: 'new' })), tags: plan.tags.map(() => ({ status: 'new' })) });

// Fake Neon: records start/end of each create, max in-flight, optional delay and failures.
function fakeNeon({ delayMs = 0, failNames = [], gate = null } = {}) {
  const events = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let n = 0;
  const call = async (name, result) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    events.push(['start', name, context.currentEnv()?.id]);
    if (gate) await gate(name);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    else await Promise.resolve();
    inFlight -= 1;
    events.push(['end', name]);
    if (failNames.includes(name)) throw new Error(`fail ${name}`);
    return result();
  };
  return {
    events,
    get maxInFlight() { return maxInFlight; },
    createCalls: () => events.filter((e) => e[0] === 'start').length,
    async createCategoryRaw(body) { return call(body.categoryName, () => ({ categoryRef: `c-${(n += 1)}` })); },
    async createTagFamilyRaw(name) { return call(name, () => ({ id: `tf-${(n += 1)}` })); },
    async createTagRaw(familyId, name) { return call(name, () => ({ id: `t-${(n += 1)}` })); },
  };
}

beforeEach(() => jobs.__resetForTest());

test('runs level by level: no child starts before its parent call ended; tags after categories', async () => {
  const plan = planOf('A\n  A1\n    A11\n  A2\nB\n  B1', 'TF\n  T1\n  T2');
  const neon = fakeNeon({ delayMs: 2 });
  const started = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: neon });
  assert.match(started.jobId, /^txj-\d{8}-[0-9a-f]{6}$/);
  assert.equal(started.state, 'running');
  assert.equal(started.total, 9);
  await jobs.waitForJob(started.jobId);
  const job = jobs.getJob(started.jobId, { envId: null });
  assert.equal(job.state, 'completed');
  assert.deepEqual(job.counts, { created: 9, exists: 0, failed: 0, skipped: 0 });
  assert.equal(job.done, 9);
  assert.equal(job.phase, null);
  const starts = neon.events.filter((e) => e[0] === 'start').map((e) => e[1]);
  const pos = (name, kind) => neon.events.findIndex((e) => e[0] === kind && e[1] === name);
  for (const [parent, child] of [['A', 'A1'], ['A1', 'A11'], ['A', 'A2'], ['B', 'B1'], ['TF', 'T1'], ['TF', 'T2']]) {
    assert.ok(pos(parent, 'end') < pos(child, 'start'), `${child} started before ${parent} ended`);
  }
  assert.ok(starts.indexOf('TF') > starts.indexOf('A11'), 'tag families start after the last category level');
  assert.ok(neon.events.filter((e) => e[0] === 'start').every((e) => e[2] === 'env1'), 'calls run inside the job env context');
});

test('never more than CONCURRENCY calls in flight', async () => {
  assert.equal(jobs.CONCURRENCY, 4);
  const plan = planOf(['F', ...Array.from({ length: 40 }, (_, i) => `  C${i}`)].join('\n'));
  const neon = fakeNeon({ delayMs: 3 });
  const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: neon });
  await jobs.waitForJob(jobId);
  assert.equal(neon.maxInFlight, 4);
  assert.equal(neon.createCalls(), 41);
});

test('failures cascade to descendants; existing items counted without calls; failures listed', async () => {
  const plan = planOf('Old\n  New1\nBad\n  Child\n    Grand', 'TF\n  T');
  const existing = allNew(plan);
  existing.categories[0] = { status: 'exists', ref: 'old-ref' };
  const neon = fakeNeon({ failNames: ['Bad'] });
  const { jobId } = jobs.startJob({ plan, existing, env: ENV, client: neon });
  assert.equal(jobs.getJob(jobId, { envId: null }).counts.exists, 1, 'exists counted at start');
  await jobs.waitForJob(jobId);
  const job = jobs.getJob(jobId, { envId: null });
  assert.deepEqual(job.counts, { created: 3, exists: 1, failed: 1, skipped: 2 });
  assert.deepEqual(job.failures, [{ outline: 'categories', path: 'Bad', error: 'fail Bad' }]);
  assert.equal(job.failureCount, 1);
  assert.ok(!neon.events.some((e) => e[1] === 'Old'));
  const report = jobs.getReport(jobId, { envId: null });
  assert.deepEqual(report.categories.map((i) => [i.path, i.status, i.ref || i.error]), [
    ['Old', 'exists', 'old-ref'],
    ['Old / New1', 'created', report.categories[1].ref],
    ['Bad', 'failed', 'fail Bad'],
    ['Bad / Child', 'skipped', 'parent "Bad" was not created'],
    ['Bad / Child / Grand', 'skipped', 'parent "Child" was not created'],
  ]);
  assert.equal(report.state, 'completed');
  assert.deepEqual(Object.keys(report), ['jobId', 'envId', 'state', 'counts', 'categories', 'tags']);
});

test('cancel mid-run: in-flight calls finish, the rest are skipped "cancelled"', async () => {
  const plan = planOf(['F', ...Array.from({ length: 30 }, (_, i) => `  C${i}`)].join('\n'));
  let release;
  const blocked = new Promise((r) => { release = r; });
  const neon = fakeNeon({ gate: (name) => (name === 'F' ? null : blocked) });
  const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: neon });
  while (neon.createCalls() < 5) await new Promise((r) => setImmediate(r)); // F + 4 in flight
  const view = jobs.cancelJob(jobId, { envId: 'env1' });
  assert.equal(view.jobId, jobId);
  release();
  await jobs.waitForJob(jobId);
  const job = jobs.getJob(jobId, { envId: null });
  assert.equal(job.state, 'cancelled');
  assert.equal(neon.createCalls(), 5);
  assert.deepEqual(job.counts, { created: 5, exists: 0, failed: 0, skipped: 26 });
  assert.equal(job.done, job.total);
  const report = jobs.getReport(jobId, { envId: null });
  assert.equal(report.categories[30].error, 'cancelled');
  assert.ok(!report.categories.some((i) => i.status === 'pending'));
  assert.deepEqual(jobs.cancelJob(jobId, { envId: null }), { error: 'job is not running' });
});

test('one running job per env; other envs unaffected; conflict carries the running jobId', async () => {
  const plan = planOf('F\n  C');
  let release;
  const blocked = new Promise((r) => { release = r; });
  const first = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon({ gate: () => blocked }) });
  assert.equal(jobs.runningJobId('env1'), first.jobId);
  assert.throws(() => jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() }), (e) => e instanceof jobs.JobConflictError && e.jobId === first.jobId && e.message === 'a taxonomy job is already running in env env1');
  assert.throws(() => jobs.startDemoJob({ plan, envId: 'env1' }), jobs.JobConflictError);
  const other = jobs.startJob({ plan, existing: allNew(plan), env: OTHER, client: fakeNeon() });
  release();
  await Promise.all([jobs.waitForJob(first.jobId), jobs.waitForJob(other.jobId)]);
  assert.equal(jobs.runningJobId('env1'), null);
});

test('visibility is scoped by env; null scope sees all; list is newest first', async () => {
  const plan = planOf('F');
  const a = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() });
  await jobs.waitForJob(a.jobId);
  const b = jobs.startJob({ plan, existing: allNew(plan), env: OTHER, client: fakeNeon() });
  await jobs.waitForJob(b.jobId);
  assert.equal(jobs.getJob(a.jobId, { envId: 'env2' }), null);
  assert.equal(jobs.getReport(a.jobId, { envId: 'env2' }), null);
  assert.equal(jobs.cancelJob(a.jobId, { envId: 'env2' }), null);
  assert.equal(jobs.getJob(a.jobId, { envId: '' }), null);
  assert.equal(jobs.getJob(a.jobId, { envId: 'env1' }).jobId, a.jobId);
  assert.deepEqual(jobs.listJobs({ envId: null }).map((j) => j.jobId), [b.jobId, a.jobId]);
  assert.deepEqual(jobs.listJobs({ envId: 'env1' }).map((j) => j.jobId), [a.jobId]);
  assert.deepEqual(Object.keys(jobs.listJobs({ envId: null })[0]), ['jobId', 'envId', 'state', 'createdAt', 'finishedAt', 'total', 'done', 'counts']);
});

test('retention: at most 20 finished jobs per env, evicted after the retention time', async () => {
  const plan = planOf('F');
  const ids = [];
  for (let i = 0; i < 22; i += 1) {
    const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() });
    await jobs.waitForJob(jobId);
    ids.push(jobId);
  }
  const listed = jobs.listJobs({ envId: 'env1' }).map((j) => j.jobId);
  assert.equal(listed.length, jobs.MAX_FINISHED_PER_ENV);
  assert.ok(!listed.includes(ids[0]) && !listed.includes(ids[1]), 'oldest evicted first');
  jobs.__resetForTest();
  jobs.__setRetentionMsForTest(20);
  const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() });
  await jobs.waitForJob(jobId);
  assert.ok(jobs.getJob(jobId, { envId: null }));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(jobs.getJob(jobId, { envId: null }), null);
  assert.equal(jobs.RETENTION_MS, 24 * 60 * 60 * 1000);
});

test('status view caps failures at 5000 but counts them all', async () => {
  const names = Array.from({ length: 5003 }, (_, i) => `C${i}`);
  const plan = planOf(names.join('\n'));
  const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon({ failNames: names }) });
  await jobs.waitForJob(jobId);
  const job = jobs.getJob(jobId, { envId: null });
  assert.equal(jobs.FAILURE_CAP, 5000);
  assert.equal(job.failures.length, 5000);
  assert.equal(job.failureCount, 5003);
  assert.equal(jobs.getReport(jobId, { envId: null }).categories.length, 5003);
});

test('an unexpected crash marks the job failed and skips untouched items', async () => {
  const plan = planOf('F\n  C1\n  C2');
  const client = fakeNeon();
  // A creator that throws synchronously-before-try is impossible to reach through the client, so break the record step:
  const existing = allNew(plan);
  existing.categories[1] = null; // attemptItem reads matches[i].status → TypeError outside the per-item try
  const { jobId } = jobs.startJob({ plan, existing: { categories: [existing.categories[0], { status: 'new' }, { status: 'new' }], tags: [] }, env: ENV, client });
  await jobs.waitForJob(jobId);
  assert.equal(jobs.getJob(jobId, { envId: null }).state, 'completed'); // sanity: normal run completes
  const crash = jobs.startJob({ plan, existing, env: ENV, client: fakeNeon() });
  await jobs.waitForJob(crash.jobId);
  const job = jobs.getJob(crash.jobId, { envId: null });
  assert.equal(job.state, 'failed');
  assert.match(job.error, /status/);
  assert.equal(job.done, job.total);
  const report = jobs.getReport(crash.jobId, { envId: null });
  assert.ok(report.categories.filter((i) => i.status === 'skipped').every((i) => i.error.startsWith('job failed: ')));
});

test('demo job marks everything created with demo ids and completes', async () => {
  const plan = planOf('F\n  C', 'TF\n  T');
  const started = jobs.startDemoJob({ plan, envId: 'env1', durationMs: 50 });
  assert.equal(started.state, 'running');
  await jobs.waitForJob(started.jobId);
  const job = jobs.getJob(started.jobId, { envId: 'env1' });
  assert.equal(job.state, 'completed');
  assert.deepEqual(job.counts, { created: 4, exists: 0, failed: 0, skipped: 0 });
  const report = jobs.getReport(started.jobId, { envId: null });
  assert.deepEqual([...report.categories.map((i) => i.ref), ...report.tags.map((i) => i.id)], ['demo-1', 'demo-2', 'demo-3', 'demo-4']);
});

test('scale: 1 / 19 / 106 / 34,960 outline → exactly 35,086 creates in valid order, fast', async () => {
  const lines = ['# generated', 'France'];
  let d = 0;
  let c = 0;
  for (let r = 0; r < 19; r += 1) {
    lines.push(`  Region ${r}`);
    for (const dEnd = Math.round(((r + 1) * 106) / 19); d < dEnd; d += 1) {
      lines.push(`    Dept ${d}`);
      for (const cEnd = Math.round(((d + 1) * 34960) / 106); c < cEnd; c += 1) lines.push(`      Commune ${c}`);
    }
  }
  const plan = planOf(lines.join('\n'));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.categories.length, 35086);
  const bodies = [];
  let n = 0;
  const client = { async createCategoryRaw(body) { bodies.push(body); return { categoryRef: `r${(n += 1)}` }; } };
  const started = Date.now();
  const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client });
  await jobs.waitForJob(jobId);
  const elapsed = Date.now() - started;
  const job = jobs.getJob(jobId, { envId: null });
  assert.equal(job.state, 'completed');
  assert.equal(bodies.length, 35086);
  assert.deepEqual(job.counts, { created: 35086, exists: 0, failed: 0, skipped: 0 });
  const createdRefs = new Set();
  const refByIndex = jobs.getReport(jobId, { envId: null }).categories.map((i) => i.ref);
  bodies.forEach((body, k) => {
    if (body.parentRef) assert.ok(createdRefs.has(body.parentRef), `call ${k} used a parent not yet created`);
    createdRefs.add(`r${k + 1}`);
  });
  assert.equal(new Set(refByIndex).size, 35086);
  assert.ok(elapsed < 10000, `job took ${elapsed} ms`);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/neon-env/taxonomy-jobs.test.js`
Expected: FAIL with `Cannot find module '../../src/helpers/taxonomy-builder/jobs.js'`.

- [ ] **Step 3: Implement `src/helpers/taxonomy-builder/jobs.js`**

```js
'use strict';
/**
 * Taxonomy Builder background jobs: in memory, one running job per env, level by level
 * (category depth 1, 2, …, tag families, tags) with at most CONCURRENCY Neon calls in flight.
 * Spec: docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §3
 */
const crypto = require('node:crypto');
const context = require('../neon-env/context.js');
const { emptyResult, attemptItem, categoryCreator, tagCreator } = require('./create-taxonomy.js');

const CONCURRENCY = 4;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_FINISHED_PER_ENV = 20;
const FAILURE_CAP = 5000;
const LOG_EVERY = 1000;
const DEMO_DURATION_MS = 3000;
const DEMO_TICKS = 10;
const OUTLINES = ['categories', 'tags'];
const ID_KEY = { categories: 'ref', tags: 'id' };

const jobs = new Map();
let retentionMs = RETENTION_MS;

class JobConflictError extends Error {
  constructor(envId, jobId) {
    super(`a taxonomy job is already running in env ${envId}`);
    this.name = 'JobConflictError';
    this.jobId = jobId;
  }
}

function newJobId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let id;
  do { id = `txj-${day}-${crypto.randomBytes(3).toString('hex')}`; } while (jobs.has(id));
  return id;
}

function runningJobId(envId) {
  for (const job of jobs.values()) if (job.envId === envId && job.state === 'running') return job.jobId;
  return null;
}

function levelsOf(plan) {
  const byDepth = (items) => {
    const groups = [];
    items.forEach((item, i) => { (groups[item.depth] = groups[item.depth] || []).push(i); });
    return groups;
  };
  const levels = [];
  byDepth(plan.categories).forEach((indexes, depth) => levels.push({ outline: 'categories', phase: `categories level ${depth}`, indexes }));
  const tagGroups = byDepth(plan.tags);
  if (tagGroups[1]) levels.push({ outline: 'tags', phase: 'tag families', indexes: tagGroups[1] });
  if (tagGroups[2]) levels.push({ outline: 'tags', phase: 'tags', indexes: tagGroups[2] });
  return levels;
}

function log(job, message) {
  console.log(`[taxonomy-job] ${job.jobId} env=${job.envId} ${message}`);
}

function createRecord(plan, envId) {
  const running = runningJobId(envId);
  if (running) throw new JobConflictError(envId, running);
  const pending = (item) => ({ ...emptyResult(item), status: 'pending' });
  const job = {
    jobId: newJobId(),
    envId,
    state: 'running',
    createdAt: new Date().toISOString(),
    finishedAt: null,
    phase: null,
    total: plan.categories.length + plan.tags.length,
    counts: { created: 0, exists: 0, failed: 0, skipped: 0 },
    done: 0,
    failures: [],
    report: { categories: plan.categories.map(pending), tags: plan.tags.map(pending) },
    error: undefined,
    cancelRequested: false,
    timer: null,
    promise: null,
  };
  jobs.set(job.jobId, job);
  return job;
}

function record(job, outline, result) {
  job.counts[result.status] += 1;
  job.done += 1;
  if (result.status === 'failed') job.failures.push({ outline, path: result.path, error: result.error });
  if (job.done % LOG_EVERY === 0) log(job, `progress ${job.done}/${job.total} counts=${JSON.stringify(job.counts)}`);
}

function markExisting(job, existing) {
  for (const outline of OUTLINES) {
    existing[outline].forEach((match, i) => {
      if (!match || match.status !== 'exists') return;
      const result = job.report[outline][i];
      result.status = 'exists';
      result[ID_KEY[outline]] = match.ref;
      record(job, outline, result);
    });
  }
}

async function runPool(indexes, worker, shouldStop) {
  let next = 0;
  const lane = async () => {
    while (next < indexes.length && !shouldStop()) {
      const i = indexes[next];
      next += 1;
      await worker(i);
    }
  };
  const lanes = Array.from({ length: Math.min(CONCURRENCY, indexes.length) }, lane);
  const settled = await Promise.allSettled(lanes);
  const rejected = settled.find((s) => s.status === 'rejected');
  if (rejected) throw rejected.reason;
}

async function runLevels(job, plan, existing, client) {
  const create = { categories: categoryCreator(plan, client), tags: tagCreator(client) };
  for (const level of levelsOf(plan)) {
    if (job.cancelRequested) return;
    job.phase = level.phase;
    const { outline } = level;
    const items = plan[outline];
    const matches = existing[outline];
    const results = job.report[outline];
    const todo = level.indexes.filter((i) => results[i].status === 'pending');
    await runPool(todo, async (i) => {
      const result = await attemptItem(items, matches, results, i, ID_KEY[outline], create[outline]);
      record(job, outline, result);
    }, () => job.cancelRequested);
  }
}

function scheduleEviction(job) {
  job.timer = setTimeout(() => jobs.delete(job.jobId), retentionMs);
  if (job.timer.unref) job.timer.unref();
  const finished = [...jobs.values()].filter((j) => j.envId === job.envId && j.state !== 'running');
  while (finished.length > MAX_FINISHED_PER_ENV) {
    const oldest = finished.shift();
    clearTimeout(oldest.timer);
    jobs.delete(oldest.jobId);
  }
}

function finish(job, state, reason) {
  for (const outline of OUTLINES) {
    for (const result of job.report[outline]) {
      if (result.status !== 'pending') continue;
      result.status = 'skipped';
      result.error = reason;
      record(job, outline, result);
    }
  }
  job.state = state;
  job.phase = null;
  job.finishedAt = new Date().toISOString();
  log(job, `${state} counts=${JSON.stringify(job.counts)}${job.error ? ` error=${job.error}` : ''}`);
  scheduleEviction(job);
}

function startJob({ plan, existing, env, client }) {
  const job = createRecord(plan, env.id);
  markExisting(job, existing);
  log(job, `started total=${job.total} toCreate=${job.total - job.counts.exists}`);
  job.promise = context.run(env, () => runLevels(job, plan, existing, client)).then(
    () => finish(job, job.cancelRequested ? 'cancelled' : 'completed', 'cancelled'),
    (error) => {
      job.error = (error && error.message) || String(error);
      finish(job, 'failed', `job failed: ${job.error}`);
    },
  );
  return statusView(job);
}

function startDemoJob({ plan, envId, durationMs = DEMO_DURATION_MS }) {
  const job = createRecord(plan, envId);
  log(job, `started (demo) total=${job.total}`);
  const order = levelsOf(plan).flatMap((level) => level.indexes.map((i) => ({ outline: level.outline, i, phase: level.phase })));
  const perTick = Math.max(1, Math.ceil(order.length / DEMO_TICKS));
  let next = 0;
  let n = 0;
  job.promise = new Promise((resolve) => {
    const tick = () => {
      if (job.cancelRequested) { finish(job, 'cancelled', 'cancelled'); resolve(); return; }
      for (const { outline, i, phase } of order.slice(next, next + perTick)) {
        job.phase = phase;
        const result = job.report[outline][i];
        result.status = 'created';
        result[ID_KEY[outline]] = `demo-${(n += 1)}`;
        record(job, outline, result);
      }
      next += perTick;
      if (next >= order.length) { finish(job, 'completed', 'cancelled'); resolve(); return; }
      setTimeout(tick, durationMs / DEMO_TICKS);
    };
    setTimeout(tick, durationMs / DEMO_TICKS);
  });
  return statusView(job);
}

function statusView(job) {
  const view = {
    jobId: job.jobId,
    envId: job.envId,
    state: job.state,
    phase: job.phase,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    total: job.total,
    done: job.done,
    counts: { ...job.counts },
    failures: job.failures.slice(0, FAILURE_CAP),
    failureCount: job.failures.length,
  };
  if (job.error) view.error = job.error;
  return view;
}

function summaryView(job) {
  return { jobId: job.jobId, envId: job.envId, state: job.state, createdAt: job.createdAt, finishedAt: job.finishedAt, total: job.total, done: job.done, counts: { ...job.counts } };
}

// envId null = global admin (all envs); otherwise only that env's jobs ('' matches nothing).
function visibleJob(jobId, envId) {
  const job = jobs.get(jobId);
  return job && (envId === null || job.envId === envId) ? job : null;
}

function getJob(jobId, { envId } = {}) {
  const job = visibleJob(jobId, envId);
  return job ? statusView(job) : null;
}

function listJobs({ envId } = {}) {
  return [...jobs.values()].reverse().filter((job) => envId === null || job.envId === envId).map(summaryView);
}

function getReport(jobId, { envId } = {}) {
  const job = visibleJob(jobId, envId);
  if (!job) return null;
  return { jobId: job.jobId, envId: job.envId, state: job.state, counts: { ...job.counts }, categories: job.report.categories, tags: job.report.tags };
}

function cancelJob(jobId, { envId } = {}) {
  const job = visibleJob(jobId, envId);
  if (!job) return null;
  if (job.state !== 'running') return { error: 'job is not running' };
  job.cancelRequested = true;
  log(job, 'cancel requested');
  return statusView(job);
}

function waitForJob(jobId) {
  const job = jobs.get(jobId);
  return job && job.promise ? job.promise : Promise.resolve();
}

function __resetForTest() {
  for (const job of jobs.values()) clearTimeout(job.timer);
  jobs.clear();
  retentionMs = RETENTION_MS;
}

function __setRetentionMsForTest(ms) { retentionMs = ms; }

module.exports = {
  startJob, startDemoJob, runningJobId, getJob, listJobs, getReport, cancelJob, waitForJob,
  JobConflictError, CONCURRENCY, RETENTION_MS, MAX_FINISHED_PER_ENV, FAILURE_CAP,
  __resetForTest, __setRetentionMsForTest,
};
```

Notes for the implementer:
- `getJob(id, {})` with `envId` undefined matches nothing (undefined !== null and !== job.envId). Callers always pass an explicit scope; that is intended (fail closed).
- In the crash test, `existing.categories[1] = null` makes `attemptItem` throw a `TypeError` (`Cannot read properties of null (reading 'status')`) outside its try/catch, which `runPool` surfaces after all lanes settle. `markExisting` must tolerate the `null` entry (it does: `!match`). If your Node prints a different TypeError text, keep the `/status/` assertion loose as written.
- `Math.round` partitioning in the scale test yields exactly 106 departments and 34,960 communes.

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/neon-env/taxonomy-jobs.test.js` → PASS (scale test well under 10 s). Then `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/taxonomy-builder/jobs.js test/neon-env/taxonomy-jobs.test.js
git commit -m "feat(taxonomy-builder): in-memory background jobs (levels, concurrency 4, cancel, retention)"
```

---

### Task 4: Job endpoints, body limit, preview at 50k, routes, README

**Files:**
- Modify: `src/requestHandlers/taxonomy-builder.js`
- Modify: `server.js` (taxonomy routes near line 331, dashboard entries near line 147)
- Modify: `README.md` (Taxonomy Builder section)
- Test: `test/neon-env/taxonomy-routes.test.js`

**Interfaces:**
- Consumes: `jobs.*` (Task 3), `JOB_MAX_ITEMS` (Task 1), `previewView` summary (Task 2).
- Produces: handler exports `startTaxonomyJobHandler`, `listTaxonomyJobsHandler`, `getTaxonomyJobHandler`, `taxonomyJobReportHandler`, `cancelTaxonomyJobHandler`, `BODY_LIMIT = 5 * 1024 * 1024`, plus the existing exports. Routes:
  - `POST /api/neon/taxonomy-builder/jobs`
  - `GET /api/neon/taxonomy-builder/jobs`
  - `GET /api/neon/taxonomy-builder/jobs/:id`
  - `GET /api/neon/taxonomy-builder/jobs/:id/report`
  - `POST /api/neon/taxonomy-builder/jobs/:id/cancel`

- [ ] **Step 1: Write failing tests**

In `test/neon-env/taxonomy-routes.test.js`:

(a) Add at the top: `const jobs = require('../../src/helpers/taxonomy-builder/jobs.js');`

(b) Replace `buildApp` with:

```js
async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  const opts = { bodyLimit: handlers.BODY_LIMIT };
  app.post('/api/neon/taxonomy-builder/preview', opts, handlers.previewTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/create', opts, handlers.createTaxonomyHandler);
  app.post('/api/neon/taxonomy-builder/jobs', opts, handlers.startTaxonomyJobHandler);
  app.get('/api/neon/taxonomy-builder/jobs', handlers.listTaxonomyJobsHandler);
  app.get('/api/neon/taxonomy-builder/jobs/:id', handlers.getTaxonomyJobHandler);
  app.get('/api/neon/taxonomy-builder/jobs/:id/report', handlers.taxonomyJobReportHandler);
  app.post('/api/neon/taxonomy-builder/jobs/:id/cancel', opts, handlers.cancelTaxonomyJobHandler);
  return app;
}
```

(c) Change the registry to two envs so scoping can be tested:

```js
const reg = buildRegistry({ json: registryJson([envJson('a', { extApiKeyLimited: 'lim-a' }), envJson('b')]), envVars: {} });
```

(d) In `beforeEach`, add `jobs.__resetForTest();`.

(e) Append:

```js
const get = (app, url, apikey = 'key-a') => app.inject({ method: 'GET', url, headers: { apikey } });

test('POST /jobs → 202 with jobId/total/toCreate; status, list, report work', async () => {
  neon = fakeNeon({ catFamilies: [{ categoryRef: 'r', name: 'GruppoBello' }] });
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/jobs');
  assert.equal(res.statusCode, 202);
  const { jobId, total, toCreate } = res.json();
  assert.match(jobId, /^txj-/);
  assert.equal(total, 4);
  assert.equal(toCreate, 3);
  await jobs.waitForJob(jobId);
  const status = await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`);
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().state, 'completed');
  assert.deepEqual(status.json().counts, { created: 3, exists: 1, failed: 0, skipped: 0 });
  const list = await get(app, '/api/neon/taxonomy-builder/jobs');
  assert.deepEqual(list.json().jobs.map((j) => j.jobId), [jobId]);
  const report = await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}/report`);
  assert.equal(report.statusCode, 200);
  assert.equal(report.headers['content-disposition'], `attachment; filename="${jobId}-report.json"`);
  assert.equal(report.json().categories.length, 2);
});

test('POST /jobs with plan errors → 400 {errors (max 200), errorCount}, no job, no Neon calls', async () => {
  const app = await buildApp();
  const bad = ['A', ...Array.from({ length: 301 }, () => '  dup')].join('\n'); // 300 duplicate-sibling errors
  const res = await post(app, '/api/neon/taxonomy-builder/jobs', { payload: { categories: bad, tags: '' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().errors.length, 200);
  assert.equal(res.json().errorCount, 300);
  assert.deepEqual(jobs.listJobs({ envId: null }), []);
  assert.equal(neon.calls.length, 0);
});

test('POST /jobs while one is running in the env → 409 with the running jobId, before any read', async () => {
  const app = await buildApp();
  const first = (await post(app, '/api/neon/taxonomy-builder/jobs?demo=true')).json();
  neon.calls.length = 0;
  const res = await post(app, '/api/neon/taxonomy-builder/jobs');
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.json(), { error: 'a taxonomy job is already running in env a', jobId: first.jobId });
  assert.equal(neon.calls.length, 0);
  const cancelled = await post(app, `/api/neon/taxonomy-builder/jobs/${first.jobId}/cancel`, { payload: {} });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().jobId, first.jobId);
  await jobs.waitForJob(first.jobId);
  const again = await post(app, `/api/neon/taxonomy-builder/jobs/${first.jobId}/cancel`, { payload: {} });
  assert.equal(again.statusCode, 409);
  assert.deepEqual(again.json(), { error: 'job is not running' });
});

test('demo job: no Neon calls, completes with demo ids', async () => {
  const app = await buildApp();
  const res = await post(app, '/api/neon/taxonomy-builder/jobs?demo=true');
  assert.equal(res.statusCode, 202);
  await jobs.waitForJob(res.json().jobId);
  const report = (await get(app, `/api/neon/taxonomy-builder/jobs/${res.json().jobId}/report`)).json();
  assert.equal(report.state, 'completed');
  assert.equal(report.categories[0].ref, 'demo-1');
  assert.equal(neon.calls.length, 0);
});

test('job endpoints: 401 without key, 403 for limited key, 404 unknown or other env; global admin sees all', async () => {
  const app = await buildApp();
  const { jobId } = (await post(app, '/api/neon/taxonomy-builder/jobs?demo=true')).json();
  assert.equal((await app.inject({ method: 'GET', url: '/api/neon/taxonomy-builder/jobs' })).statusCode, 401);
  const limited = await get(app, '/api/neon/taxonomy-builder/jobs', 'lim-a');
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'taxonomy creation requires an admin key' });
  assert.equal((await get(app, '/api/neon/taxonomy-builder/jobs/txj-00000000-000000')).statusCode, 404);
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs/txj-00000000-000000')).json(), { error: 'job not found' });
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`, 'key-b')).statusCode, 404);
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}/report`, 'key-b')).statusCode, 404);
  assert.equal((await post(app, `/api/neon/taxonomy-builder/jobs/${jobId}/cancel`, { headers: { apikey: 'key-b' }, payload: {} })).statusCode, 404);
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs', 'key-b')).json(), { jobs: [] });
  assert.deepEqual((await get(app, '/api/neon/taxonomy-builder/jobs', 'admin-key')).json().jobs.map((j) => j.jobId), [jobId]);
  assert.equal((await get(app, `/api/neon/taxonomy-builder/jobs/${jobId}`, 'admin-key')).statusCode, 200);
  await jobs.waitForJob(jobId);
});

test('body limit: 1.2 MB accepted, 6 MB rejected with 413', async () => {
  const app = await buildApp();
  const line = '  Commune with a fairly long name number ';
  const big = ['France', ...Array.from({ length: 25000 }, (_, i) => `${line}${i}`)].join('\n');
  assert.ok(Buffer.byteLength(big) > 1.2 * 1024 * 1024);
  const ok = await post(app, '/api/neon/taxonomy-builder/preview', { payload: { categories: big, tags: '' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().mode, 'summary');
  assert.equal(ok.json().total, 25001);
  const huge = 'x'.repeat(6 * 1024 * 1024);
  const tooBig = await post(app, '/api/neon/taxonomy-builder/jobs', { payload: { categories: huge, tags: '' } });
  assert.equal(tooBig.statusCode, 413);
});

test('sync create still enforces 500 items; preview allows up to 50000', async () => {
  const app = await buildApp();
  const many = ['F', ...Array.from({ length: 600 }, (_, i) => `  C ${i}`)].join('\n');
  const created = await post(app, '/api/neon/taxonomy-builder/create', { payload: { categories: many, tags: '' } });
  assert.equal(created.statusCode, 400);
  assert.deepEqual(created.json().errors, ['outline has 601 items; the limit is 500']);
  const preview = await post(app, '/api/neon/taxonomy-builder/preview', { payload: { categories: many, tags: '' } });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.json().errors, []);
  assert.equal(preview.json().mode, 'summary');
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/neon-env/taxonomy-routes.test.js`
Expected: FAIL (`handlers.BODY_LIMIT` undefined → route registration with `bodyLimit: undefined` may throw; new handlers not functions).

- [ ] **Step 3: Implement the handlers**

Replace `src/requestHandlers/taxonomy-builder.js` with:

```js
'use strict';
/**
 * Taxonomy Builder endpoints: preview (reads only), sync create (≤500 items) and background jobs (≤50,000 items).
 * Specs: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §4,
 *        docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §1, §2, §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildTaxonomyPlan, JOB_MAX_ITEMS } = require('../helpers/taxonomy-builder/plan.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor, PREVIEW_CAP } = require('../helpers/taxonomy-builder/create-taxonomy.js');
const jobs = require('../helpers/taxonomy-builder/jobs.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const BAD_BODY = 'body must be { categories: string, tags: string, defaultLanguage?: string }';
const BODY_LIMIT = 5 * 1024 * 1024;

let clientProvider = () => neonApi.currentClient();

function requireAdmin(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return false; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'taxonomy creation requires an admin key' }); return false; }
  return true;
}

// Global admin sees every env's jobs; any other key only its env's ('' when unresolved matches nothing).
function scopeOf(request) {
  return { envId: request.neonAuth?.global ? null : (request.neonEnv?.id || '') };
}

function readRequest(request, reply) {
  if (!requireAdmin(request, reply)) return null;
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

async function planWithReads(req, maxItems) {
  const plan = buildTaxonomyPlan({ categories: req.categories, tags: req.tags, defaultLanguage: req.defaultLanguage, maxItems });
  if (plan.errors.length || req.demo) return { plan, existing: newState(plan), errors: [...plan.errors] };
  const { existing, errors } = await readExisting(plan, clientProvider(), req.env.id);
  return { plan, existing, errors };
}

async function previewTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req, JOB_MAX_ITEMS);
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

function conflict(reply, envId, jobId) {
  return reply.status(409).send({ error: `a taxonomy job is already running in env ${envId}`, jobId });
}

async function startTaxonomyJobHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const running = jobs.runningJobId(req.env.id);
  if (running) return conflict(reply, req.env.id, running);
  const { plan, existing, errors } = await planWithReads(req, JOB_MAX_ITEMS);
  if (errors.length) return reply.status(400).send({ errors: errors.slice(0, PREVIEW_CAP), errorCount: errors.length });
  try {
    const job = req.demo
      ? jobs.startDemoJob({ plan, envId: req.env.id })
      : jobs.startJob({ plan, existing, env: req.env, client: clientProvider() });
    const toCreate = [...existing.categories, ...existing.tags].filter((m) => m.status !== 'exists').length;
    return reply.status(202).send({ jobId: job.jobId, total: job.total, toCreate });
  } catch (error) {
    if (error instanceof jobs.JobConflictError) return conflict(reply, req.env.id, error.jobId);
    throw error;
  }
}

function notFound(reply) {
  return reply.status(404).send({ error: 'job not found' });
}

async function listTaxonomyJobsHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  return reply.status(200).send({ jobs: jobs.listJobs(scopeOf(request)) });
}

async function getTaxonomyJobHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const job = jobs.getJob(request.params.id, scopeOf(request));
  return job ? reply.status(200).send(job) : notFound(reply);
}

async function taxonomyJobReportHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const report = jobs.getReport(request.params.id, scopeOf(request));
  if (!report) return notFound(reply);
  return reply
    .status(200)
    .header('Content-Disposition', `attachment; filename="${report.jobId}-report.json"`)
    .send(report);
}

async function cancelTaxonomyJobHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const result = jobs.cancelJob(request.params.id, scopeOf(request));
  if (!result) return notFound(reply);
  if (result.error) return reply.status(409).send(result);
  return reply.status(200).send(result);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || (() => neonApi.currentClient());
}

module.exports = {
  previewTaxonomyHandler, createTaxonomyHandler,
  startTaxonomyJobHandler, listTaxonomyJobsHandler, getTaxonomyJobHandler, taxonomyJobReportHandler, cancelTaxonomyJobHandler,
  BODY_LIMIT, __setClientProviderForTest,
};
```

Notes:
- `[...existing.categories, ...existing.tags]` spreads up to 50k entries once per job start — fine. `toCreate` counts entries not `exists` (all are `new` in demo).
- The global admin key (`admin-key`) with no `?env=` resolves no env; GET handlers do not require one. Verify in the test that `admin-key` GETs return 200 (no 400 from the env plugin). If the env plugin rejects env-less global requests on these routes, report it as a concern rather than changing the plugin.

- [ ] **Step 4: Register routes in `server.js`**

Replace the three lines at `server.js:331-333`:

```js
const taxonomyBuilderHandlers = require("./src/requestHandlers/taxonomy-builder.js");
const taxonomyBodyLimit = { bodyLimit: taxonomyBuilderHandlers.BODY_LIMIT };
fastify.post("/api/neon/taxonomy-builder/preview", taxonomyBodyLimit, taxonomyBuilderHandlers.previewTaxonomyHandler);
fastify.post("/api/neon/taxonomy-builder/create", taxonomyBodyLimit, taxonomyBuilderHandlers.createTaxonomyHandler);
fastify.post("/api/neon/taxonomy-builder/jobs", taxonomyBodyLimit, taxonomyBuilderHandlers.startTaxonomyJobHandler);
fastify.get("/api/neon/taxonomy-builder/jobs", taxonomyBuilderHandlers.listTaxonomyJobsHandler);
fastify.get("/api/neon/taxonomy-builder/jobs/:id", taxonomyBuilderHandlers.getTaxonomyJobHandler);
fastify.get("/api/neon/taxonomy-builder/jobs/:id/report", taxonomyBuilderHandlers.taxonomyJobReportHandler);
fastify.post("/api/neon/taxonomy-builder/jobs/:id/cancel", taxonomyBodyLimit, taxonomyBuilderHandlers.cancelTaxonomyJobHandler);
```

In the services dashboard list (after the `Taxonomy Builder Create` entry at `server.js:148`), add:

```js
      { name: "Taxonomy Builder Job Start", endpoint: "POST /api/neon/taxonomy-builder/jobs", description: "Start a background job creating up to 50,000 taxonomy items from outlines (202 + jobId; 409 if one is running in the env; admin key; ?demo=true supported)" },
      { name: "Taxonomy Builder Jobs", endpoint: "GET /api/neon/taxonomy-builder/jobs", description: "List running and recent taxonomy jobs visible to the key (admin key)" },
      { name: "Taxonomy Builder Job Status", endpoint: "GET /api/neon/taxonomy-builder/jobs/:id", description: "Job progress, counts and first 5000 failures (admin key)" },
      { name: "Taxonomy Builder Job Report", endpoint: "GET /api/neon/taxonomy-builder/jobs/:id/report", description: "Download the full per-item job report as JSON (admin key)" },
      { name: "Taxonomy Builder Job Cancel", endpoint: "POST /api/neon/taxonomy-builder/jobs/:id/cancel", description: "Cancel a running taxonomy job; items not yet attempted are skipped (admin key)" }
```

(Mind the comma after the existing `Taxonomy Builder Create` entry.)

Smoke-check the server boots: `PORT=3997 timeout 8 node server.js` (expect it to start listening, then be killed by `timeout`; any route-registration error fails fast). Make sure nothing is left listening on 3997 afterwards (`lsof -ti :3997` empty). Do NOT touch the process on port 54861 (the user's own dev server).

- [ ] **Step 5: README**

In `README.md`, inside the existing Taxonomy Builder section, add a "Large taxonomies (background jobs)" subsection covering: `#` comment lines ignored; limits (sync create 500, preview/jobs 50,000); 5 MB body limit (413 above); the five job endpoints with their status codes exactly as in the spec table (202 / 400 `{errors, errorCount}` / 409 `{error, jobId}`; 200 list; 200 status / 404; 200 report with `Content-Disposition`; 200 cancel / 409 `job is not running` / 404); one running job per env; jobs live in memory (a restart loses them — re-run the outline, existing items are merged); visibility (global admin all envs, env key own env); `CONCURRENCY = 4`; the `[taxonomy-job]` log lines. Keep the section's existing style.

- [ ] **Step 6: Run tests, verify they pass**

Run: `node --test test/neon-env/taxonomy-routes.test.js` → PASS. Then `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/requestHandlers/taxonomy-builder.js server.js README.md test/neon-env/taxonomy-routes.test.js
git commit -m "feat(taxonomy-builder): job endpoints, 5 MB body limit, 50k preview"
```

---

### Task 5: Widget — file load, summary preview, job progress, jobs list

**Files:**
- Modify: `src/react-widgets/src/taxonomy-builder/api.js`
- Modify: `src/react-widgets/src/taxonomy-builder/TaxonomyBuilderWidget.jsx`
- Modify: `src/react-widgets/src/taxonomy-builder/taxonomy-builder.css`
- Rebuild: `public/js/react/taxonomy-builder.js`, `public/js/react/taxonomy-builder.css`

**Interfaces:**
- Consumes: endpoints from Task 4; preview `mode: 'full' | 'summary'` from Task 2; job status/summary views from Task 3.

- [ ] **Step 1: `api.js`**

Replace with:

```js
function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';
const apiKey = () => window.CONFIG?.apiKey ?? '';
const url = (path) => `${BASE_URL}/api/neon/taxonomy-builder/${path}${window.CONFIG?.demo ? '?demo=true' : ''}`;

async function request(method, path, body) {
  const headers = { apikey: apiKey() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const jobPath = (jobId, suffix = '') => `jobs/${encodeURIComponent(jobId)}${suffix}`;

export const previewTaxonomy = (body) => request('POST', 'preview', body);
export const startJob = (body) => request('POST', 'jobs', body);
export const listJobs = () => request('GET', 'jobs');
export const getJob = (jobId) => request('GET', jobPath(jobId));
export const cancelJob = (jobId) => request('POST', jobPath(jobId, '/cancel'), {});

export async function downloadReport(jobId) {
  const response = await fetch(url(jobPath(jobId, '/report')), { headers: { apikey: apiKey() } });
  if (!response.ok) throw new Error(`Report download failed (HTTP ${response.status})`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${jobId}-report.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
```

- [ ] **Step 2: `TaxonomyBuilderWidget.jsx`**

Replace with:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { previewTaxonomy, startJob, listJobs, getJob, cancelJob, downloadReport } from './api.js';

const CATEGORY_PLACEHOLDER = '# lines starting with # are ignored\nGruppoBello\n  Livello 1\n    Livello 2';
const TAG_PLACEHOLDER = 'Nuova Famiglia\n  Nuovo Tag';
const LABEL = { new: 'New', exists: 'Exists', created: 'Created', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' };
const BIG_LINES = 2000;
const POLL_MS = 2000;
const ZERO = { created: 0, exists: 0, failed: 0, skipped: 0 };

function insertTab(e, value, setValue) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const { selectionStart: start, selectionEnd: end } = el;
  setValue(`${value.slice(0, start)}  ${value.slice(end)}`);
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
}

function countLines(text) {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

const fmt = (n) => Number(n || 0).toLocaleString();

function elapsed(from, to) {
  if (!from) return '';
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function countsLine(c) {
  return `${fmt(c.created)} created · ${fmt(c.exists)} existing · ${fmt(c.failed)} failed · ${fmt(c.skipped)} skipped`;
}

function Tree({ items }) {
  return (
    <ul className="tbw-tree">
      {items.map((i) => (
        <li key={`${i.kind}:${i.path}`} style={{ paddingLeft: `${(i.depth - 1) * 20}px` }}>
          <span className={`tbw-badge tbw-${i.status}`}>{LABEL[i.status] || i.status}</span>{' '}
          <span className={i.kind === 'family' ? 'tbw-family' : ''}>{i.name}</span>
        </li>
      ))}
    </ul>
  );
}

function OutlineField({ id, label, value, onChange, placeholder, disabled }) {
  const [fileName, setFileName] = useState(null);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);
  const lines = useMemo(() => countLines(value), [value]);
  const asChip = lines > BIG_LINES && !editing;

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setFileName(file.name); setEditing(false); onChange(String(reader.result || '')); };
    reader.onerror = () => window.alert(`Could not read ${file.name}`);
    reader.readAsText(file, 'UTF-8');
  }

  function clear() { setFileName(null); setEditing(false); onChange(''); }

  return (
    <div className="tbw-field">
      <div className="tbw-field-head">
        <label className="tbw-label" htmlFor={id}>{label}</label>
        <button type="button" className="tbw-link" disabled={disabled} onClick={() => fileRef.current && fileRef.current.click()}>Load .txt file</button>
        <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={onFile} />
      </div>
      {asChip ? (
        <div className="tbw-chip" id={id}>
          {fmt(lines)} lines loaded{fileName ? ` from ${fileName}` : ''}
          {' · '}<button type="button" className="tbw-link" disabled={disabled} onClick={clear}>Clear</button>
          {' · '}<button type="button" className="tbw-link" disabled={disabled} onClick={() => setEditing(true)}>Edit</button>
        </div>
      ) : (
        <textarea id={id} className="tbw-outline" value={value} placeholder={placeholder} spellCheck={false} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => insertTab(e, value, onChange)} />
      )}
    </div>
  );
}

function ErrorList({ errors, errorCount }) {
  if (!errors || errors.length === 0) return null;
  const more = (errorCount || errors.length) - errors.length;
  return (
    <ul className="tbw-errors">
      {errors.map((err, i) => <li key={`${i}:${err}`}>{err}</li>)}
      {more > 0 && <li className="tbw-muted">…and {fmt(more)} more</li>}
    </ul>
  );
}

function SummaryPreview({ preview }) {
  return (
    <>
      <table className="tbw-levels">
        <thead><tr><th>Outline</th><th>Depth</th><th>Kind</th><th>Total</th><th>New</th><th>Exists</th></tr></thead>
        <tbody>
          {preview.levels.map((l) => (
            <tr key={`${l.outline}:${l.depth}`}>
              <td>{l.outline}</td><td>{l.depth}</td><td>{l.kind}</td><td>{fmt(l.total)}</td><td>{fmt(l.new)}</td><td>{fmt(l.exists)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tbw-muted">{fmt(preview.total)} items. Showing the first {preview.sample.categories.length} categories and {preview.sample.tags.length} tags.</p>
      {preview.sample.categories.length > 0 && (<><h3>Categories (sample)</h3><Tree items={preview.sample.categories} /></>)}
      {preview.sample.tags.length > 0 && (<><h3>Tags (sample)</h3><Tree items={preview.sample.tags} /></>)}
    </>
  );
}

function JobPanel({ job, cancelling, onCancel, onClose }) {
  const [downloadError, setDownloadError] = useState(null);
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const running = job.state === 'running';
  async function onDownload() {
    setDownloadError(null);
    try { await downloadReport(job.jobId); } catch (e) { setDownloadError(e.message); }
  }
  return (
    <div className="tbw-job">
      <h2>Job <code>{job.jobId}</code> <span className={`tbw-badge tbw-${job.state}`}>{job.state}</span></h2>
      <div className="tbw-progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="tbw-muted">
        {fmt(job.done)} / {fmt(job.total)} ({pct}%) · {countsLine(job.counts || ZERO)}
        {job.phase ? ` · ${job.phase}` : ''} · {elapsed(job.createdAt, job.finishedAt)}
      </p>
      {job.error && <p className="tbw-error">{job.error}</p>}
      {running ? (
        <button type="button" className="tbw-button tbw-secondary" disabled={cancelling} onClick={onCancel}>{cancelling ? 'Cancelling…' : 'Cancel'}</button>
      ) : (
        <>
          {job.failureCount > 0 && (
            <>
              <h3>Failures ({fmt(job.failureCount)})</h3>
              <ul className="tbw-failures">
                {(job.failures || []).map((f, i) => <li key={i}><code>{f.outline}</code> {f.path}: <span className="tbw-error">{f.error}</span></li>)}
              </ul>
              {job.failureCount > (job.failures || []).length && <p className="tbw-muted">…and {fmt(job.failureCount - job.failures.length)} more in the full report</p>}
            </>
          )}
          <div className="tbw-actions">
            {job.state !== 'lost' && <button type="button" className="tbw-button" onClick={onDownload}>Download full report</button>}
            <button type="button" className="tbw-button tbw-secondary" onClick={onClose}>Close</button>
          </div>
          {downloadError && <p className="tbw-error">{downloadError}</p>}
        </>
      )}
    </div>
  );
}

function JobsList({ jobs, currentId, onOpen }) {
  if (!jobs.length) return null;
  return (
    <div className="tbw-jobs">
      <h3>Recent jobs</h3>
      <ul>
        {jobs.map((j) => (
          <li key={j.jobId}>
            <span className={`tbw-badge tbw-${j.state}`}>{j.state}</span>{' '}
            <code>{j.jobId}</code> <span className="tbw-muted">{j.envId} · {fmt(j.done)}/{fmt(j.total)} · {fmt(j.counts.failed)} failed · {new Date(j.createdAt).toLocaleString()}</span>{' '}
            {j.jobId !== currentId && <button type="button" className="tbw-link" onClick={() => onOpen(j.jobId)}>Open</button>}
          </li>
        ))}
      </ul>
    </div>
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [job, setJob] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [jobs, setJobs] = useState([]);
  const requestSeq = useRef(0);

  const refreshJobs = useCallback(async () => {
    try {
      const { status, data } = await listJobs();
      if (status === 200 && Array.isArray(data?.jobs)) setJobs(data.jobs);
    } catch { /* the list is informative only */ }
  }, []);

  useEffect(() => { refreshJobs(); }, [refreshJobs]);

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
        const ok = status === 200 && data && (data.mode === 'summary' ? Array.isArray(data.levels) : Array.isArray(data.categories));
        if (ok) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data?.error || (data?.errors || []).join('; ') || `Preview failed (HTTP ${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [categories, tags, defaultLanguage, refreshKey]);

  const jobId = job?.jobId;
  const jobRunning = job?.state === 'running';

  useEffect(() => {
    if (!jobId || !jobRunning) return undefined;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const { status, data } = await getJob(jobId);
        if (stopped) return;
        if (status === 200 && data?.jobId === jobId) setJob(data);
        else if (status === 404) setJob((j) => (j && j.jobId === jobId ? { ...j, state: 'lost', error: 'Job not found (the server may have restarted). Re-run the outline: existing items are merged.' } : j));
      } catch { /* transient: next poll retries */ }
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [jobId, jobRunning]);

  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !jobRunning) { setCancelling(false); refreshJobs(); setRefreshKey((k) => k + 1); }
    wasRunning.current = jobRunning;
  }, [jobRunning, refreshJobs]);

  const errors = preview?.errors || [];
  const toCreate = preview?.toCreate || 0;
  const busy = starting || jobRunning;
  const canCreate = !!preview && errors.length === 0 && toCreate > 0 && !loading && !busy;

  async function openJob(id) {
    setStartError(null);
    try {
      const { status, data } = await getJob(id);
      if (status === 200 && data?.jobId) setJob(data);
      else setStartError({ errors: [data?.error || `Could not open job (HTTP ${status})`] });
    } catch (e) { setStartError({ errors: [e.message] }); }
  }

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create ${fmt(toCreate)} items in ${envLabel}? This runs as a background job.`)) return;
    setStarting(true);
    setStartError(null);
    try {
      const { status, data } = await startJob({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
      if (status === 202 && data?.jobId) {
        setJob({ jobId: data.jobId, state: 'running', total: data.total, done: 0, counts: ZERO, failures: [], failureCount: 0, createdAt: new Date().toISOString(), finishedAt: null, phase: null });
        refreshJobs();
      } else if (status === 409 && data?.jobId) {
        setStartError({ errors: [data.error], conflictJobId: data.jobId });
      } else {
        setStartError({ errors: data?.errors || [data?.error || `Start failed (HTTP ${status})`], errorCount: data?.errorCount });
      }
    } catch (e) {
      setStartError({ errors: [e.message] });
    } finally {
      setStarting(false);
    }
  }

  async function onCancel() {
    if (!job || !window.confirm(`Cancel job ${job.jobId}? Items already created stay in Neon.`)) return;
    setCancelling(true);
    try {
      const { status, data } = await cancelJob(job.jobId);
      if (status === 200 && data?.jobId) setJob(data);
      else { setCancelling(false); if (status === 409) openJob(job.jobId); }
    } catch { setCancelling(false); }
  }

  return (
    <div className="tbw">
      <header className="tbw-header">
        <h1>Taxonomy Builder</h1>
        <span className="tbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>
      <div className="tbw-body">
        <section className="tbw-form">
          <OutlineField id="tbw-categories" label="Categories (top level = family, indent to nest)" value={categories} onChange={setCategories} placeholder={CATEGORY_PLACEHOLDER} disabled={busy} />
          <OutlineField id="tbw-tags" label="Tags (top level = family, indented once = tag)" value={tags} onChange={setTags} placeholder={TAG_PLACEHOLDER} disabled={busy} />
          <label className="tbw-label" htmlFor="tbw-lang">Default language (new category families)</label>
          <input id="tbw-lang" className="tbw-input" disabled={busy} value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} />
          <button type="button" className="tbw-button" disabled={!canCreate} onClick={onCreate}>
            {starting ? 'Starting…' : `Create ${fmt(toCreate)} item${toCreate === 1 ? '' : 's'}`}
          </button>
          {startError && (
            <div className="tbw-start-error">
              <ErrorList errors={startError.errors} errorCount={startError.errorCount} />
              {startError.conflictJobId && <button type="button" className="tbw-link" onClick={() => openJob(startError.conflictJobId)}>Open running job</button>}
            </div>
          )}
          <JobsList jobs={jobs} currentId={jobId} onOpen={openJob} />
        </section>
        <section className="tbw-preview" aria-live="polite">
          {job && <JobPanel job={job} cancelling={cancelling} onCancel={onCancel} onClose={() => setJob(null)} />}
          <h2>Preview {loading && <span className="tbw-muted">updating…</span>}</h2>
          {previewError && <p className="tbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="tbw-muted">Type or load categories or tags to see the preview.</p>}
          {preview && (
            <>
              <ErrorList errors={errors} errorCount={preview.errorCount} />
              <p className="tbw-muted">{fmt(toCreate)} to create</p>
              {preview.mode === 'summary' ? <SummaryPreview preview={preview} /> : (
                <>
                  {preview.categories.length > 0 && (<><h3>Categories</h3><Tree items={preview.categories} /></>)}
                  {preview.tags.length > 0 && (<><h3>Tags</h3><Tree items={preview.tags} /></>)}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS**

Append to `src/react-widgets/src/taxonomy-builder/taxonomy-builder.css` (reuse the existing tokens; read the file first and keep the existing badge classes, adding only those missing):

```css
.tbw-field { display: flex; flex-direction: column; gap: 4px; }
.tbw-field-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 8px; }
.tbw-field:first-child .tbw-field-head { margin-top: 0; }
.tbw-field-head .tbw-label { margin-top: 0; }

.tbw-link {
  background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--fg-link, #4f46e5); font: inherit; font-size: var(--fs-sm, 12px);
}
.tbw-link:disabled { color: var(--fg-disabled, #a9a7b8); cursor: default; }

.tbw-chip {
  padding: 10px 12px;
  border: 1px dashed var(--border-default, #dddce5);
  border-radius: var(--radius-md, 8px);
  background: var(--bg-subtle, #f4f4f7);
  font-size: var(--fs-sm, 12px);
}

.tbw-levels { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: var(--fs-sm, 12px); }
.tbw-levels th, .tbw-levels td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border-default, #dddce5); }
.tbw-levels td:nth-child(n+4), .tbw-levels th:nth-child(n+4) { text-align: right; font-variant-numeric: tabular-nums; }

.tbw-job {
  margin-bottom: 16px; padding: 12px;
  border: 1px solid var(--border-default, #dddce5);
  border-radius: var(--radius-md, 8px);
}
.tbw-progress { height: 8px; border-radius: 4px; background: var(--bg-subtle, #f4f4f7); overflow: hidden; margin: 8px 0; }
.tbw-progress > div { height: 100%; background: var(--accent, #4f46e5); transition: width 0.3s ease; }
.tbw-failures { max-height: 240px; overflow: auto; margin: 4px 0 8px; padding-left: 16px; font-size: var(--fs-sm, 12px); }
.tbw-actions { display: flex; gap: 8px; margin-top: 8px; }
.tbw-secondary { background: var(--bg-surface, #fff); color: var(--fg-primary, #3f3c4e); border: 1px solid var(--border-default, #dddce5); }

.tbw-jobs { margin-top: 16px; }
.tbw-jobs ul { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm, 12px); }

.tbw-running, .tbw-pending { background: var(--bg-info-subtle, #e8f0fe); color: var(--fg-info, #1d4ed8); }
.tbw-completed { background: var(--bg-success-subtle, #e7f6ec); color: var(--fg-success, #1f7a3a); }
.tbw-cancelled, .tbw-lost { background: var(--bg-warning-subtle, #fff4e0); color: var(--fg-warning, #9a5b00); }
```

If `.tbw-failed` already styles failed badges, do not redefine it; the job `failed` state reuses it. Check `.tbw-button` exists (it does) before relying on `.tbw-secondary` overriding it — place the new rules after it.

- [ ] **Step 4: Build**

Run: `cd src/react-widgets && npm run build:taxonomy-builder` (from the worktree). Expected: build succeeds and writes `public/js/react/taxonomy-builder.js` and `.css` in the worktree root (check with `git status`). If `node_modules` is missing in `src/react-widgets`, run `npm ci` there first (no new dependencies).

- [ ] **Step 5: Demo smoke test**

Start the server on a spare port with demo mode and a 35k file, then stop it:

```bash
PORT=3998 node server.js > /tmp/tbw-smoke.log 2>&1 &
SERVER=$!
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3998/widgets/taxonomy-builder?demo=true"
kill $SERVER
```

Expected: `200`. (Use the scratch log only for diagnosis; delete it after.) Never touch port 54861.

- [ ] **Step 6: Run the suite**

Run: `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/react-widgets/src/taxonomy-builder public/js/react/taxonomy-builder.js public/js/react/taxonomy-builder.css
git commit -m "feat(taxonomy-builder widget): load .txt files, summary preview, background job progress and reports"
```
