'use strict';
// Transistor.fm API client. Verified against https://developers.transistor.fm/ (2026-11-27):
// - x-api-key header; bodies are form-encoded episode[...] params
// - GET /v1/episodes/authorize_upload?filename= -> upload_url, content_type, audio_url; then HTTP PUT to upload_url
// - PATCH /v1/episodes/:id accepts episode[audio_url] ("URL to an episode's new audio file")
// - PATCH /v1/episodes/:id/publish with episode[status]=published
// - Rate limit 10 req / 10 s; exceeding it returns 429 and blocks for 10 s
const BASE_URL = 'https://api.transistor.fm';
const MAX_TRIES = 3;
const BACKOFF_MS = 10000;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

class EpisodeNotFoundError extends Error {
  constructor(id) {
    super(`Transistor episode ${id} not found`);
    this.name = 'EpisodeNotFoundError';
    this.episodeId = id;
  }
}

function createTransistorClient({ apiKey, showId, fetchImpl = fetch, sleep = defaultSleep }) {
  const missing = [!apiKey && 'apiKey', !showId && 'showId'].filter(Boolean);
  if (missing.length) throw new Error(`transistor not configured: missing ${missing.join(', ')}`);
  async function send(url, opts, label) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(url, opts);
      if (res.status === 429 && attempt < MAX_TRIES) {
        await sleep(BACKOFF_MS * attempt);
        continue;
      }
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      const err = new Error(`Transistor ${label} failed: HTTP ${res.status} ${String(body).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
  }

  const api = (path, method, params, label) => send(`${BASE_URL}${path}`, {
    method,
    headers: { 'x-api-key': apiKey, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  }, label);

  function episodeFields({ title, summary, description, audioUrl }) {
    const f = {};
    if (title != null) f['episode[title]'] = title;
    if (summary != null) f['episode[summary]'] = summary;
    if (description != null) f['episode[description]'] = description;
    if (audioUrl != null) f['episode[audio_url]'] = audioUrl;
    return f;
  }

  async function toEpisode(res) {
    const { data } = await res.json();
    return { id: String(data.id), shareUrl: data.attributes.share_url, mediaUrl: data.attributes.media_url, status: data.attributes.status };
  }

  async function uploadAudio(buffer, filename) {
    const auth = await api(`/v1/episodes/authorize_upload?filename=${encodeURIComponent(filename)}`, 'GET', null, 'authorize_upload');
    const { upload_url: uploadUrl, content_type: contentType, audio_url: audioUrl } = (await auth.json()).data.attributes;
    // Presigned URL: no x-api-key, and the URL itself is never put into error messages.
    await send(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType || 'audio/mpeg' }, body: buffer }, 'audio upload');
    return audioUrl;
  }

  async function createEpisode(fields) {
    const created = await toEpisode(await api('/v1/episodes', 'POST', { 'episode[show_id]': String(showId), ...episodeFields(fields) }, 'create episode'));
    try {
      return await publishEpisode(created.id);
    } catch (e) {
      // The episode exists: expose its id so a retry never creates a second one.
      e.episodeId = created.id;
      throw e;
    }
  }

  async function publishEpisode(id) {
    return toEpisode(await api(`/v1/episodes/${encodeURIComponent(id)}/publish`, 'PATCH', { 'episode[status]': 'published' }, 'publish episode'));
  }

  async function replaceEpisodeAudio(id, fields) {
    try {
      return await toEpisode(await api(`/v1/episodes/${encodeURIComponent(id)}`, 'PATCH', episodeFields(fields), 'replace episode audio'));
    } catch (e) {
      if (e.status === 404) throw new EpisodeNotFoundError(id);
      throw e;
    }
  }

  return { uploadAudio, createEpisode, publishEpisode, replaceEpisodeAudio };
}

module.exports = { createTransistorClient, EpisodeNotFoundError };
