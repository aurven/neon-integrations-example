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
