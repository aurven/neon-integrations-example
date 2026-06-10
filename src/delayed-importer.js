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

async function dispatchStoryItem(item, job) {
  throw new Error('not implemented yet — Task 4');
}

async function dispatchImageItem(item, job) {
  throw new Error('not implemented yet — Task 4');
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
