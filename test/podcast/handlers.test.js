'use strict';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const jobs = require('../../src/helpers/podcast/jobs.js');
const h = require('../../src/requestHandlers/transistor.js');
const example = require('../../examples/out-methode.json');

const ENV = { id: 'demo' };
const XML = '<ObjectMetadata><General/><DistributionChannels><Podcast><Enabled>false</Enabled></Podcast></DistributionChannels></ObjectMetadata>';

function fakeReply() {
  const r = { code: 200, body: undefined, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.code_ = r.status;
  r.send = (b) => { r.body = b; return r; };
  r.setCookie = () => r;
  return r;
}
const req = (o = {}) => ({ headers: {}, query: {}, body: {}, neonEnv: ENV, neonAuth: { authenticated: true, apikey: 'k', role: 'admin' }, ...o });

const neonApi = require('../../src/helpers/neon-bo-api-v3.js');
const realClientFor = neonApi.clientFor;
neonApi.clientFor = () => ({ getNodeMetadata: async () => XML });
after(() => { neonApi.clientFor = realClientFor; });

beforeEach(() => {
  jobs.__resetForTest();
  jobs.__setDepsForTest({
    neon: {
      getNode: async () => ({}),
      getNodeMetadata: async () => XML,
      updateNodeMetadata: async () => true,
    },
    synthesize: async () => { throw new Error('no tts in test'); },
    transistor: {},
  });
});

test('webhook with example body -> 200 writeback processing with jobId', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhook(req({ body: example }), reply);
  assert.equal(reply.code, 200);
  assert.equal(reply.body.action, 'writeback');
  assert.equal(reply.body.payload.status, 'processing');
  assert.ok(reply.body.payload.jobId);
  await jobs.waitForJob(reply.body.payload.jobId);
});

test('webhook with {} -> 400 Missing model', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhook(req({ body: {} }), reply);
  assert.equal(reply.code, 400);
  assert.equal(reply.body.error, 'Missing model in request body');
});

test('webhook without id -> 400', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhook(req({ body: { rootData: { title: 'x' } } }), reply);
  assert.equal(reply.code, 400);
});

test('webhook without env -> 401', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhook(req({ body: example, neonEnv: null }), reply);
  assert.equal(reply.code, 401);
});

test('regenerate without familyRef -> 400', async () => {
  const reply = fakeReply();
  await h.postPodcastRegenerate(req({ body: {} }), reply);
  assert.equal(reply.code, 400);
});

test('regenerate unauthenticated -> 401', async () => {
  const reply = fakeReply();
  await h.postPodcastRegenerate(req({ body: { familyRef: 'a' }, neonAuth: { authenticated: false } }), reply);
  assert.equal(reply.code, 401);
});

test('status without familyRef -> 400', async () => {
  const reply = fakeReply();
  await h.getPodcastStatus(req(), reply);
  assert.equal(reply.code, 400);
});

test('status for unknown article -> job null, metadata disabled', async () => {
  const reply = fakeReply();
  await h.getPodcastStatus(req({ query: { familyRef: 'unknown' } }), reply);
  assert.equal(reply.body.job, null);
  assert.equal(reply.body.metadata.enabled, false);
});

test('demo mode: regenerate then status progresses to done with no deps', async () => {
  jobs.__resetForTest(); // no deps installed: any real call would throw
  const reply = fakeReply();
  await h.postPodcastRegenerate(req({ query: { demo: 'true' }, body: { familyRef: 'demo-1' }, neonEnv: null }), reply);
  assert.equal(reply.code, 202);
  assert.ok(reply.body.jobId);
  const first = fakeReply();
  await h.getPodcastStatus(req({ query: { demo: 'true', familyRef: 'demo-1' } }), first);
  assert.equal(first.body.job.state, 'running');
  assert.equal(first.body.metadata.status, null);
  const realNow = Date.now;
  Date.now = () => realNow() + 20000;
  try {
    const last = fakeReply();
    await h.getPodcastStatus(req({ query: { demo: 'true', familyRef: 'demo-1' } }), last);
    assert.equal(last.body.job.state, 'done');
    assert.equal(last.body.metadata.status, 'ready');
    assert.equal(last.body.metadata.shareUrl, 'https://share.transistor.fm/s/demo');
  } finally { Date.now = realNow; }
});

test('webhook with env but unauthenticated apikey -> 401, no job', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhook(req({ body: example, neonAuth: { authenticated: false } }), reply);
  assert.equal(reply.code, 401);
  assert.equal(jobs.getJobForArticle('demo', example.rootData.id), null);
});

test('legacy webhook with env set by wrapper and no neonAuth -> 200 processing', async () => {
  const reply = fakeReply();
  await h.postTransistorWebhookLegacy(req({ body: example, neonAuth: null }), reply);
  assert.equal(reply.code, 200);
  assert.equal(reply.body.payload.status, 'processing');
  await jobs.waitForJob(reply.body.payload.jobId);
});

test('demo regenerate and status without apikey -> 401', async () => {
  const a = fakeReply();
  await h.postPodcastRegenerate(req({ query: { demo: 'true' }, body: { familyRef: 'x' }, neonAuth: { authenticated: false } }), a);
  assert.equal(a.code, 401);
  const b = fakeReply();
  await h.getPodcastStatus(req({ query: { demo: 'true', familyRef: 'x' }, neonAuth: { authenticated: false } }), b);
  assert.equal(b.code, 401);
});

test('demo store is capped at 100 entries', async () => {
  for (let i = 0; i < 130; i++) {
    await h.postPodcastRegenerate(req({ query: { demo: 'true' }, body: { familyRef: 'cap-' + i }, neonEnv: null }), fakeReply());
  }
  const old = fakeReply();
  await h.getPodcastStatus(req({ query: { demo: 'true', familyRef: 'cap-0' } }), old);
  assert.equal(old.body.job, null);
  const recent = fakeReply();
  await h.getPodcastStatus(req({ query: { demo: 'true', familyRef: 'cap-129' } }), recent);
  assert.ok(recent.body.job);
});
