'use strict';
const { chunkText } = require('../podcast/spoken-text.js');
const { serviceConfig } = require('../neon-env/services.js');
const { QuotaExceededError } = require('./errors.js');
const { createElevenLabsProvider } = require('./elevenlabs.js');
const { createOpenAiProvider } = require('./openai.js');

function buildProviders() {
  const el = serviceConfig('elevenlabs');
  const oa = serviceConfig('openai');
  return {
    elevenlabs: createElevenLabsProvider({ apiKey: el.apiKey, voiceId: el.voiceId, model: el.model }),
    openai: createOpenAiProvider({ apiKey: oa.apiKey, model: oa.ttsModel, voice: oa.ttsVoice }),
  };
}

async function runProvider(provider, text, onProgress) {
  const chunks = chunkText(text, provider.maxChars);
  const buffers = [];
  for (const chunk of chunks) {
    buffers.push(await provider.synthesizeChunk(chunk));
    if (onProgress) onProgress({ done: buffers.length, total: chunks.length });
  }
  return Buffer.concat(buffers);
}

async function synthesize(text, { provider, providers, onProgress } = {}) {
  if (!text || !String(text).trim()) throw new Error('empty spoken text');
  const chosen = provider || process.env.TTS_PROVIDER || 'elevenlabs';
  const set = providers || buildProviders();
  const primary = set[chosen];
  if (!primary) throw new Error(`Unknown TTS provider '${chosen}'`);

  const usable = primary.configured !== false && primary.apiKey;
  if (usable) {
    try {
      return { audio: await runProvider(primary, text, onProgress), provider: primary.name, fellBack: false };
    } catch (err) {
      if (!(err instanceof QuotaExceededError) || chosen !== 'elevenlabs') throw err;
    }
  } else if (chosen !== 'elevenlabs') {
    throw new Error(`TTS provider '${chosen}' is not configured`);
  }
  const fallback = set.openai;
  if (!fallback) throw new Error('No fallback TTS provider available');
  return { audio: await runProvider(fallback, text, onProgress), provider: fallback.name, fellBack: true };
}

module.exports = { synthesize, QuotaExceededError };
