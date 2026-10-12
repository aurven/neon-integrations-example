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
  const existing = allNew(plan);
  existing.categories[1] = null; // attemptItem reads matches[i].status → TypeError outside the per-item try
  const crash = jobs.startJob({ plan, existing, env: ENV, client: fakeNeon() });
  await jobs.waitForJob(crash.jobId);
  const job = jobs.getJob(crash.jobId, { envId: null });
  assert.equal(job.state, 'failed');
  assert.match(job.error, /Cannot read properties of null|status/);
  assert.equal(job.done, job.total);
  const report = jobs.getReport(crash.jobId, { envId: null });
  assert.ok(report.categories.filter((i) => i.status === 'skipped').every((i) => i.error.startsWith('job failed: ')));
});

test('a synchronous start error leaves no job behind and does not block the env', async () => {
  const plan = planOf('F', 'TF\n  T');
  assert.throws(() => jobs.startJob({ plan, existing: { categories: [{ status: 'new' }], tags: undefined }, env: ENV, client: fakeNeon() }));
  assert.equal(jobs.runningJobId('env1'), null);
  assert.deepEqual(jobs.listJobs({ envId: null }), []);
  const ok = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() });
  await jobs.waitForJob(ok.jobId);
  assert.equal(jobs.getJob(ok.jobId, { envId: null }).state, 'completed');
});

test('a demo job cancelled right after start ends cancelled with untouched items skipped', async () => {
  const plan = planOf('F\n  C', 'TF\n  T');
  const { jobId } = jobs.startDemoJob({ plan, envId: 'env1', durationMs: 200 });
  assert.equal(jobs.cancelJob(jobId, { envId: 'env1' }).jobId, jobId);
  await jobs.waitForJob(jobId);
  const job = jobs.getJob(jobId, { envId: null });
  assert.equal(job.state, 'cancelled');
  assert.equal(job.done, job.total);
  const report = jobs.getReport(jobId, { envId: null });
  for (const item of [...report.categories, ...report.tags]) {
    assert.equal(item.status, 'skipped');
    assert.equal(item.error, 'cancelled');
  }
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

test('reports are kept only for the 3 most recent finished jobs per env', async () => {
  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const plan = planOf('A');
    const { jobId } = jobs.startJob({ plan, existing: allNew(plan), env: ENV, client: fakeNeon() });
    await jobs.waitForJob(jobId);
    ids.push(jobId);
  }
  assert.equal(jobs.MAX_REPORTS_PER_ENV, 3);
  for (const id of ids.slice(0, 2)) {
    assert.deepEqual(jobs.getReport(id, { envId: null }), { error: 'report no longer available' });
    assert.equal(jobs.getJob(id, { envId: null }).state, 'completed');
    assert.equal(jobs.getJob(id, { envId: null }).counts.created, 1);
  }
  for (const id of ids.slice(2)) {
    assert.equal(jobs.getReport(id, { envId: null }).categories.length, 1);
  }
});

test('startJob logs started first; resuming existing items prints no progress lines', async () => {
  const names = Array.from({ length: 2500 }, (_, i) => `C${i}`).join('\n');
  const plan = planOf(names);
  const existing = { categories: plan.categories.map((_, i) => ({ status: 'exists', ref: `r${i}` })), tags: [] };
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let started;
  try {
    started = jobs.startJob({ plan, existing, env: ENV, client: fakeNeon() });
    await jobs.waitForJob(started.jobId);
  } finally { console.log = orig; }
  const own = lines.filter((l) => l.includes('[taxonomy-job]'));
  assert.ok(own[0].includes('started'));
  assert.equal(own.filter((l) => l.includes('progress')).length, 0);
  assert.equal(jobs.getJob(started.jobId, { envId: null }).counts.exists, 2500);
});
