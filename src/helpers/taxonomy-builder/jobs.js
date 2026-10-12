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

// envId null = global admin (all envs); otherwise only that env's jobs ('' or undefined match nothing).
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
