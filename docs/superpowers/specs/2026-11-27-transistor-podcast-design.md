# Article-to-Podcast via Transistor.fm (Design)

**Date:** 2026-11-27
**Status:** Approved 2026-11-27
**Purpose:** Demo. An editor publishes a Neon article; a podcast episode of that article is generated automatically and appears inside the article.

## Intent

Show that Neon can turn a published article into a podcast with no extra editorial work:

1. Editor publishes an article in Neon.
2. A Neon webhook calls this service.
3. The service turns the article text into an MP3 with a text-to-speech (TTS) provider.
4. The MP3 is uploaded to Transistor.fm as an episode of a show.
5. The episode URL is written back to the article's metadata in Neon (BO API).

**Scope of this design ends at step 5:** a stable URL, stored on the article, that can be fed to Neon's `importbyurl` endpoint to create the proxy object. How Neon imports it, places the player, and whether/who republishes is a **later, separate design**.

Corrections (wrong information, redaction, correction notice) must be reflected in the podcast without creating a second episode.

## Goals

- Automatic generation on publish.
- Automatic regeneration when the spoken text changes, replacing the audio **in the same Transistor episode** so the URL in Neon never changes.
- A Neon panel showing podcast status, with a "Force regenerate" button and live job status (the demo shows this on screen).
- TTS provider selectable: ElevenLabs default, OpenAI fallback.

## Non-goals

- The Neon side after the URL exists (deferred to a later design): calling `importbyurl`, creating/placing the proxy object, inserting anything in the article body, republishing the article.
- Persisting jobs across server restarts. Jobs live in memory, like the Taxonomy Builder jobs. State that must survive (episode id, fingerprint, URL) lives in the article metadata, so a restart loses only in-flight jobs.
- Multiple shows, per-section shows, or per-article voice choice in the editor UI.
- Deleting Transistor episodes when an article is unpublished/deleted.
- Audio post-processing (music, intro/outro, loudness normalisation).

## Anti-goals

- Never create a second episode for the same article. One article = one episode, forever.
- Never mix two voices in one episode.
- Never cause a publish loop: this service never triggers a Neon publish (in this scope). The text fingerprint also makes a re-fired webhook a no-op, so a later design can add a republish safely.

## Constraints and existing code to reuse

- **Webhook pattern:** same as `POST /out/methode` (`src/requestHandlers/methode.js`). The body carries `model` / `rootData`; the response is `{ action: "writeback", payload }`, which Neon stores under `pubInfo.webhookData.<hookName>`.
- **Multi-env:** route through the neon-env plugin (`?apikey=<env extApiKey>`), with the `withInsecureEnvParam` legacy fallback (`?env=<id>`), as `/in/neon/webhook` does in `server.js`. A background job must capture the env and run its Neon calls inside `context.run(env, …)` (see `src/helpers/taxonomy-builder/jobs.js`).
- **Neon BO API:** `src/helpers/neon-bo-api-v3.js` (`getNode`, `getNodeMetadata`, `lockNode`, `updateNodeMetadata`, `unlockNode`).
- **Text extraction:** reuse `src/helpers/neon-content-parser.js` (`findElementByNodeType`, `extractTextFromElements`) and `extractSummaryFromModel` as in `neon-to-methode.js`.
- **Panels:** follow the `neon-create-panel` skill and existing `src/panels/*.hbs`.
- **Jobs:** model the in-memory store on `src/helpers/taxonomy-builder/jobs.js` (ids, retention, per-key conflict).
- Node 20, Fastify 4, axios, `openai` SDK already installed. ElevenLabs is called over plain HTTPS (no new SDK required).
- Webhook timeouts: the webhook must answer in a few seconds; all heavy work is async.

## Approaches considered

| | Approach | Trade-off |
| --- | --- | --- |
| A | Fingerprint on every publish: unchanged text = no-op, changed text = regenerate audio in place | Corrections handled automatically, URL written once; a trivial typo fix also pays for a regeneration |
| B | Webhook fires on first publish only; corrections via a manual "Regenerate" call | Every regeneration is deliberate; corrections are easily forgotten, podcast drifts from article |
| **C (chosen)** | **A + Neon panel with status and "Force regenerate"** | Automatic and visible in the demo; slightly more to build (panel + status API) |

Chosen: **C**.

## Design

### 1. Endpoints

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| POST | `/out/transistor` | Neon webhook (on publish) | Ack + start/skip job |
| POST | `/out/transistor/legacy?env=<id>` | Neon webhook, keyless env | Same, via `withInsecureEnvParam` |
| POST | `/panels/podcast/api/regenerate` | Panel | `{ familyRef, provider?, force: true }` → job; body fetched from BO API |
| GET | `/panels/podcast/api/status?familyRef=` | Panel | Current job (if any) + podcast metadata from Neon |
| GET | `/panels/podcast` | Neon object editor | Panel UI |

All registered in the services dashboard list in `server.js`.

**Panel auth (call made in design, following existing panels):** panel API routes live under `/panels/podcast/api/*` and authenticate exactly like `methode-panel.hbs` / `panels.js` (`authenticate(request)`, browser sends the `apikey` header from panel state; env resolved by the neon-env plugin). No new auth scheme; the key exposure is the same as existing panels.

### 2. Webhook flow (`POST /out/transistor`)

1. Extract `neonModel` as Méthode does. Require `id` (familyRef).
2. Build **spoken text**: title, then summary, then body paragraphs (headings, paragraphs, lists, blockquotes; skip captions, embeds, tables, figures). Plain text, whitespace normalised.
3. `textHash = sha256(spokenText)`.
4. Read the podcast `Enabled` and `TextHash` values from the payload if exposed (cheap pre-check). The Méthode flow already reads custom metadata (`attributes.printSection`, which maps `/ObjectMetadata/DistributionChannels/Print/PrintSection`) and `pubInfo` from this same payload, and uses `model.id` as the familyRef. If the podcast values are not exposed in the payload, treat them as unknown and let the job's re-read of the metadata XML (§3 step 1) decide.
   - **Single source of truth:** the `<Podcast>` metadata node (§6). `pubInfo.webhookData.transistor` is informational only (last ack) and never used for decisions.
5. Decide:
   - `Enabled` is `false` → respond `{ status: "disabled", at }`. No job.
   - hash equal and not forced → respond `{ status: "unchanged", textHash, at }`. No job.
   - a job for this familyRef is already running → mark it `rerunRequested` (coalesce; it re-runs once with the latest text when done) → respond `{ status: "queued", jobId }`.
   - otherwise start a job → respond `{ status: "processing", jobId, textHash, at }`.
6. Response always `{ action: "writeback", payload: { ...above } }`. HTTP 200 immediately.

### 3. Job (async)

Steps, each recorded on the job (`step`, `startedAt`, `error`) for the panel:

1. **Re-read** the metadata XML from Neon (`getNodeMetadata`): authoritative `Enabled`, `EpisodeId`, `TextHash`. `Enabled` is `false` → finish as `disabled` (a forced regenerate also respects it). Hash equal and not forced → finish as `unchanged`.
2. **TTS** → one MP3 buffer (see §4).
3. **Upload to Transistor** (see §5): create the episode if there is no `EpisodeId`, otherwise replace the audio of the existing one.
4. **Write back to Neon** (lock → `updateNodeMetadata` → unlock; always unlock in `finally`): set `ShareUrl`, `MediaUrl`, `EpisodeId`, `TextHash`, `Provider`, `Status=ready`, `UpdatedAt` in the `<Podcast>` node (§6). Never touch `Enabled`.
   This is a metadata write, not a publish, so it does not fire the webhook. On later republishes, `TextHash` makes the webhook a no-op unless the text changed.
5. Job ends `done` | `unchanged` | `disabled` | `failed`. On `failed`, best-effort write `Status=failed` + `UpdatedAt` (keep existing URLs, so a failed correction leaves the previous audio in place). If `rerunRequested`, start again once.

Concurrency: one job per familyRef; global cap of 2 running jobs (others wait in FIFO). Retention: 24 h, like Taxonomy jobs.

### 4. TTS providers

Common interface `synthesize(text, { voice }) → Buffer (mp3)` in `src/helpers/tts/` with `elevenlabs.js`, `openai.js`, and `index.js` (selection + fallback).

- **Selection:** `TTS_PROVIDER` env (default `elevenlabs`); per-call override `provider` on `/regenerate` (and `?provider=` on the webhook URL).
- **Fallback to OpenAI** when ElevenLabs:
  - has no `ELEVENLABS_API_KEY`, or
  - returns quota/credit exhaustion (HTTP 401 with `quota_exceeded` detail, or 429 that is quota rather than rate). Plain rate-limit 429 → retry with backoff, not fallback.
- **No mixed voices:** if ElevenLabs fails partway through the chunks, discard all chunks and redo the **whole** text on OpenAI.
- **Chunking:** split on paragraph, then sentence, boundaries under each provider's per-request limit (OpenAI 4096 chars; ElevenLabs depends on model — builder verifies current limit). Synthesize chunks sequentially and concatenate the MP3 buffers (same encoder and bitrate, so byte concat plays correctly; no ffmpeg).
- **Config:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` (multilingual model, since demo articles may be Italian); `OPENAI_API_KEY` (existing), `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`. Sensible defaults are the builder's call.

### 5. Transistor.fm

API `https://api.transistor.fm/v1`, header `x-api-key: TRANSISTOR_API_KEY`, show `TRANSISTOR_SHOW_ID`.

- **Upload:** `GET /episodes/authorize_upload?filename=neon-<familyRef>-<ts>.mp3` → `upload_url`, `audio_url`; `PUT` MP3 to `upload_url` (`Content-Type: audio/mpeg`).
- **Create (first time):** `POST /episodes` with `show_id`, `title` (article title), `summary`, `description` (summary + link to article if available from `pubInfo`), `audio_url`; then `PATCH /episodes/:id/publish` with `status=published`.
- **Replace (correction):** `PATCH /episodes/:id` with the new `audio_url` and updated title/summary/description. Episode id and URLs stay the same. **Builder must verify that `audio_url` replacement is supported on PATCH** before relying on it; if not, stop and report (do not fall back to creating a new episode — anti-goal).
- If the stored `EpisodeId` no longer exists in Transistor (404), create a new episode and overwrite the metadata (URL changes; acceptable, logged).
- Respect rate limit (10 requests / 10 s) with simple backoff on 429.

### 6. Podcast metadata node

A dedicated node under `DistributionChannels`, next to `Print` (same convention as `/ObjectMetadata/DistributionChannels/Print/...` used by the Méthode panel; PascalCase elements with text values, compatible with `src/helpers/metadata-xpath-utils.js`).

```xml
<ObjectMetadata>
  <DistributionChannels>
    <Print>…</Print>
    <Podcast>
      <Enabled>true</Enabled>
      <ShareUrl>https://share.transistor.fm/s/abc123</ShareUrl>
      <MediaUrl>https://media.transistor.fm/abc123/episode.mp3</MediaUrl>
      <EpisodeId>2817391</EpisodeId>
      <TextHash>sha256:9f2c…</TextHash>
      <Provider>elevenlabs</Provider>
      <Status>ready</Status>
      <UpdatedAt>2026-11-27T14:32:00Z</UpdatedAt>
    </Podcast>
  </DistributionChannels>
</ObjectMetadata>
```

| Element | Written by | Meaning |
| --- | --- | --- |
| `Enabled` | Editor | Empty or `true` = generate; `false` = skip (per-article opt-out). The service never writes it |
| `ShareUrl` | Service | Public episode page (`share.transistor.fm/s/…`); primary candidate for `importbyurl` |
| `MediaUrl` | Service | Direct MP3 URL; alternative for `importbyurl` / plain audio player |
| `EpisodeId` | Service | Transistor episode id; drives create-vs-replace |
| `TextHash` | Service | `sha256:<hex>` of the spoken text |
| `Provider` | Service | `elevenlabs` \| `openai` |
| `Status` | Service | `ready` \| `failed` (last outcome; survives restarts) |
| `UpdatedAt` | Service | ISO 8601 UTC of last audio generation |

- Both URLs are stored, so no URL-kind config is needed; the later Neon design picks which one `importbyurl` uses. Both are stable across audio replacements.
- **Missing nodes:** `applyMetadataChanges` skips xpaths that match nothing. The writer must create `<DistributionChannels>` / `<Podcast>` / child elements when absent, so articles created before the template change still work. Builder adds this (e.g. an `ensure` action or a podcast-specific writer); existing behaviour of `applyMetadataChanges` must not change for other callers.
- Element names and xpaths live in one constants module, so a rename during the Neon definition is a one-line change.
- The metadata write lands on the article's current version; whether it is visible on the live site without republish is out of scope (later Neon design).
- **Prerequisite (Neon conf, outside this repo, defined later):** the article type's metadata DTD must declare the `<Podcast>` node (use the `neon-add-metadata` skill), and the webhook must be configured on publish, pointing at `/out/transistor?apikey=<env key>`. Until then, the integration can be exercised in the panel's demo mode / against a test env.

### 7. Panel (`/panels/podcast`)

Embedded in the Neon object editor (iframe, receives familyRef/env like other panels). Shows:

```text
 Podcast                                   ● Ready
 ───────────────────────────────────────────────
 Episode   share.transistor.fm/s/abc123   [open]
 Voice     ElevenLabs (fallback: —)
 Updated   27 Nov 2026 14:32
 [▶ audio preview]

 Provider  [ElevenLabs ▾]   [ Force regenerate ]
 Job       ▸ Generating audio (chunk 3/7)…
```

- Status states: `No podcast` · `Processing (step)` · `Ready` · `Failed (message)`.
- Polls `/status` every 3 s while a job runs.
- Force regenerate ignores the hash; provider select overrides default for that run.

### 8. Errors and logging

- Webhook never fails the publish: errors after the ack only surface on the job and in the panel.
- Synchronous errors (missing id, no env) → 400 like Méthode.
- Log each step with familyRef and jobId; redact API keys (`redact-url.js`).

## Left to the builder

- Exact text-extraction node types and the summary source, following the Méthode extractor.
- Default voices and models; ElevenLabs per-request char limit.
- Panel styling (follow existing panels / Neon design system).
- Retry counts and backoff values.
- Tests: unit tests for chunking, hash/decision logic, provider fallback, and Transistor create-vs-replace with mocked HTTP.
