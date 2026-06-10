# Delayed Importer Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API-only service that imports a submitted batch of stories/images into a Neon workfolder one item at a time, spread evenly over a caller-supplied timespan.

**Architecture:** New core module `src/delayed-importer.js` (in-memory job store, `setTimeout` chain scheduler, per-item dispatch to existing import machinery) + new handler module `src/requestHandlers/neon-delayed-import.js` (auth/validation/HTTP), 4 routes registered in `server.js` under `/in/delayed-import`. Two small backward-compatible changes to existing modules: `stories-populator.js` resolves with `familyRef`, `images-importer.js` accepts optional image metadata.

**Tech Stack:** Node 20, Fastify (existing), `node:test` built-in runner with mocked timers, dayjs (existing dep). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-10-delayed-importer-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/delayed-importer.js` | Create | Payload validation, job store (`Map`), scheduler, item dispatch mapping |
| `src/requestHandlers/neon-delayed-import.js` | Create | Fastify handlers: auth guard, request/response mapping, status codes |
| `src/stories-populator.js` | Modify | `newNodeFromStory` resolves with `familyRef` (was `resolve()` with no value) |
| `src/images-importer.js` | Modify | Extract `buildImageMetadataXml(metadata)`, inject caption/credit into IPTC XML |
| `server.js` | Modify | Register 4 routes |
| `package.json` | Modify | Add new test files to `test` script |
| `test/delayed-importer.test.js` | Create | Validation, scheduler, dispatcher unit tests |
| `test/images-importer-metadata.test.js` | Create | Metadata XML builder tests |

Conventions to follow (from existing code): handlers use `authenticate()` from `helpers/auth.js` + `safeLogRequest` + `console.log` IN/OUT blocks; errors logged with `❌` prefix; tests are `'use strict'` + `node:test` + `assert/strict` (see `test/connectors/connector-registry.test.js`).

---

### Task 1: Payload validation in core module

**Files:**
- Create: `src/delayed-importer.js`
- Create: `test/delayed-importer.test.js`

- [ ] **Step 1: Write failing tests for `validatePayload`**

Create `test/delayed-importer.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const delayedImporter = require('../src/delayed-importer.js');

function basePayload(overrides = {}) {
  return {
    duration: 1,
    site: 'demo-site',
    workspace: 'Demo Workspace',
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'story', title: 'B', content: '<p>b</p>' },
      { type: 'story', title: 'C', content: '<p>c</p>' },
    ],
    ...overrides,
  };
}

test('validatePayload accepts a valid mixed payload', () => {
  const payload = basePayload({
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'image', url: 'https://example.com/pic.jpg' },
    ],
  });
  assert.deepEqual(delayedImporter.validatePayload(payload), { valid: true });
});

test('validatePayload rejects missing body', () => {
  assert.equal(delayedImporter.validatePayload(null).valid, false);
});

test('validatePayload rejects bad duration', () => {
  for (const duration of [undefined, 0, -5, 'ten']) {
    const result = delayedImporter.validatePayload(basePayload({ duration }));
    assert.equal(result.valid, false);
    assert.match(result.error, /duration/);
  }
});

test('validatePayload rejects missing site or workspace', () => {
  assert.match(delayedImporter.validatePayload(basePayload({ site: undefined })).error, /site/);
  assert.match(delayedImporter.validatePayload(basePayload({ workspace: undefined })).error, /workspace/);
});

test('validatePayload rejects empty or missing items', () => {
  assert.equal(delayedImporter.validatePayload(basePayload({ items: [] })).valid, false);
  assert.equal(delayedImporter.validatePayload(basePayload({ items: undefined })).valid, false);
});

test('validatePayload rejects invalid item type with index in message', () => {
  const payload = basePayload({
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'video', url: 'https://example.com/x' },
    ],
  });
  const result = delayedImporter.validatePayload(payload);
  assert.equal(result.valid, false);
  assert.match(result.error, /items\[1\]/);
});

test('validatePayload enforces per-type required fields', () => {
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'story', content: '<p>a</p>' }] })).error,
    /items\[0\].*title/
  );
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'story', title: 'A' }] })).error,
    /items\[0\].*content/
  );
  assert.match(
    delayedImporter.validatePayload(basePayload({ items: [{ type: 'image' }] })).error,
    /items\[0\].*url/
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/delayed-importer.test.js`
Expected: FAIL — `Cannot find module '../src/delayed-importer.js'`

- [ ] **Step 3: Create `src/delayed-importer.js` with `validatePayload`**

```js
/**
 * Delayed Importer — simulates a content feed into Neon.
 * Accepts a batch of items (stories/images) and imports them one at a time,
 * spread evenly over a caller-supplied timespan, into a target workfolder.
 *
 * In-memory only: jobs are lost on server restart (documented limitation).
 * Spec: docs/superpowers/specs/2026-06-10-delayed-importer-design.md
 */
const crypto = require('crypto');
const dayjs = require('dayjs');
const storiesPopulator = require('./stories-populator.js');
const imagesImporter = require('./images-importer.js');
const utils = require('./helpers/utils.js');

const ITEM_TYPES = ['story', 'image'];

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Missing request body' };
  }
  if (typeof body.duration !== 'number' || !(body.duration > 0)) {
    return { valid: false, error: 'duration must be a number of minutes greater than 0' };
  }
  if (!body.site || typeof body.site !== 'string') {
    return { valid: false, error: 'site is required' };
  }
  if (!body.workspace || typeof body.workspace !== 'string') {
    return { valid: false, error: 'workspace is required' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { valid: false, error: 'items must be a non-empty array' };
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `items[${i}]: must be an object` };
    }
    if (!ITEM_TYPES.includes(item.type)) {
      return { valid: false, error: `items[${i}]: type must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.type === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.type === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
  }
  return { valid: true };
}

module.exports = {
  validatePayload,
};
```

(`crypto`, `dayjs`, `storiesPopulator`, `imagesImporter`, `utils` are unused until Tasks 2 and 4 — keep the requires now so the file structure is final.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/delayed-importer.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/delayed-importer.js test/delayed-importer.test.js
git commit -m "feat: add delayed importer payload validation"
```

---

### Task 2: Job store and scheduler

**Files:**
- Modify: `src/delayed-importer.js`
- Modify: `test/delayed-importer.test.js`

- [ ] **Step 1: Write failing scheduler tests**

Append to `test/delayed-importer.test.js`:

```js
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('createJob fires first item immediately, then one per interval, then completes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => delayedImporter._reset());

  const calls = [];
  const deps = {
    dispatchStory: async (item) => {
      calls.push(item.title);
      return { familyRef: 'ref-' + item.title };
    },
  };

  const submitted = delayedImporter.createJob(basePayload(), deps);
  assert.match(submitted.jobId, /^dlyimp-\d{8}-[0-9a-f]{6}$/);
  assert.equal(submitted.itemCount, 3);
  assert.equal(submitted.intervalMs, 20000); // 1 min / 3 items
  assert.ok(submitted.estimatedEndAt);

  t.mock.timers.tick(0);
  await flush();
  assert.deepEqual(calls, ['A']);

  const running = delayedImporter.getJob(submitted.jobId);
  assert.equal(running.state, 'running');
  assert.equal(running.done, 1);
  assert.equal(running.total, 3);
  assert.ok(running.nextFireAt);
  assert.equal(running.results[0].status, 'ok');
  assert.equal(running.results[0].familyRef, 'ref-A');

  t.mock.timers.tick(20000);
  await flush();
  t.mock.timers.tick(20000);
  await flush();

  assert.deepEqual(calls, ['A', 'B', 'C']);
  const finished = delayedImporter.getJob(submitted.jobId);
  assert.equal(finished.state, 'completed');
  assert.equal(finished.done, 3);
  assert.equal(finished.nextFireAt, null);
});

test('per-item errors are recorded and the job continues', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => delayedImporter._reset());

  const deps = {
    dispatchStory: async (item) => {
      if (item.title === 'B') throw new Error('neon exploded');
      return { familyRef: 'ref-' + item.title };
    },
  };

  const submitted = delayedImporter.createJob(basePayload(), deps);
  t.mock.timers.tick(0);
  await flush();
  t.mock.timers.tick(20000);
  await flush();
  t.mock.timers.tick(20000);
  await flush();

  const job = delayedImporter.getJob(submitted.jobId);
  assert.equal(job.state, 'completed');
  assert.equal(job.done, 3);
  assert.equal(job.errors, 1);
  assert.equal(job.results[1].status, 'error');
  assert.equal(job.results[1].error, 'neon exploded');
});

test('cancelJob stops pending ticks and keeps completed results', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => delayedImporter._reset());

  const calls = [];
  const deps = {
    dispatchStory: async (item) => {
      calls.push(item.title);
      return { familyRef: 'ref-' + item.title };
    },
  };

  const submitted = delayedImporter.createJob(basePayload(), deps);
  t.mock.timers.tick(0);
  await flush();

  const snapshot = delayedImporter.cancelJob(submitted.jobId);
  assert.equal(snapshot.state, 'cancelled');
  assert.equal(snapshot.done, 1);

  t.mock.timers.tick(60000);
  await flush();
  assert.deepEqual(calls, ['A']); // no further dispatches

  // cancelling again -> already finished
  assert.deepEqual(delayedImporter.cancelJob(submitted.jobId), { error: 'Job already finished' });
});

test('cancelJob and getJob return null for unknown job', () => {
  assert.equal(delayedImporter.getJob('nope'), null);
  assert.equal(delayedImporter.cancelJob('nope'), null);
});

test('listJobs returns summaries without results array', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => delayedImporter._reset());

  const deps = { dispatchStory: async () => ({ familyRef: 'x' }) };
  const submitted = delayedImporter.createJob(basePayload(), deps);
  t.mock.timers.tick(0);
  await flush();

  const list = delayedImporter.listJobs();
  assert.equal(list.length, 1);
  assert.equal(list[0].jobId, submitted.jobId);
  assert.equal(list[0].state, 'running');
  assert.equal(list[0].done, 1);
  assert.equal(list[0].total, 3);
  assert.equal(list[0].results, undefined);
});

test('image items route to dispatchImage', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => delayedImporter._reset());

  const types = [];
  const deps = {
    dispatchStory: async () => { types.push('story'); return { familyRef: 's' }; },
    dispatchImage: async () => { types.push('image'); return { familyRef: 'i' }; },
  };
  const payload = basePayload({
    items: [
      { type: 'image', url: 'https://example.com/a.jpg' },
      { type: 'story', title: 'A', content: '<p>a</p>' },
    ],
  });
  delayedImporter.createJob(payload, deps);
  t.mock.timers.tick(0);
  await flush();
  t.mock.timers.tick(30000);
  await flush();
  assert.deepEqual(types, ['image', 'story']);
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `node --test test/delayed-importer.test.js`
Expected: validation tests PASS; new tests FAIL with `delayedImporter.createJob is not a function`

- [ ] **Step 3: Implement job store and scheduler**

Add to `src/delayed-importer.js` (below `validatePayload`, above `module.exports`), and extend the exports:

```js
const EVICTION_MS = 60 * 60 * 1000; // finished jobs evicted after 1 hour

const jobs = new Map();

function resolveWorkfolder(item, job) {
  return item.workfolder || job.workfolder || job.workspace;
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    errors: job.results.filter((r) => r.status === 'error').length,
    intervalMs: job.intervalMs,
    startedAt: job.startedAt,
    estimatedEndAt: job.estimatedEndAt,
    nextFireAt: job.nextFireAt,
    results: job.results,
  };
}

function finishJob(job, state) {
  job.state = state;
  job.nextFireAt = null;
  if (job.timer) clearTimeout(job.timer);
  job.timer = null;
  const evictionTimer = setTimeout(() => jobs.delete(job.jobId), EVICTION_MS);
  if (evictionTimer.unref) evictionTimer.unref();
}

async function runTick(job, index, deps) {
  if (job.state !== 'running') return;

  const item = job.items[index];
  try {
    const dispatch = item.type === 'story' ? deps.dispatchStory : deps.dispatchImage;
    const outcome = await dispatch(item, job);
    job.results.push({
      index,
      type: item.type,
      status: 'ok',
      familyRef: outcome?.familyRef || null,
      at: new Date().toISOString(),
    });
    console.log(`delayed-import ${job.jobId}: item ${index} (${item.type}) imported`);
  } catch (error) {
    console.error(`❌ delayed-import ${job.jobId}: item ${index} (${item.type}) failed: ${error.message}`);
    job.results.push({
      index,
      type: item.type,
      status: 'error',
      error: error.message,
      at: new Date().toISOString(),
    });
  }

  if (job.state !== 'running') return; // cancelled while dispatching

  const next = index + 1;
  if (next >= job.items.length) {
    finishJob(job, 'completed');
    console.log(`delayed-import ${job.jobId}: completed (${job.results.length} items)`);
    return;
  }
  job.nextFireAt = new Date(Date.now() + job.intervalMs).toISOString();
  job.timer = setTimeout(() => runTick(job, next, deps), job.intervalMs);
}

/**
 * Schedules a new job. Payload must already be validated with validatePayload.
 * `deps` is for tests only — production callers use the default dispatchers.
 * Returns the submit response: { jobId, itemCount, intervalMs, estimatedEndAt }.
 */
function createJob(body, deps = {}) {
  const dispatchers = {
    dispatchStory: deps.dispatchStory || dispatchStoryItem,
    dispatchImage: deps.dispatchImage || dispatchImageItem,
  };

  const itemCount = body.items.length;
  const intervalMs = Math.round((body.duration * 60000) / itemCount);
  const jobId = `dlyimp-${dayjs().format('YYYYMMDD')}-${crypto.randomBytes(3).toString('hex')}`;
  const now = Date.now();

  const job = {
    jobId,
    state: 'running',
    site: body.site,
    workspace: body.workspace,
    workfolder: body.workfolder || null,
    publish: body.publish === true,
    items: body.items,
    intervalMs,
    startedAt: new Date(now).toISOString(),
    estimatedEndAt: new Date(now + intervalMs * (itemCount - 1)).toISOString(),
    nextFireAt: new Date(now).toISOString(),
    results: [],
    timer: null,
  };
  jobs.set(jobId, job);

  // first item fires immediately (next tick, after the 202 is sent)
  job.timer = setTimeout(() => runTick(job, 0, dispatchers), 0);

  return { jobId, itemCount, intervalMs, estimatedEndAt: job.estimatedEndAt };
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

function listJobs() {
  return Array.from(jobs.values()).map((job) => ({
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    nextFireAt: job.nextFireAt,
  }));
}

/**
 * Returns null if unknown, { error } if already finished,
 * otherwise the cancelled job snapshot. Imported items are not rolled back.
 */
function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.state !== 'running') return { error: 'Job already finished' };
  finishJob(job, 'cancelled');
  console.log(`delayed-import ${jobId}: cancelled after ${job.results.length} items`);
  return publicJob(job);
}

/** Test helper: clears all jobs and pending timers. */
function _reset() {
  for (const job of jobs.values()) {
    if (job.timer) clearTimeout(job.timer);
  }
  jobs.clear();
}
```

`dispatchStoryItem` / `dispatchImageItem` don't exist until Task 4 — add temporary stubs right above `createJob` so the module loads (they are replaced in Task 4):

```js
async function dispatchStoryItem(item, job) {
  throw new Error('not implemented yet — Task 4');
}

async function dispatchImageItem(item, job) {
  throw new Error('not implemented yet — Task 4');
}
```

Replace the exports block:

```js
module.exports = {
  validatePayload,
  createJob,
  getJob,
  listJobs,
  cancelJob,
  dispatchStoryItem,
  dispatchImageItem,
  _reset,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/delayed-importer.test.js`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/delayed-importer.js test/delayed-importer.test.js
git commit -m "feat: add delayed importer job store and scheduler"
```

---

### Task 3: `newNodeFromStory` resolves with familyRef

**Files:**
- Modify: `src/stories-populator.js:62-101`

Why: the delayed importer records the created node's `familyRef` per item, but `newNodeFromStory` currently calls `resolve()` with no value (and bare `reject()`). Returning the ref is backward compatible — existing callers (`populateNeonInstance`, `testStoryTranslations`) ignore the resolved value.

No unit test (function is a thin orchestration over live Neon calls; repo has no mocking infrastructure for it). Covered by Task 7 manual verification.

- [ ] **Step 1: Change the three resolution points in `newNodeFromStory`**

In `src/stories-populator.js`, inside `newNodeFromStory`:

1. Success branch — replace `resolve();` (after the publish/revision if/else, line ~91) with:

```js
                resolve(familyRef);
```

2. Content-update-failure branch — replace `resolve();` (after `deleteNode`, line ~95) with:

```js
                resolve(null);
```

3. No-familyRef branch — replace `reject();` (line ~98) with:

```js
            reject(new Error(`Story node creation failed for "${story.title || story.id}"`));
```

- [ ] **Step 2: Sanity check — module still loads and existing tests pass**

Run: `node -e "require('./src/stories-populator.js'); console.log('ok')" && npm test`
Expected: `ok`, existing connector tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/stories-populator.js
git commit -m "fix: newNodeFromStory resolves with familyRef and rejects with Error"
```

---

### Task 4: Item dispatchers

**Files:**
- Modify: `src/delayed-importer.js` (replace Task 2 stubs)
- Modify: `test/delayed-importer.test.js`

- [ ] **Step 1: Write failing dispatcher tests**

Append to `test/delayed-importer.test.js`:

```js
test('dispatchStoryItem maps item fields to populator story shape', async () => {
  let received;
  const fakePopulator = {
    newNodeFromStory: async (story, publish) => {
      received = { story, publish };
      return 'fam-1';
    },
  };
  const job = { site: 'demo-site', workspace: 'Demo Workspace', workfolder: '/Demo/Imports', publish: false };
  const item = {
    type: 'story',
    title: 'Headline',
    content: '<p>body</p>',
    summary: 'Standfirst',
    byline: 'Jane Doe',
    metadata: { seoTitle: 'seo' },
  };

  const out = await delayedImporter.dispatchStoryItem(item, job, fakePopulator);

  assert.equal(out.familyRef, 'fam-1');
  assert.equal(received.publish, false);
  assert.equal(received.story.title, 'Headline');
  assert.equal(received.story.headline, 'Headline');
  assert.equal(received.story.mainContentHtml, '<p>body</p>');
  assert.equal(received.story.summary, 'Standfirst');
  assert.equal(received.story.byline, 'Jane Doe');
  assert.deepEqual(received.story.metadata, { seoTitle: 'seo' });
  assert.equal(received.story.tgtSite, 'demo-site');
  assert.equal(received.story.tgtWorkspace, '/Demo/Imports');
  // must NOT leak item.type: getCreationOptions would use it as the Neon node type
  assert.equal(received.story.type, undefined);
  // no figureUrl: uploadImageFromStory must no-op
  assert.equal(received.story.figureUrl, undefined);
});

test('dispatchStoryItem: item workfolder overrides job workfolder', async () => {
  let received;
  const fakePopulator = { newNodeFromStory: async (story) => { received = story; return 'x'; } };
  const job = { site: 's', workspace: 'ws', workfolder: '/job-wf', publish: false };

  await delayedImporter.dispatchStoryItem(
    { type: 'story', title: 'T', content: 'c', workfolder: '/item-wf' },
    job,
    fakePopulator
  );
  assert.equal(received.tgtWorkspace, '/item-wf');
});

test('dispatchImageItem maps item to uploadImage options with workspace fallback', async () => {
  let received;
  const fakeImporter = {
    uploadImage: async (options) => {
      received = options;
      return { familyRef: 'img-1' };
    },
  };
  const job = { site: 's', workspace: 'Demo Workspace', workfolder: null, publish: false };
  const item = {
    type: 'image',
    url: 'https://example.com/photos/sunset.jpg',
    metadata: { caption: 'A sunset', credit: 'Jane' },
  };

  const out = await delayedImporter.dispatchImageItem(item, job, fakeImporter);

  assert.equal(out.familyRef, 'img-1');
  assert.equal(received.imageUrl, 'https://example.com/photos/sunset.jpg');
  assert.equal(received.workspace, 'Demo Workspace'); // job.workfolder null -> workspace fallback
  assert.equal(received.imageName, 'sunset.jpg'); // derived via utils.getImageNameFromUrl
  assert.deepEqual(received.metadata, { caption: 'A sunset', credit: 'Jane' });
});

test('dispatchImageItem: explicit name wins over derived name', async () => {
  let received;
  const fakeImporter = { uploadImage: async (options) => { received = options; return {}; } };
  const job = { site: 's', workspace: 'ws', workfolder: null, publish: false };

  const out = await delayedImporter.dispatchImageItem(
    { type: 'image', url: 'https://example.com/a.jpg', name: 'custom-name' },
    job,
    fakeImporter
  );
  assert.equal(received.imageName, 'custom-name');
  assert.equal(out.familyRef, null); // uploadImage returned no familyRef
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `node --test test/delayed-importer.test.js`
Expected: new tests FAIL with `not implemented yet — Task 4`

- [ ] **Step 3: Replace the stubs with real dispatchers**

In `src/delayed-importer.js`, replace both Task 2 stub functions with:

```js
/**
 * Story item -> storiesPopulator.newNodeFromStory.
 * Deliberately does NOT copy item.type onto the story: getCreationOptions
 * uses story.type as the Neon node type and must default to 'article'.
 * No figureUrl / language / translate: image upload no-ops, translation skipped.
 */
async function dispatchStoryItem(item, job, populator = storiesPopulator) {
  const story = {
    title: item.title,
    headline: item.title,
    summary: item.summary || '',
    byline: item.byline || '',
    mainContentHtml: item.content,
    metadata: item.metadata || {},
    tgtSite: job.site,
    tgtWorkspace: resolveWorkfolder(item, job),
  };
  const familyRef = await populator.newNodeFromStory(story, job.publish);
  return { familyRef: familyRef || null };
}

/** Image item -> imagesImporter.uploadImage. Image fetched live at tick time. */
async function dispatchImageItem(item, job, importer = imagesImporter) {
  const imageName = item.name || utils.getImageNameFromUrl(item.url) || `image-${Date.now()}`;
  const node = await importer.uploadImage({
    imageName,
    imageUrl: item.url,
    workspace: resolveWorkfolder(item, job),
    metadata: item.metadata || {},
  });
  return { familyRef: node?.familyRef || null };
}
```

Note: `resolveWorkfolder` was defined in Task 2; if dispatchers end up above it in the file, that's fine (function declarations hoist).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/delayed-importer.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Commit**

```bash
git add src/delayed-importer.js test/delayed-importer.test.js
git commit -m "feat: add delayed importer story and image dispatchers"
```

---

### Task 5: Image metadata in `uploadImage`

**Files:**
- Modify: `src/images-importer.js:106-113` (xmlMetadata block) and `:265` (exports)
- Create: `test/images-importer-metadata.test.js`

`uploadImage` currently hardcodes the IPTC XML with an empty `<credit>`. Extract a `buildImageMetadataXml(metadata)` builder that injects XML-escaped `caption`/`credit`. With no metadata the output is byte-identical to today's hardcoded string, so existing callers are unaffected.

- [ ] **Step 1: Write failing tests**

Create `test/images-importer-metadata.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildImageMetadataXml } = require('../src/images-importer.js');

const LEGACY_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
  `<ObjectMetadata>` +
  `<iptc>` +
  `<credit></credit>` +
  `</iptc>` +
  `<WebDesign><WebType>Image</WebType></WebDesign>` +
  `</ObjectMetadata>`;

test('no metadata produces the legacy XML exactly', () => {
  assert.equal(buildImageMetadataXml(), LEGACY_XML);
  assert.equal(buildImageMetadataXml({}), LEGACY_XML);
});

test('credit and caption are injected', () => {
  const xml = buildImageMetadataXml({ caption: 'A sunset', credit: 'Jane Doe' });
  assert.ok(xml.includes('<caption>A sunset</caption>'));
  assert.ok(xml.includes('<credit>Jane Doe</credit>'));
});

test('values are XML-escaped', () => {
  const xml = buildImageMetadataXml({ credit: 'AP <Photos> & "Co"' });
  assert.ok(xml.includes('<credit>AP &lt;Photos&gt; &amp; &quot;Co&quot;</credit>'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/images-importer-metadata.test.js`
Expected: FAIL — `buildImageMetadataXml is not a function`

- [ ] **Step 3: Implement the builder and use it in `uploadImage`**

In `src/images-importer.js`, add above `uploadImage`:

```js
function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]));
}

function buildImageMetadataXml(metadata = {}) {
  const caption = metadata.caption ? `<caption>${escapeXml(metadata.caption)}</caption>` : '';
  const credit = `<credit>${metadata.credit ? escapeXml(metadata.credit) : ''}</credit>`;
  return `<?xml version="1.0" encoding="UTF-8"?>` +
         `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
         `<ObjectMetadata>` +
         `<iptc>` +
         caption +
         credit +
         `</iptc>` +
         `<WebDesign><WebType>Image</WebType></WebDesign>` +
         `</ObjectMetadata>`;
}
```

In `uploadImage`, replace the hardcoded block:

```js
  const xmlMetadata = `<?xml version="1.0" encoding="UTF-8"?>` +
                      `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
                      `<ObjectMetadata>` +
                      `<iptc>` +
                      `<credit></credit>` +  // Add the credit from description here
                      `</iptc>` +
                      `<WebDesign><WebType>Image</WebType></WebDesign>` +
                      `</ObjectMetadata>`;
```

with:

```js
  const xmlMetadata = buildImageMetadataXml(options.metadata);
```

Add `buildImageMetadataXml` to the `module.exports` object at the bottom of the file.

- [ ] **Step 4: Run all tests**

Run: `node --test test/images-importer-metadata.test.js test/delayed-importer.test.js && npm test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/images-importer.js test/images-importer-metadata.test.js
git commit -m "feat: support caption/credit metadata in image upload XML"
```

---

### Task 6: HTTP handlers, route registration, test script

**Files:**
- Create: `src/requestHandlers/neon-delayed-import.js`
- Modify: `server.js` (after the `/in/binary` route, around line 366)
- Modify: `package.json:12` (test script)

No unit tests for the handler layer — the repo tests core logic only, never Fastify handlers; HTTP behavior is covered by Task 7 manual verification.

- [ ] **Step 1: Create `src/requestHandlers/neon-delayed-import.js`**

```js
const delayedImporter = require("../delayed-importer.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

// Delayed simulated feed into Neon
async function submitJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("submitJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  console.log("submitJobHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  const validation = delayedImporter.validatePayload(request.body);
  if (!validation.valid) {
    console.error(`submitJobHandler << ERROR: ${validation.error}`);
    return reply.status(400).send({ error: validation.error });
  }

  const job = delayedImporter.createJob(request.body);

  console.log("submitJobHandler << OUT:", JSON.stringify(job));
  return reply.status(202).send(job);
}

async function listJobsHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("listJobsHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return reply.status(200).send({ jobs: delayedImporter.listJobs() });
}

async function getJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("getJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const job = delayedImporter.getJob(request.params.jobId);
  if (!job) {
    return reply.status(404).send({ error: "Job not found" });
  }
  return reply.status(200).send(job);
}

async function cancelJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("cancelJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const result = delayedImporter.cancelJob(request.params.jobId);
  if (result === null) {
    return reply.status(404).send({ error: "Job not found" });
  }
  if (result.error) {
    return reply.status(409).send({ error: result.error });
  }
  console.log("cancelJobHandler << OUT:", JSON.stringify({ jobId: result.jobId, state: result.state }));
  return reply.status(200).send(result);
}

module.exports = {
  submitJobHandler,
  listJobsHandler,
  getJobHandler,
  cancelJobHandler,
};
```

- [ ] **Step 2: Register routes in `server.js`**

After the "From the World to Neon" block (after `fastify.post("/in/binary", ...)`, ~line 366), add:

```js
/**
 *
 * Delayed simulated import to Neon
 *
 */
const delayedImportHandlers = require("./src/requestHandlers/neon-delayed-import.js");
fastify.post("/in/delayed-import", delayedImportHandlers.submitJobHandler);
fastify.get("/in/delayed-import", delayedImportHandlers.listJobsHandler);
fastify.get("/in/delayed-import/:jobId", delayedImportHandlers.getJobHandler);
fastify.delete("/in/delayed-import/:jobId", delayedImportHandlers.cancelJobHandler);
```

- [ ] **Step 3: Add new test files to the npm test script**

In `package.json`, append the two new files to the `test` script value:

```
node --test test/connectors/twitter-connector.test.js test/connectors/facebook-connector.test.js test/connectors/instagram-connector.test.js test/connectors/threads-connector.test.js test/connectors/connector-registry.test.js test/delayed-importer.test.js test/images-importer-metadata.test.js
```

- [ ] **Step 4: Verify server boots and all tests pass**

Run: `npm test`
Expected: all PASS

Run: `node -e "require('./src/requestHandlers/neon-delayed-import.js'); console.log('handlers ok')"`
Expected: `handlers ok`

- [ ] **Step 5: Commit**

```bash
git add src/requestHandlers/neon-delayed-import.js server.js package.json
git commit -m "feat: add /in/delayed-import API endpoints"
```

---

### Task 7: Manual verification against a Neon sandbox

**Files:** none (verification only)

Requires a `.env` with `NEON_EXT_APIKEY` and Neon sandbox credentials, plus a real site/workspace. Replace `demo-site`, `Demo Workspace`, and the apikey below with sandbox values.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Submit a short mixed job and watch it drip**

```bash
curl -s -X POST http://localhost:3000/in/delayed-import \
  -H "Content-Type: application/json" -H "apikey: $NEON_EXT_APIKEY" \
  -d '{
    "duration": 1,
    "site": "demo-site",
    "workspace": "Demo Workspace",
    "items": [
      { "type": "story", "title": "Delayed test one", "content": "<p>First body</p>" },
      { "type": "story", "title": "Delayed test two", "content": "<p>Second body</p>" },
      { "type": "image", "url": "https://picsum.photos/800/600", "metadata": { "caption": "Test caption", "credit": "Picsum" } }
    ]
  }'
```

Expected: `202` with `jobId`, `itemCount: 3`, `intervalMs: 20000`. First story appears in the workfolder immediately (as draft, workflow state Revision), second after ~20s, image after ~40s.

- [ ] **Step 3: Check status mid-run and after completion**

```bash
curl -s http://localhost:3000/in/delayed-import/<jobId> -H "apikey: $NEON_EXT_APIKEY"
```

Expected mid-run: `state: "running"`, `nextFireAt` set. After: `state: "completed"`, 3 results with `familyRef`s.

- [ ] **Step 4: Cancel mid-run**

Submit again (same payload), then within 20s:

```bash
curl -s -X DELETE http://localhost:3000/in/delayed-import/<jobId> -H "apikey: $NEON_EXT_APIKEY"
```

Expected: `200`, `state: "cancelled"`, only already-imported items in Neon, no further imports. Repeat DELETE → `409`.

- [ ] **Step 5: Error paths**

```bash
# no apikey -> 401
curl -s -X POST http://localhost:3000/in/delayed-import -H "Content-Type: application/json" -d '{}'
# bad payload -> 400
curl -s -X POST http://localhost:3000/in/delayed-import -H "Content-Type: application/json" -H "apikey: $NEON_EXT_APIKEY" -d '{"duration": 1, "site": "s", "workspace": "w", "items": [{"type": "video"}]}'
# unknown job -> 404
curl -s http://localhost:3000/in/delayed-import/nope -H "apikey: $NEON_EXT_APIKEY"
# bad image URL -> job completes, result row has error
```

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: delayed importer adjustments from sandbox verification"
```
