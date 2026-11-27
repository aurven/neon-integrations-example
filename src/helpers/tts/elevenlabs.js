'use strict';
const { QuotaExceededError } = require('./errors.js');

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_TRIES = 3;

// eleven_multilingual_v2 accepts up to 10,000 chars per request (ElevenLabs models docs)
function createElevenLabsProvider({ apiKey, voiceId, model, fetchImpl = fetch, sleep = defaultSleep }) {
  const modelId = model || 'eleven_multilingual_v2';
  async function synthesizeChunk(text) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: modelId }),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const body = await res.text().catch(() => '');
      if (res.status === 402 || ((res.status === 401 || res.status === 429) && body.includes('quota_exceeded'))) {
        throw new QuotaExceededError(`ElevenLabs quota exceeded (HTTP ${res.status})`);
      }
      if (res.status === 429 && attempt < MAX_TRIES) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`ElevenLabs TTS failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
  }
  return { name: 'elevenlabs', maxChars: 10000, apiKey, configured: Boolean(apiKey && voiceId), synthesizeChunk };
}

module.exports = { createElevenLabsProvider };
