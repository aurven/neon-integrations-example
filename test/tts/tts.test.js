'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { synthesize, QuotaExceededError } = require('../../src/helpers/tts/index.js');
const { createElevenLabsProvider } = require('../../src/helpers/tts/elevenlabs.js');
const { createOpenAiProvider } = require('../../src/helpers/tts/openai.js');

// 5 paragraphs, each ~10 chars; maxChars 12 forces one chunk per paragraph
const TEXT = ['aaaa aaaa.', 'bbbb bbbb.', 'cccc cccc.', 'dddd dddd.', 'eeee eeee.'].join('\n\n');

function fake(name, { apiKey = 'k', failOn, error, tag = name } = {}) {
  const calls = [];
  return {
    name, maxChars: 12, apiKey, calls,
    async synthesizeChunk(t) {
      calls.push(t);
      if (failOn === calls.length) throw error;
      return Buffer.from(`${tag}:${calls.length};`);
    },
  };
}

test('default provider elevenlabs, chunks concatenated in order', async () => {
  const el = fake('elevenlabs'); const oa = fake('openai');
  const r = await synthesize(TEXT, { providers: { elevenlabs: el, openai: oa } });
  assert.equal(r.provider, 'elevenlabs');
  assert.equal(r.fellBack, false);
  assert.equal(r.audio.toString(), 'elevenlabs:1;elevenlabs:2;elevenlabs:3;elevenlabs:4;elevenlabs:5;');
  assert.equal(oa.calls.length, 0);
});

test('quota error on chunk 3 falls back to openai for whole text', async () => {
  const el = fake('elevenlabs', { failOn: 3, error: new QuotaExceededError('q') });
  const oa = fake('openai');
  const r = await synthesize(TEXT, { providers: { elevenlabs: el, openai: oa } });
  assert.equal(r.provider, 'openai');
  assert.equal(r.fellBack, true);
  assert.equal(oa.calls.length, 5);
  assert.ok(!r.audio.toString().includes('elevenlabs'));
});

test('missing elevenlabs apiKey uses openai without calling elevenlabs', async () => {
  const el = fake('elevenlabs', { apiKey: null }); const oa = fake('openai');
  const r = await synthesize(TEXT, { providers: { elevenlabs: el, openai: oa } });
  assert.equal(r.provider, 'openai');
  assert.equal(r.fellBack, true);
  assert.equal(el.calls.length, 0);
});

test('generic elevenlabs error rejects, openai not called', async () => {
  const el = fake('elevenlabs', { failOn: 2, error: new Error('boom') }); const oa = fake('openai');
  await assert.rejects(synthesize(TEXT, { providers: { elevenlabs: el, openai: oa } }), /boom/);
  assert.equal(oa.calls.length, 0);
});

test('provider openai never calls elevenlabs', async () => {
  const el = fake('elevenlabs'); const oa = fake('openai');
  const r = await synthesize(TEXT, { provider: 'openai', providers: { elevenlabs: el, openai: oa } });
  assert.equal(r.provider, 'openai');
  assert.equal(r.fellBack, false);
  assert.equal(el.calls.length, 0);
});

test('empty text rejects', async () => {
  await assert.rejects(synthesize('', { providers: {} }), /empty spoken text/);
});

test('onProgress reports per chunk and restarts on fallback', async () => {
  const el = fake('elevenlabs', { failOn: 3, error: new QuotaExceededError('q') });
  const oa = fake('openai');
  const events = [];
  await synthesize(TEXT, { providers: { elevenlabs: el, openai: oa }, onProgress: (p) => events.push(p) });
  assert.deepEqual(events, [
    { done: 1, total: 5 }, { done: 2, total: 5 },
    { done: 1, total: 5 }, { done: 2, total: 5 }, { done: 3, total: 5 }, { done: 4, total: 5 }, { done: 5, total: 5 },
  ]);
});

function resp(status, body) {
  return { ok: status >= 200 && status < 300, status, async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
    async arrayBuffer() { return Buffer.from('audio'); } };
}

test('elevenlabs provider: 401 quota_exceeded -> QuotaExceededError', async () => {
  const p = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => resp(401, { detail: { status: 'quota_exceeded' } }), sleep: async () => {} });
  await assert.rejects(p.synthesizeChunk('hi'), QuotaExceededError);
});

test('elevenlabs provider: 402 -> QuotaExceededError', async () => {
  const p = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => resp(402, 'pay'), sleep: async () => {} });
  await assert.rejects(p.synthesizeChunk('hi'), QuotaExceededError);
});

test('elevenlabs provider: 429 twice then 200 resolves; request shape', async () => {
  const seen = []; let n = 0;
  const p = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v1', fetchImpl: async (url, opts) => { seen.push({ url, opts }); return resp(++n < 3 ? 429 : 200, 'x'); }, sleep: async () => {} });
  const buf = await p.synthesizeChunk('hi');
  assert.equal(buf.toString(), 'audio');
  assert.equal(n, 3);
  assert.equal(seen[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/v1');
  assert.equal(seen[0].opts.headers['xi-api-key'], 'k');
  assert.deepEqual(JSON.parse(seen[0].opts.body), { text: 'hi', model_id: 'eleven_multilingual_v2' });
});

test('elevenlabs provider: persistent 429 throws plain Error after 3 tries', async () => {
  let n = 0;
  const p = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => { n++; return resp(429, 'slow'); }, sleep: async () => {} });
  await assert.rejects(p.synthesizeChunk('hi'), (e) => !(e instanceof QuotaExceededError) && /429/.test(e.message));
  assert.equal(n, 3);
});

test('openai provider: request shape', async () => {
  let seen;
  const p = createOpenAiProvider({ apiKey: 'k', fetchImpl: async (url, opts) => { seen = { url, opts }; return resp(200, 'x'); } });
  assert.equal(p.maxChars, 4096);
  await p.synthesizeChunk('hello');
  assert.equal(seen.url, 'https://api.openai.com/v1/audio/speech');
  assert.deepEqual(JSON.parse(seen.opts.body), { model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'hello', response_format: 'mp3' });
});

test('elevenlabs provider: 429 quota_exceeded -> QuotaExceededError, no retries', async () => {
  let n = 0;
  const p = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => { n++; return resp(429, { detail: { status: 'quota_exceeded' } }); }, sleep: async () => {} });
  await assert.rejects(p.synthesizeChunk('hi'), QuotaExceededError);
  assert.equal(n, 1);
});

test('synthesize: elevenlabs 429 quota falls back to openai', async () => {
  const el = createElevenLabsProvider({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => resp(429, { detail: { status: 'quota_exceeded' } }), sleep: async () => {} });
  const oa = fake('openai');
  const r = await synthesize(TEXT, { providers: { elevenlabs: el, openai: oa } });
  assert.equal(r.provider, 'openai');
  assert.equal(r.fellBack, true);
});

test('elevenlabs without voiceId uses the default voice and is configured', async () => {
  const seen = [];
  const p = createElevenLabsProvider({ apiKey: 'k', fetchImpl: async (url) => { seen.push(url); return resp(200, 'x'); }, sleep: async () => {} });
  assert.equal(p.configured, true);
  const oa = fake('openai');
  const r = await synthesize('hello world.', { providers: { elevenlabs: p, openai: oa } });
  assert.equal(r.provider, 'elevenlabs');
  assert.equal(r.fellBack, false);
  assert.equal(seen[0], 'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM');
  assert.equal(oa.calls.length, 0);
});
