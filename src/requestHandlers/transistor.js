'use strict';
const { safeLogRequest } = require('../helpers/utils.js');
const { authenticate } = require('../helpers/auth.js');
const { decideWebhook, startPodcastJob, getJobForArticle } = require('../helpers/podcast/jobs.js');
const { readPodcastMetadata } = require('../helpers/podcast/metadata.js');

const DEMO_MP3 = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const DEMO_DURATION_MS = 8000;
const demoJobs = new Map(); // familyRef -> startedAt (ms)

function isDemo(request) {
  return String(request.query && request.query.demo) === 'true';
}

function demoJob(familyRef) {
  const startedAt = demoJobs.get(familyRef);
  if (startedAt === undefined) return { job: null, metadata: readPodcastMetadata('<ObjectMetadata/>') };
  const p = Math.min(1, (Date.now() - startedAt) / DEMO_DURATION_MS);
  let state = 'running';
  let step;
  let chunk;
  if (p >= 1) { state = 'done'; step = 'done'; }
  else if (p < 0.1) step = 'reading-metadata';
  else if (p < 0.75) { step = 'generating-audio'; chunk = { done: Math.min(4, 1 + Math.floor(((p - 0.1) / 0.65) * 4)), total: 4 }; }
  else if (p < 0.9) step = 'uploading';
  else step = 'writing-metadata';
  const done = state === 'done';
  return {
    job: {
      id: `demo-${startedAt}`, envId: 'demo', familyRef, state, step, ...(chunk ? { chunk } : {}),
      provider: 'elevenlabs', fellBack: false, error: null,
      startedAt: new Date(startedAt).toISOString(), finishedAt: done ? new Date(startedAt + DEMO_DURATION_MS).toISOString() : null,
      rerunRequested: false,
    },
    metadata: {
      enabled: true, shareUrl: done ? 'https://share.transistor.fm/s/demo' : null, mediaUrl: done ? DEMO_MP3 : null,
      episodeId: done ? 'demo' : null, textHash: null, provider: 'elevenlabs', status: done ? 'ready' : null,
      updatedAt: done ? new Date(startedAt + DEMO_DURATION_MS).toISOString() : null,
    },
  };
}

async function postTransistorWebhook(request, reply) {
  console.log('postTransistorWebhook << IN:');
  const safe = safeLogRequest(request.headers || {}, request.body || {});
  console.log('Request Headers:', JSON.stringify(safe.headers));
  console.log('Request Body:', JSON.stringify(safe.body));

  const env = request.neonEnv;
  if (!env) return reply.status(401).send({ error: 'Unauthorized' });

  const { model, rootData } = request.body || {};
  if (!model && !rootData) {
    console.error('Missing model in request body');
    return reply.status(400).send({ error: 'Missing model in request body' });
  }
  const neonModel = (model && model.data) || rootData || model;
  const familyRef = neonModel && neonModel.id;
  if (!familyRef) return reply.status(400).send({ error: 'Missing id in model' });

  const at = new Date().toISOString();
  const decision = decideWebhook({ model: neonModel });
  let payload;
  if (decision.action === 'start') {
    const started = await startPodcastJob({ env, familyRef, model: neonModel, provider: request.query && request.query.provider });
    payload = { status: started.status, jobId: started.jobId, textHash: decision.textHash, at };
  } else {
    payload = { status: decision.action, textHash: decision.textHash, at };
  }
  console.log('postTransistorWebhook << OUT:', JSON.stringify(payload));
  return reply.status(200).send({ action: 'writeback', payload });
}

async function getPodcastStatus(request, reply) {
  const demo = isDemo(request);
  if (!demo) {
    const auth = authenticate(request, reply);
    if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });
  }
  const familyRef = request.query && request.query.familyRef;
  if (!familyRef) return reply.status(400).send({ error: 'familyRef is required' });
  if (demo) return reply.send(demoJob(familyRef));

  const env = request.neonEnv;
  if (!env) return reply.status(401).send({ error: 'Unauthorized' });
  try {
    const xml = await require('../helpers/neon-bo-api-v3.js').clientFor(env).getNodeMetadata(familyRef);
    return reply.send({ job: getJobForArticle(env.id, familyRef), metadata: readPodcastMetadata(xml) });
  } catch (err) {
    console.error('getPodcastStatus << ERROR:', err.message);
    return reply.status(502).send({ error: 'Could not read podcast metadata' });
  }
}

async function postPodcastRegenerate(request, reply) {
  const demo = isDemo(request);
  if (!demo) {
    const auth = authenticate(request, reply);
    if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });
  }
  const { familyRef, provider } = request.body || {};
  if (!familyRef && !demo) return reply.status(400).send({ error: 'familyRef is required' });
  if (demo) {
    const ref = familyRef || 'demo';
    demoJobs.set(ref, Date.now());
    return reply.status(202).send({ status: 'processing', jobId: `demo-${demoJobs.get(ref)}` });
  }
  const env = request.neonEnv;
  if (!env) return reply.status(401).send({ error: 'Unauthorized' });
  const started = await startPodcastJob({ env, familyRef, force: true, provider });
  return reply.status(202).send({ status: started.status, jobId: started.jobId });
}

module.exports = { postTransistorWebhook, getPodcastStatus, postPodcastRegenerate };
