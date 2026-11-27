'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTransistorClient, EpisodeNotFoundError } = require('../../src/helpers/transistor/client.js');

function res(status, json) {
  return { ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json || '') };
}
function setup(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return queue.shift(); };
  const sleeps = [];
  const client = createTransistorClient({ apiKey: 'SECRET', showId: '9', fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
  return { calls, client, sleeps };
}
const episodeJson = { data: { id: '123', attributes: { share_url: 'https://share.transistor.fm/s/abc', media_url: 'https://media.transistor.fm/abc.mp3', status: 'published' } } };
const fields = { title: 'T', summary: 'S', description: 'D', audioUrl: 'https://x/a.mp3' };

test('uploadAudio authorizes then PUTs buffer and returns audio_url', async () => {
  const { calls, client } = setup([
    res(200, { data: { attributes: { upload_url: 'https://up.example/u?sig=1', content_type: 'audio/mpeg', audio_url: 'https://x/a.mp3' } } }),
    res(200, {}),
  ]);
  const buf = Buffer.from('abc');
  assert.equal(await client.uploadAudio(buf, 'my file.mp3'), 'https://x/a.mp3');
  assert.equal(calls[0].url, 'https://api.transistor.fm/v1/episodes/authorize_upload?filename=my%20file.mp3');
  assert.equal(calls[1].opts.method, 'PUT');
  assert.equal(calls[1].url, 'https://up.example/u?sig=1');
  assert.equal(calls[1].opts.headers['Content-Type'], 'audio/mpeg');
  assert.equal(calls[1].opts.body, buf);
});

test('createEpisode POSTs then publishes', async () => {
  const { calls, client } = setup([res(201, episodeJson), res(200, episodeJson)]);
  const ep = await client.createEpisode(fields);
  assert.deepEqual(ep, { id: '123', shareUrl: 'https://share.transistor.fm/s/abc', mediaUrl: 'https://media.transistor.fm/abc.mp3', status: 'published' });
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].url, 'https://api.transistor.fm/v1/episodes');
  const p = new URLSearchParams(calls[0].opts.body);
  assert.equal(p.get('episode[show_id]'), '9');
  assert.equal(p.get('episode[title]'), 'T');
  assert.equal(p.get('episode[audio_url]'), 'https://x/a.mp3');
  assert.equal(calls[1].opts.method, 'PATCH');
  assert.equal(calls[1].url, 'https://api.transistor.fm/v1/episodes/123/publish');
  assert.equal(new URLSearchParams(calls[1].opts.body).get('episode[status]'), 'published');
});

test('replaceEpisodeAudio is a single PATCH with new audio url', async () => {
  const { calls, client } = setup([res(200, episodeJson)]);
  const ep = await client.replaceEpisodeAudio('123', fields);
  assert.equal(ep.id, '123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(calls[0].url, 'https://api.transistor.fm/v1/episodes/123');
  assert.equal(new URLSearchParams(calls[0].opts.body).get('episode[audio_url]'), 'https://x/a.mp3');
});

test('replaceEpisodeAudio 404 -> EpisodeNotFoundError', async () => {
  const { client } = setup([res(404, {})]);
  await assert.rejects(() => client.replaceEpisodeAudio('123', fields), EpisodeNotFoundError);
});

test('every request carries x-api-key (except the presigned PUT)', async () => {
  const { calls, client } = setup([
    res(200, { data: { attributes: { upload_url: 'https://up/u', content_type: 'audio/mpeg', audio_url: 'a' } } }),
    res(200, {}), res(201, episodeJson), res(200, episodeJson),
  ]);
  await client.uploadAudio(Buffer.from('a'), 'a.mp3');
  await client.createEpisode(fields);
  assert.equal(calls[0].opts.headers['x-api-key'], 'SECRET');
  assert.equal(calls[2].opts.headers['x-api-key'], 'SECRET');
  assert.equal(calls[3].opts.headers['x-api-key'], 'SECRET');
});

test('429 then 200 succeeds after backoff', async () => {
  const { calls, client, sleeps } = setup([res(429, {}), res(200, episodeJson)]);
  await client.replaceEpisodeAudio('123', fields);
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
});

test('persistent 429 fails without leaking the api key', async () => {
  const { client } = setup([res(429, {}), res(429, {}), res(429, {})]);
  await assert.rejects(() => client.replaceEpisodeAudio('123', fields), (e) => /429/.test(e.message) && !e.message.includes('SECRET'));
});

test('publish failure after create exposes episodeId on the error', async () => {
  const { client } = setup([res(201, episodeJson), res(500, {})]);
  await assert.rejects(() => client.createEpisode(fields), (e) => e.episodeId === '123' && e.status === 500 && /HTTP 500/.test(e.message));
});

test('publishEpisode PATCHes publish and returns Episode', async () => {
  const { calls, client } = setup([res(200, episodeJson)]);
  const ep = await client.publishEpisode('123');
  assert.equal(ep.id, '123');
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(calls[0].url, 'https://api.transistor.fm/v1/episodes/123/publish');
  assert.equal(new URLSearchParams(calls[0].opts.body).get('episode[status]'), 'published');
});

test('missing config throws without secrets', () => {
  assert.throws(() => createTransistorClient({ apiKey: 'SECRET' }), (e) => e.message === 'transistor not configured: missing showId');
  assert.throws(() => createTransistorClient({ showId: '9' }), /missing apiKey/);
});
