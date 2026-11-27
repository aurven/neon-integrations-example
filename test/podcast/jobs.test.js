'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const jobs = require('../../src/helpers/podcast/jobs.js');
const { readPodcastMetadata } = require('../../src/helpers/podcast/metadata.js');
const { EpisodeNotFoundError } = require('../../src/helpers/transistor/client.js');

const ENV = { id: 'demo' };
const HEAD = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">';
const xmlWith = (inner) =>
  `${HEAD}<ObjectMetadata><General/><SEO/><Paywall/><Ads/><DistributionChannels><Podcast>${inner}</Podcast></DistributionChannels><Diffusion/></ObjectMetadata>`;
const ENABLED = xmlWith('<Enabled>true</Enabled>');
const model = (title = 'Title', summary = 'Summary') => ({ title, summary, url: 'https://example.com/a' });

function fakes({ xml = ENABLED, nodeModel = model(), updateOk = () => true } = {}) {
  const state = { xml, calls: { synth: [], create: [], replace: [], publish: [], upload: [], update: 0 } };
  state.neon = {
    getNode: async () => (typeof nodeModel === 'function' ? nodeModel() : nodeModel),
    getNodeMetadata: async () => state.xml,
    updateNodeMetadata: async (ref, next) => {
      state.calls.update += 1;
      if (!updateOk(state.calls.update)) return false;
      state.xml = next;
      return true;
    },
  };
  state.synthesize = async (text, opts) => {
    state.calls.synth.push({ text, opts });
    if (opts.onProgress) opts.onProgress({ done: 1, total: 2 });
    return { audio: Buffer.from('mp3'), provider: 'openai', fellBack: true };
  };
  state.transistor = {
    uploadAudio: async (buf, name) => { state.calls.upload.push(name); return 'https://up/audio.mp3'; },
    createEpisode: async (args) => { state.calls.create.push(args); return { id: '100', shareUrl: 'https://share/100', mediaUrl: 'https://media/100.mp3' }; },
    replaceEpisodeAudio: async (id, args) => { state.calls.replace.push({ id, args }); return { id, shareUrl: 'https://share/' + id, mediaUrl: 'https://media/' + id + '.mp3' }; },
    publishEpisode: async (id) => { state.calls.publish.push(id); return { id }; },
  };
  state.install = () => jobs.__setDepsForTest({ neon: state.neon, synthesize: (t, o) => state.synthesize(t, o), transistor: state.transistor });
  state.install();
  return state;
}

async function run(args) {
  const res = await jobs.startPodcastJob({ env: ENV, familyRef: 'ref1', model: model(), ...args });
  await jobs.waitForJob(res.jobId);
  return { res, job: jobs.getJobForArticle('demo', args && args.familyRef ? args.familyRef : 'ref1') };
}

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => jobs.__resetForTest());

test('no EpisodeId: creates episode and writes metadata', async () => {
  const f = fakes();
  const { res, job } = await run();
  assert.equal(res.status, 'processing');
  assert.equal(job.state, 'done');
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.create[0].title, 'Title');
  assert.match(f.calls.create[0].description, /Summary/);
  assert.match(f.calls.create[0].description, /https:\/\/example\.com\/a/);
  const md = readPodcastMetadata(f.xml);
  assert.equal(md.shareUrl, 'https://share/100');
  assert.equal(md.mediaUrl, 'https://media/100.mp3');
  assert.equal(md.episodeId, '100');
  assert.match(md.textHash, /^sha256:/);
  assert.equal(md.status, 'ready');
  assert.equal(md.provider, 'openai');
  assert.equal(md.enabled, true);
  assert.equal(job.fellBack, true);
  assert.deepEqual(job.chunk, { done: 1, total: 2 });
});

test('stored EpisodeId and different hash: replaces, never creates', async () => {
  const f = fakes({ xml: xmlWith('<Enabled>true</Enabled><EpisodeId>55</EpisodeId><TextHash>sha256:old</TextHash><Status>ready</Status>') });
  const { job } = await run();
  assert.equal(job.state, 'done');
  assert.equal(f.calls.create.length, 0);
  assert.equal(f.calls.replace.length, 1);
  assert.equal(f.calls.replace[0].id, '55');
  assert.equal(f.calls.publish.length, 0);
  assert.equal(readPodcastMetadata(f.xml).episodeId, '55');
});

test('same hash, not forced: unchanged, no synthesis', async () => {
  const f = fakes();
  await run();
  f.calls.synth.length = 0;
  const { job } = await run();
  assert.equal(job.state, 'unchanged');
  assert.equal(f.calls.synth.length, 0);
});

test('same hash, forced: regenerates via replace', async () => {
  const f = fakes();
  await run();
  const { job } = await run({ force: true });
  assert.equal(job.state, 'done');
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.replace.length, 1);
});

test('Enabled=false with force: disabled, nothing called', async () => {
  const f = fakes({ xml: xmlWith('<Enabled>false</Enabled>') });
  const { job } = await run({ force: true });
  assert.equal(job.state, 'disabled');
  assert.equal(f.calls.synth.length, 0);
  assert.equal(f.calls.create.length, 0);
  assert.equal(f.calls.update, 0);
});

test('no Podcast node: disabled', async () => {
  const f = fakes({ xml: `${HEAD}<ObjectMetadata><General/></ObjectMetadata>` });
  const { job } = await run();
  assert.equal(job.state, 'disabled');
  assert.equal(f.calls.synth.length, 0);
});

test('without model, fetches node via getNode', async () => {
  const f = fakes({ nodeModel: model('Fetched', 'S') });
  const res = await jobs.startPodcastJob({ env: ENV, familyRef: 'ref1' });
  await jobs.waitForJob(res.jobId);
  assert.match(f.calls.synth[0].text, /^Fetched/);
});

test('replace hits EpisodeNotFoundError: creates new episode, overwrites EpisodeId', async () => {
  const f = fakes({ xml: xmlWith('<Enabled>true</Enabled><EpisodeId>55</EpisodeId><TextHash>sha256:old</TextHash><Status>ready</Status>') });
  f.transistor.replaceEpisodeAudio = async (id) => { throw new EpisodeNotFoundError(id); };
  const { job } = await run();
  assert.equal(job.state, 'done');
  assert.equal(f.calls.create.length, 1);
  assert.equal(readPodcastMetadata(f.xml).episodeId, '100');
});

test('synthesize throws: failed, Status=failed, existing ShareUrl kept', async () => {
  const f = fakes({ xml: xmlWith('<Enabled>true</Enabled><ShareUrl>https://share/old</ShareUrl><EpisodeId>55</EpisodeId><TextHash>sha256:old</TextHash><Status>ready</Status>') });
  f.synthesize = async () => { throw new Error('tts down'); };
  const { job } = await run();
  assert.equal(job.state, 'failed');
  assert.match(job.error, /tts down/);
  const md = readPodcastMetadata(f.xml);
  assert.equal(md.status, 'failed');
  assert.equal(md.shareUrl, 'https://share/old');
  assert.ok(md.updatedAt);
});

test('second start while running coalesces and reruns exactly once', async () => {
  let version = 0;
  const f = fakes({ nodeModel: () => model('Second', 'S') });
  const gate = deferred();
  const orig = f.synthesize;
  f.synthesize = async (t, o) => { if (!f.calls.synth.length) await gate.promise; return orig(t, o); };
  const first = await jobs.startPodcastJob({ env: ENV, familyRef: 'ref1', model: model('First') });
  await tick();
  const second = await jobs.startPodcastJob({ env: ENV, familyRef: 'ref1' });
  assert.deepEqual(second, { status: 'queued', jobId: first.jobId });
  assert.equal(jobs.getJobForArticle('demo', 'ref1').rerunRequested, true);
  gate.resolve();
  await jobs.waitForJob(first.jobId);
  const rerun = jobs.getJobForArticle('demo', 'ref1');
  assert.notEqual(rerun.id, first.jobId);
  await jobs.waitForJob(rerun.id);
  assert.equal(f.calls.synth.length, 2);
  assert.match(f.calls.synth[1].text, /^Second/);
  await tick();
  assert.equal(jobs.getJobForArticle('demo', 'ref1').id, rerun.id);
  void version;
});

test('coalescing also applies while a job is waiting for a slot', async () => {
  const f = fakes();
  const gate = deferred();
  const orig = f.synthesize;
  f.synthesize = async (t, o) => { await gate.promise; return orig(t, o); };
  await jobs.startPodcastJob({ env: ENV, familyRef: 'a', model: model('A') });
  await jobs.startPodcastJob({ env: ENV, familyRef: 'b', model: model('B') });
  const c = await jobs.startPodcastJob({ env: ENV, familyRef: 'c', model: model('C') });
  assert.equal(jobs.getJobForArticle('demo', 'c').state, 'waiting');
  const again = await jobs.startPodcastJob({ env: ENV, familyRef: 'c' });
  assert.deepEqual(again, { status: 'queued', jobId: c.jobId });
  gate.resolve();
  await jobs.waitForJob(c.jobId);
});

test('global cap of 2 running; third runs after one finishes', async () => {
  const f = fakes();
  const gates = [deferred(), deferred(), deferred()];
  let active = 0;
  let peak = 0;
  let n = 0;
  const orig = f.synthesize;
  f.synthesize = async (t, o) => {
    const g = gates[n++];
    active += 1; peak = Math.max(peak, active);
    await g.promise;
    active -= 1;
    return orig(t, o);
  };
  const ids = [];
  for (const ref of ['a', 'b', 'c']) ids.push((await jobs.startPodcastJob({ env: ENV, familyRef: ref, model: model(ref) })).jobId);
  await tick();
  assert.equal(n, 2);
  assert.equal(jobs.getJobForArticle('demo', 'c').state, 'waiting');
  gates[0].resolve();
  await jobs.waitForJob(ids[0]);
  await tick();
  assert.equal(n, 3);
  gates[1].resolve(); gates[2].resolve();
  await Promise.all(ids.map((id) => jobs.waitForJob(id)));
  assert.equal(peak, 2);
  assert.ok(ids.every((id) => true));
  assert.equal(jobs.getJobForArticle('demo', 'c').state, 'done');
});

test('updateNodeMetadata fails after createEpisode: failed, no second create', async () => {
  const f = fakes({ updateOk: () => false });
  const { job } = await run();
  assert.equal(job.state, 'failed');
  assert.equal(f.calls.create.length, 1);
});

test('R6a: createEpisode failing with episodeId persists it and Status=failed', async () => {
  const f = fakes();
  f.transistor.createEpisode = async (args) => {
    f.calls.create.push(args);
    const err = new Error('publish failed');
    err.episodeId = '77';
    throw err;
  };
  const { job } = await run();
  assert.equal(job.state, 'failed');
  assert.equal(f.calls.create.length, 1);
  const md = readPodcastMetadata(f.xml);
  assert.equal(md.episodeId, '77');
  assert.equal(md.status, 'failed');
});

test('R6b: replace with stored Status failed publishes; ready does not', async () => {
  const failed = fakes({ xml: xmlWith('<Enabled>true</Enabled><EpisodeId>55</EpisodeId><TextHash>sha256:old</TextHash><Status>failed</Status>') });
  const { job } = await run();
  assert.equal(job.state, 'done');
  assert.equal(failed.calls.replace.length, 1);
  assert.deepEqual(failed.calls.publish, ['55']);
  assert.equal(readPodcastMetadata(failed.xml).status, 'ready');
});

test('decideWebhook is pure and defaults to start', () => {
  const r = jobs.decideWebhook({ model: model(), force: false });
  assert.equal(r.action, 'start');
  assert.match(r.textHash, /^sha256:/);
  assert.equal(jobs.decideWebhook({ model: { ...model(), podcast: { enabled: false } }, force: true }).action, 'disabled');
  const same = jobs.decideWebhook({ model: model(), force: false });
  assert.equal(jobs.decideWebhook({ model: { ...model(), podcast: { enabled: true, textHash: same.textHash } }, force: false }).action, 'unchanged');
  assert.equal(jobs.decideWebhook({ model: { ...model(), podcast: { enabled: true, textHash: same.textHash } }, force: true }).action, 'start');
});
