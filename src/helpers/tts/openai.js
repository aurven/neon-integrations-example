'use strict';

function createOpenAiProvider({ apiKey, model, voice, fetchImpl = fetch }) {
  async function synthesizeChunk(text) {
    const res = await fetchImpl('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'gpt-4o-mini-tts', voice: voice || 'alloy', input: text, response_format: 'mp3' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return { name: 'openai', maxChars: 4096, apiKey, configured: Boolean(apiKey), synthesizeChunk };
}

module.exports = { createOpenAiProvider };
