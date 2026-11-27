'use strict';
/**
 * Podcast background jobs: in memory, one job per article, global cap of 2 running (FIFO wait).
 * Spec: docs/superpowers/specs/2026-11-27-transistor-podcast-design.md §3
 */
const crypto = require('node:crypto');
const context = require('../neon-env/context.js');
const { readPodcastMetadata, writePodcastMetadata } = require('./metadata.js');
const { buildSpokenText, textHash } = require('./spoken-text.js');
const { EpisodeNotFoundError } = require('../transistor/client.js');

const MAX_RUNNING = 2;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const WRITE_ATTEMPTS = 2;

const jobs = new Map();
const queue = [];
// Episode ids obtained from Transistor, kept in memory so a failed Neon write-back cannot cause a duplicate episode.
const knownEpisodes = new Map();
let seq = 0;
let deps = {};

function defaultDeps() {
  return {
    neon: null, // resolved per env in the pipeline
    synthesize: (...args) => require('../tts/index.js').synthesize(...args),
    transistor: null,
    now: () => new Date(),
  };
}
const dep = (name) => (deps[name] !== undefined && deps[name] !== null ? deps[name] : defaultDeps()[name]);

function log(job, message) {
  console.log(`[podcast-job] ${job.id} env=${job.envId} ref=${job.familyRef} ${message}`);
}

function newJobId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let id;
  do { id = `pod-${day}-${crypto.randomBytes(3).toString('hex')}`; } while (jobs.has(id));
  return id;
}

const isActive = (job) => job.state === 'waiting' || job.state === 'running';

const articleKey = (job) => `${job.envId}:${job.familyRef}`;

function rememberEpisode(job, id) {
  job.episodeId = String(id);
  knownEpisodes.set(articleKey(job), String(id));
}

function activeJobFor(envId, familyRef) {
  for (const job of jobs.values()) if (job.envId === envId && job.familyRef === familyRef && isActive(job)) return job;
  return null;
}

function hidden(job, props) {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(job, key, { value, writable: true, enumerable: false });
}

const rootOf = (model) => (model && model.rootData) || model || {};

/** Pure. Podcast values in the payload are optional (`model.podcast`); unknown means start. */
function decideWebhook({ model, force } = {}) {
  const hash = textHash(buildSpokenText(model));
  const known = rootOf(model).podcast || (model && model.podcast);
  if (known && known.enabled !== undefined && known.enabled !== true) return { action: 'disabled', textHash: hash };
  if (known && known.textHash && known.textHash === hash && !force) return { action: 'unchanged', textHash: hash };
  return { action: 'start', textHash: hash };
}

function episodeFields(model, text) {
  const root = rootOf(model);
  const title = (root.title && String(root.title).trim()) || text.split('\n\n')[0] || 'Untitled';
  const summary = (root.summary && String(root.summary).trim()) || '';
  const url = root.url || (model && model.url) || (root.pubInfo && root.pubInfo.url) || null;
  const absoluteUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
  const description = [summary, absoluteUrl].filter(Boolean).join('\n\n');
  return { title, summary, description };
}

async function writeMetadata(neon, familyRef, values) {
  const xml = await neon.getNodeMetadata(familyRef);
  const ok = await neon.updateNodeMetadata(familyRef, writePodcastMetadata(xml, values));
  if (!ok) throw new Error('updateNodeMetadata failed');
}

async function createEpisode(job, neon, transistor, fields, audioUrl) {
  try {
    return await transistor.createEpisode({ ...fields, audioUrl });
  } catch (err) {
    if (err && err.episodeId) {
      rememberEpisode(job, err.episodeId);
      // The episode exists (draft): persist its id so the next run replaces instead of creating again.
      try {
        await writeMetadata(neon, job.familyRef, { episodeId: String(err.episodeId), status: 'failed', updatedAt: dep('now')().toISOString() });
      } catch (writeErr) {
        log(job, `could not persist episodeId after failed publish: ${writeErr.message}`);
      }
    }
    throw err;
  }
}

async function pipeline(job) {
  const { familyRef, force, provider } = job._args;
  const neon = dep('neon') || require('../neon-bo-api-v3.js').clientFor(job._args.env);

  job.step = 'reading-metadata';
  const stored = readPodcastMetadata(await neon.getNodeMetadata(familyRef));
  if (stored.enabled !== true) { job.state = 'disabled'; return; }
  const model = job._args.model || (await neon.getNode(familyRef));
  const text = buildSpokenText(model);
  const hash = textHash(text);
  if (!force && stored.textHash === hash) { job.state = 'unchanged'; return; }

  const transistor = dep('transistor') || require('../transistor/client.js').createTransistorClient(
    require('../neon-env/services.js').serviceConfig('transistor'));

  job.step = 'generating-audio';
  const audio = await dep('synthesize')(text, { provider, onProgress: (p) => { job.chunk = { done: p.done, total: p.total }; } });
  job.provider = audio.provider;
  job.fellBack = !!audio.fellBack;

  job.step = 'uploading';
  const fileName = `neon-${String(familyRef).replace(/[^\w.-]+/g, '_')}-${dep('now')().getTime()}.mp3`;
  const audioUrl = await transistor.uploadAudio(audio.audio, fileName);
  const fields = episodeFields(model, text);
  let episode = null;
  const knownId = stored.episodeId || knownEpisodes.get(articleKey(job)) || null;
  if (knownId) {
    try {
      episode = await transistor.replaceEpisodeAudio(knownId, { ...fields, audioUrl });
      // An earlier failed run may have left a draft: publish unless Transistor reports it published.
      if (!episode || episode.status !== 'published') await transistor.publishEpisode(knownId);
    } catch (err) {
      if (!(err instanceof EpisodeNotFoundError)) throw err;
      log(job, `episode ${knownId} not found in Transistor, creating a new one`);
    }
  }
  if (!episode) episode = await createEpisode(job, neon, transistor, fields, audioUrl);
  rememberEpisode(job, episode.id);
  job.shareUrl = episode.shareUrl;
  job.mediaUrl = episode.mediaUrl;

  job.step = 'writing-metadata';
  const values = {
    shareUrl: episode.shareUrl, mediaUrl: episode.mediaUrl, episodeId: String(episode.id), textHash: hash,
    provider: audio.provider, status: 'ready', updatedAt: dep('now')().toISOString(),
  };
  let lastErr;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    try { await writeMetadata(neon, familyRef, values); lastErr = null; break; } catch (err) { lastErr = err; }
  }
  if (lastErr) throw lastErr;
  job.state = 'done';
}

async function markFailed(job) {
  try {
    const neon = dep('neon') || require('../neon-bo-api-v3.js').clientFor(job._args.env);
    const values = { status: 'failed', updatedAt: dep('now')().toISOString() };
    if (job.episodeId) values.episodeId = job.episodeId;
    if (job.shareUrl) values.shareUrl = job.shareUrl;
    if (job.mediaUrl) values.mediaUrl = job.mediaUrl;
    await writeMetadata(neon, job.familyRef, values);
  } catch (err) {
    log(job, `could not write failed status: ${err.message}`);
  }
}

async function runJob(job) {
  job.state = 'running';
  job.startedAt = dep('now')().toISOString();
  log(job, 'started');
  try {
    await context.run(job._args.env, async () => {
      try {
        await pipeline(job);
      } catch (err) {
        // Stay 'running' until the failure write finishes, so coalescing and the cap still see this job.
        job.error = (err && err.message) || String(err);
        log(job, `failed at ${job.step}: ${job.error}`);
        await markFailed(job);
        job.state = 'failed';
      }
    });
  } catch (err) {
    job.state = 'failed';
    job.error = (err && err.message) || String(err);
  }
  job.finishedAt = dep('now')().toISOString();
  log(job, job.state);
  const timer = setTimeout(() => jobs.delete(job.id), RETENTION_MS);
  if (timer.unref) timer.unref();
  job._timer = timer;
  if (job.rerunRequested) {
    // Latest text must be re-fetched, so the stale model is dropped.
    enqueue({ ...job._args, model: undefined, force: !!job.rerunForce });
  }
  job._resolve();
  pump();
}

function pump() {
  let running = 0;
  for (const job of jobs.values()) if (job.state === 'running') running += 1;
  while (running < MAX_RUNNING && queue.length) {
    const next = queue.shift();
    running += 1;
    runJob(next);
  }
}

function enqueue(args) {
  seq += 1;
  const job = {
    id: newJobId(), envId: args.env && args.env.id, familyRef: args.familyRef, state: 'waiting', step: null,
    provider: null, fellBack: false, error: null, startedAt: null, finishedAt: null, rerunRequested: false, rerunForce: false,
    episodeId: null,
  };
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  hidden(job, { _args: args, _resolve: resolve, _done: done, _timer: null, _seq: seq });
  jobs.set(job.id, job);
  queue.push(job);
  pump();
  return job;
}

function startPodcastJob({ env, familyRef, model, force = false, provider } = {}) {
  const envId = env && env.id;
  const existing = activeJobFor(envId, familyRef);
  if (existing) {
    existing.rerunRequested = true;
    if (force) existing.rerunForce = true;
    return { status: 'queued', jobId: existing.id };
  }
  const job = enqueue({ env, familyRef, model, force, provider });
  return { status: 'processing', jobId: job.id };
}

function getJobForArticle(envId, familyRef) {
  let latest = null;
  for (const job of jobs.values()) {
    if (job.envId !== envId || job.familyRef !== familyRef) continue;
    if (job.state === 'running') return job;
    if (!latest || job._seq > latest._seq) latest = job;
  }
  return latest;
}

function waitForJob(jobId) {
  const job = jobs.get(jobId);
  return job ? job._done : Promise.resolve();
}

function __setDepsForTest(next) { deps = next || {}; }

function __resetForTest() {
  for (const job of jobs.values()) clearTimeout(job._timer);
  jobs.clear();
  queue.length = 0;
  knownEpisodes.clear();
  deps = {};
}

module.exports = {
  decideWebhook, startPodcastJob, getJobForArticle, waitForJob,
  MAX_RUNNING, RETENTION_MS, __setDepsForTest, __resetForTest,
};
