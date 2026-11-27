# Transistor.fm Article-to-Podcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Neon publish, turn the article into an MP3 (ElevenLabs, OpenAI fallback), publish or replace it as a Transistor.fm episode, and write the episode URLs into a `<Podcast>` metadata node on the article; plus a Neon panel with status and force-regenerate.

**Architecture:** A webhook handler acks immediately and hands off to an in-memory job store (one job per article, global cap 2). The job reads authoritative state from the article's metadata XML, synthesizes audio via a provider-agnostic TTS module, uploads to Transistor via a small client, and writes the `<Podcast>` node back. All external HTTP goes through an injectable `fetchImpl` so every unit is tested with fakes.

**Tech Stack:** Node 20 (global `fetch`, `node:test`), Fastify 4, `@xmldom/xmldom` + `xpath` (already installed), Handlebars panels.

**Spec:** `docs/superpowers/specs/2026-11-27-transistor-podcast-design.md`

## Global Constraints

- One article = one Transistor episode, forever. Never create a second episode for an article that has an `EpisodeId`, except when Transistor returns 404 for it (spec §5).
- Never mix two voices in one episode: on ElevenLabs failure mid-article, redo the **whole** text on OpenAI (spec §4).
- This service never triggers a Neon publish.
- Webhook answers HTTP 200 immediately with `{ action: "writeback", payload }`; payload `status` ∈ `processing` | `queued` | `unchanged` | `disabled` (spec §2).
- Metadata node: `/ObjectMetadata/DistributionChannels/Podcast/{Enabled,ShareUrl,MediaUrl,EpisodeId,TextHash,Provider,Status,UpdatedAt}`. The service never writes `Enabled`. `TextHash` format `sha256:<hex>`. `Status` ∈ `ready` | `failed`. `UpdatedAt` ISO 8601 UTC (spec §6).
- Opt-in: only `Enabled` = `true` (case-insensitive, trimmed) generates. `false`, empty, or no `<Podcast>` node → skip, even when forced. Template default is `false` (demorc conf, set 2026-11-27).
- Job concurrency: one per familyRef, global cap 2 (FIFO wait), retention 24 h. Concurrent publish while running → `rerunRequested`, re-run once.
- Third-party config goes through `serviceConfig()` in `src/helpers/neon-env/services.js` (per-env block, else global env vars). Global env var names follow that file's `*_APIKEY` convention: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `OPENAI_APIKEY` (existing), `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `TRANSISTOR_APIKEY`, `TRANSISTOR_SHOW_ID`, plus plain `TTS_PROVIDER` (default `elevenlabs`). *`ELEVENLABS_API_KEY` keeps the name already in the user's `.env`; the others follow the repo's `*_APIKEY` convention.*
- Metadata write follows the proven flow in `src/requestHandlers/metadata.js`: `getNodeMetadata` → modify XML → `updateNodeMetadata`, no lock. *Deviation from spec §3 step 4 (lock/unlock):* add `lockNode`/`unlockNode` (unlock in `finally`) only if Neon rejects the unlocked write during manual verification.
- New test files must be added to the `test` script in `package.json` (it lists files explicitly).
- Never log API keys; use `src/helpers/redact-url.js` for URLs.

## Review Focus

- **Article with an empty body (title only):** spoken text is still non-empty (title), job completes; text below 1 char never reaches TTS → job fails with `"empty spoken text"`. Test in Task 2.
- **Very long article (> 30 chunks):** chunking never splits a word and never yields a chunk over the limit, even for a single sentence longer than the limit. Test in Task 2.
- **Metadata XML without `<DistributionChannels>` at all:** writer creates the full path, keeps the DOCTYPE and all other nodes untouched. Test in Task 1.
- **ElevenLabs quota exhausted on chunk 3 of 5:** result audio comes only from OpenAI, `provider === 'openai'`, ElevenLabs chunks discarded. Test in Task 3.
- **Job crashes after Transistor succeeded but Neon write failed:** episode exists, `Status=failed` best-effort, a later publish (hash differs from stored) must replace, not create — only true if `EpisodeId` was written. Mitigation: write `EpisodeId` + URLs immediately after a create, before anything else can fail. Test in Task 5.

---

### Task 1: Podcast metadata read/write

**Files:**
- Create: `src/helpers/podcast/metadata.js`
- Test: `test/podcast/metadata.test.js`
- Modify: `package.json` (add `test/podcast/*.test.js` to `test` script)

**Interfaces:**
- Produces:
  - `PODCAST_PATH = '/ObjectMetadata/DistributionChannels/Podcast'`, `PODCAST_FIELDS = ['Enabled','ShareUrl','MediaUrl','EpisodeId','TextHash','Provider','Status','UpdatedAt']`
  - `readPodcastMetadata(xml: string) → { enabled: boolean, shareUrl, mediaUrl, episodeId, textHash, provider, status, updatedAt }` (strings or `null`; `enabled` is `true` only when text is exactly `true`, case-insensitive, trimmed; otherwise `false`)
  - `writePodcastMetadata(xml: string, fields: { shareUrl?, mediaUrl?, episodeId?, textHash?, provider?, status?, updatedAt? }) → string` — sets only provided keys, creates missing `DistributionChannels`/`Podcast`/child elements, never touches `Enabled`

- [ ] **Step 1: Write failing tests** in `test/podcast/metadata.test.js` (style of `test/metadata-xpath-utils.test.js`):
  - `readPodcastMetadata` on XML with no Podcast node → `{ enabled: false, shareUrl: null, … }`
  - `Enabled` = ` TRUE ` → `enabled === true`; `Enabled` empty → `false`; `false` → `false`
  - full node → all fields read
  - `writePodcastMetadata` on XML with no `DistributionChannels` → result contains `<DistributionChannels><Podcast><ShareUrl>https://share.transistor.fm/s/abc</ShareUrl>` and still contains the original DOCTYPE and `<SEO>…</SEO>`
  - existing `<Print><PrintSection>/Product/World</PrintSection></Print>` preserved, `Podcast` appended as sibling
  - writing `{ status: 'failed' }` leaves existing `ShareUrl` unchanged
  - passing `enabled: false` in fields is ignored (`Enabled` unchanged)
  - round trip: write then read returns written values
- [ ] **Step 2:** `node --test test/podcast/metadata.test.js` → FAIL (module not found)
- [ ] **Step 3: Implement** with `@xmldom/xmldom` + `xpath` (same as `metadata-xpath-utils.js`); field-name ↔ element map in one constant. Do not modify `applyMetadataChanges`.
- [ ] **Step 4:** `node --test test/podcast/metadata.test.js` → PASS; `npm test` → all PASS
- [ ] **Step 5: Commit** `feat(podcast): read/write <Podcast> metadata node`

---

### Task 2: Spoken text, hash, chunking

**Files:**
- Create: `src/helpers/podcast/spoken-text.js`
- Test: `test/podcast/spoken-text.test.js`

**Interfaces:**
- Consumes: `findElementByNodeType`, `extractTextFromElements` from `src/helpers/neon-content-parser.js`
- Produces:
  - `buildSpokenText(model) → string` — `model` is a webhook `rootData` or a `getNode` result (both shapes, as `parseNeonArticleContent` accepts). Order: title, summary (`model.summary` else story `summary` element), then body text-element children in order: `p`, headings, list items, blockquotes. Skips captions, figures, tables, embeds. Blocks joined with `\n\n`, whitespace inside a block collapsed.
  - `textHash(text: string) → 'sha256:<64 hex>'` (`node:crypto`)
  - `chunkText(text: string, maxChars: number) → string[]` — split on `\n\n`, then sentence boundaries (`. ! ? …` followed by space), then word boundaries; greedy pack; every chunk `<= maxChars`, none empty, `chunks.join(' ')` contains every word in order.

- [ ] **Step 1: Write failing tests:**
  - `buildSpokenText(require('../../examples/out-methode.json').rootData)` starts with `"SEC's Bold Climate Disclosure Proposal"` and contains the summary text
  - same text from `{ rootData }` wrapper and from bare model → identical
  - title-only model → returns title
  - `textHash('a') === textHash('a')`, `!== textHash('b')`, matches `/^sha256:[0-9a-f]{64}$/`
  - `chunkText` of 3 paragraphs of 100 chars with max 250 → 2 chunks, first holds 2 paragraphs
  - single 900-char sentence, max 400 → 3 chunks, each ≤ 400, no word split
  - 40 paragraphs → every chunk ≤ max, words in order
- [ ] **Step 2:** `node --test test/podcast/spoken-text.test.js` → FAIL
- [ ] **Step 3: Implement** the three functions. Inspect `examples/out-methode.json` element tree to confirm node types for headings/lists/blockquotes before writing the walker.
- [ ] **Step 4:** test → PASS
- [ ] **Step 5: Commit** `feat(podcast): spoken text extraction, hashing and chunking`

---

### Task 3: TTS providers with fallback

**Files:**
- Create: `src/helpers/tts/elevenlabs.js`, `src/helpers/tts/openai.js`, `src/helpers/tts/index.js`
- Modify: `src/helpers/neon-env/services.js` (`GLOBAL_SERVICES`: add `elevenlabs: { apiKey: 'ELEVENLABS_API_KEY', voiceId: 'ELEVENLABS_VOICE_ID', model: 'ELEVENLABS_MODEL' }`; extend `openai` with `ttsModel: 'OPENAI_TTS_MODEL', ttsVoice: 'OPENAI_TTS_VOICE'`)
- Test: `test/tts/tts.test.js`; add `test/tts/*.test.js` to `package.json`

**Interfaces:**
- Consumes: `chunkText` (Task 2)
- Produces:
  - `class QuotaExceededError extends Error` (in `index.js`)
  - `createElevenLabsProvider({ apiKey, voiceId, model, fetchImpl = fetch }) → { name: 'elevenlabs', maxChars, synthesizeChunk(text) → Promise<Buffer> }` — `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` header `xi-api-key`, body `{ text, model_id }`, `Accept: audio/mpeg`. HTTP 401 whose body contains `quota_exceeded`, or 402 → `QuotaExceededError`. 429 → retry (3 tries, backoff 1s/2s/4s) then throw plain `Error`.
  - `createOpenAiProvider({ apiKey, model, voice, fetchImpl = fetch }) → { name: 'openai', maxChars: 4096, synthesizeChunk }` — `POST https://api.openai.com/v1/audio/speech` `{ model, voice, input, response_format: 'mp3' }`. Plain fetch, not the SDK (consistent injection for tests).
  - `synthesize(text, { provider?: 'elevenlabs'|'openai', providers? }) → Promise<{ audio: Buffer, provider: string, fellBack: boolean }>` — `provider` default `process.env.TTS_PROVIDER || 'elevenlabs'`; `providers` (tests) overrides the factory-built ones (built from `serviceConfig`). ElevenLabs with no `apiKey` or `QuotaExceededError` on any chunk → discard everything, run whole text on OpenAI, `fellBack: true`. Other errors propagate. Chunks synthesized sequentially, buffers `Buffer.concat`ed.
- Defaults (builder's call per spec): ElevenLabs model `eleven_multilingual_v2`, `maxChars` per the current ElevenLabs docs for that model (check docs; if unsure use 5000); OpenAI model `gpt-4o-mini-tts`, voice `alloy`. Empty text → throw `Error('empty spoken text')`.

- [ ] **Step 1: Write failing tests** with fake providers / fake `fetchImpl`:
  - default provider elevenlabs, all chunks OK → `provider === 'elevenlabs'`, audio = concat of chunk buffers in order
  - elevenlabs throws `QuotaExceededError` on chunk 3 of 5 → `provider === 'openai'`, `fellBack === true`, audio contains only OpenAI buffers, OpenAI got all 5 chunks' text (via its own chunking)
  - elevenlabs `apiKey` missing → OpenAI used without calling elevenlabs
  - elevenlabs generic error → rejects, OpenAI not called
  - `{ provider: 'openai' }` → elevenlabs never called
  - ElevenLabs provider: fake fetch 401 `{"detail":{"status":"quota_exceeded"}}` → `QuotaExceededError`; 429 twice then 200 → resolves (inject a zero-delay sleep)
  - `synthesize('')` → rejects `empty spoken text`
- [ ] **Step 2:** `node --test test/tts/tts.test.js` → FAIL
- [ ] **Step 3: Implement** the three files and the `services.js` additions.
- [ ] **Step 4:** test → PASS; `npm test` → PASS (neon-env tests still green after `GLOBAL_SERVICES` change)
- [ ] **Step 5: Commit** `feat(tts): ElevenLabs and OpenAI providers with quota fallback`

---

### Task 4: Transistor client

**Files:**
- Create: `src/helpers/transistor/client.js`
- Modify: `src/helpers/neon-env/services.js` (`transistor: { apiKey: 'TRANSISTOR_APIKEY', showId: 'TRANSISTOR_SHOW_ID' }`)
- Test: `test/transistor/client.test.js`; add `test/transistor/*.test.js` to `package.json`

**Interfaces:**
- Produces:
  - `class EpisodeNotFoundError extends Error`
  - `createTransistorClient({ apiKey, showId, fetchImpl = fetch, sleep }) →`
    - `uploadAudio(buffer, filename) → Promise<string audioUrl>` — `GET /v1/episodes/authorize_upload?filename=` then `PUT upload_url` (`Content-Type: audio/mpeg`)
    - `createEpisode({ title, summary, description, audioUrl }) → Promise<Episode>` — `POST /v1/episodes` (`episode[show_id]`, `episode[title]`, …, `episode[audio_url]`) then `PATCH /v1/episodes/:id/publish` (`episode[status]=published`)
    - `replaceEpisodeAudio(id, { title, summary, description, audioUrl }) → Promise<Episode>` — `PATCH /v1/episodes/:id`; 404 → `EpisodeNotFoundError`
  - `Episode = { id: string, shareUrl: string, mediaUrl: string }` from JSON:API `data.id`, `data.attributes.share_url`, `data.attributes.media_url`
  - Base `https://api.transistor.fm`, header `x-api-key`. 429 → backoff retry (3 tries).

- [ ] **Step 1: Verify the API before coding.** Read the Transistor API reference (developers.transistor.fm): confirm `authorize_upload` response fields, request body format (form-encoded `episode[...]` vs JSON), the `publish` endpoint, and **that `PATCH /v1/episodes/:id` accepts `audio_url`**. If audio replacement is not supported: STOP the plan and report to the human (spec §5, anti-goal: no second episode). Record what you confirmed in the commit message.
- [ ] **Step 2: Write failing tests** with a fake `fetchImpl` recording calls:
  - `uploadAudio` → first call GET authorize_upload with filename, second PUT to returned `upload_url` with the buffer; returns `audio_url`
  - `createEpisode` → POST then PATCH publish; returns `{ id: '123', shareUrl, mediaUrl }`
  - `replaceEpisodeAudio('123', …)` → single PATCH to `/v1/episodes/123` carrying the new audio URL; no POST
  - `replaceEpisodeAudio` with 404 → `EpisodeNotFoundError`
  - every request carries `x-api-key`
  - 429 then 200 → succeeds
- [ ] **Step 3:** `node --test test/transistor/client.test.js` → FAIL
- [ ] **Step 4: Implement** the client per Step 1 findings.
- [ ] **Step 5:** test → PASS
- [ ] **Step 6: Commit** `feat(transistor): API client with upload, create and in-place audio replace`

---

### Task 5: Podcast job store and pipeline

**Files:**
- Create: `src/helpers/podcast/jobs.js`
- Test: `test/podcast/jobs.test.js`

**Interfaces:**
- Consumes: Task 1 (`readPodcastMetadata`, `writePodcastMetadata`), Task 2 (`buildSpokenText`, `textHash`), Task 3 (`synthesize`), Task 4 (`createTransistorClient`, `EpisodeNotFoundError`), `context.run` from `src/helpers/neon-env/context.js`, `clientFor(env)` from `neon-bo-api-v3.js`.
- Produces:
  - `decideWebhook({ model, force }) → { action: 'disabled'|'unchanged'|'start', textHash }` — uses `buildSpokenText`/`textHash` and any podcast values exposed in `model` (none expected; treat as unknown → `start`). Pure.
  - `startPodcastJob({ env, familyRef, model?, force = false, provider? }) → { status: 'processing'|'queued', jobId }`
  - `getJobForArticle(envId, familyRef) → Job | null` (running, else most recent)
  - `Job = { id, envId, familyRef, state: 'waiting'|'running'|'done'|'unchanged'|'disabled'|'failed', step, chunk?: { done, total }, provider, fellBack, error, startedAt, finishedAt, rerunRequested }`
  - `__setDepsForTest({ neon, synthesize, transistor, now })`, `__resetForTest()`
- Pipeline (spec §3), each step sets `job.step`:
  1. `reading-metadata`: `neon.getNodeMetadata(familyRef)` → `readPodcastMetadata`. `enabled !== true` → `disabled`. If no `model`, `neon.getNode(familyRef)`. Build text + hash; hash equal to stored and not `force` → `unchanged`.
  2. `generating-audio`: `synthesize(text, { provider })`.
  3. `uploading`: `uploadAudio`; `episodeId` ? `replaceEpisodeAudio` (on `EpisodeNotFoundError` → log, `createEpisode`) : `createEpisode`. Episode title/summary/description from model title/summary (+ article URL from `pubInfo` when present).
  4. `writing-metadata`: re-fetch XML, `writePodcastMetadata` with `shareUrl, mediaUrl, episodeId, textHash, provider, status: 'ready', updatedAt`, `updateNodeMetadata`. **After a `createEpisode`, this write happens immediately** (Review Focus).
  5. On any error: `state = 'failed'`, best-effort write `{ status: 'failed', updatedAt }` (swallow its error). Then if `rerunRequested`, start once more (with `model` cleared so text is re-fetched).
- Run everything inside `context.run(env, …)`. Ids `pod-YYYYMMDD-<6 hex>` like `taxonomy-builder/jobs.js`. Cap 2 running globally, FIFO queue of waiting jobs. Retention 24 h for finished jobs.

- [ ] **Step 1: Write failing tests** with fakes (in-memory metadata XML, fake synthesize, fake transistor):
  - no `EpisodeId` → `createEpisode` called once, metadata gets `ShareUrl`, `EpisodeId`, `TextHash`, `Status=ready`, `Provider`
  - stored `EpisodeId` + different hash → `replaceEpisodeAudio` called, `createEpisode` never called
  - stored hash equal, not forced → state `unchanged`, synthesize never called
  - stored hash equal, `force: true` → regenerated via replace
  - `Enabled=false`, `force: true` → `disabled`, nothing called
  - no `<Podcast>` node → `disabled`, nothing called
  - (all other job fixtures use `<Enabled>true</Enabled>`)
  - replace throws `EpisodeNotFoundError` → `createEpisode` called, new `EpisodeId` written
  - synthesize throws → state `failed`, metadata `Status=failed`, existing `ShareUrl` kept
  - second `startPodcastJob` for same article while running → `{ status: 'queued', jobId: <same> }`, exactly one extra run after the first finishes
  - three different articles started → at most 2 running at once, third runs after one finishes
  - `updateNodeMetadata` fails after `createEpisode` → state `failed`; `createEpisode` called once (no retry creating a second episode)
- [ ] **Step 2:** `node --test test/podcast/jobs.test.js` → FAIL
- [ ] **Step 3: Implement** `jobs.js`.
- [ ] **Step 4:** test → PASS; `npm test` → PASS
- [ ] **Step 5: Commit** `feat(podcast): background job pipeline with create/replace and coalescing`

---

### Task 6: Webhook and panel API endpoints

**Files:**
- Create: `src/requestHandlers/transistor.js`
- Modify: `server.js` (routes near the Méthode block ~line 437; services list entries near line 132 and the panels list near line 182)
- Test: `test/podcast/handlers.test.js`

**Interfaces:**
- Consumes: Task 5 (`decideWebhook`, `startPodcastJob`, `getJobForArticle`), Task 1 (`readPodcastMetadata`), `authenticate` from `src/helpers/auth.js`, `withInsecureEnvParam`.
- Produces handlers:
  - `postTransistorWebhook(request, reply)` — `POST /out/transistor` and `POST /out/transistor/legacy` (wrapped in `withInsecureEnvParam`). Model extraction identical to `methode.js` (`(model && model.data) || rootData || model`); missing → 400 `{ error: "Missing model in request body" }`; no `id` → 400. `request.query.provider` passed through. Response 200 `{ action: 'writeback', payload: { status, jobId?, textHash?, at } }`. Unauthenticated (no env) → 401, as the webhook plugin decides.
  - `getPodcastStatus` — `GET /panels/podcast/api/status?familyRef=` → `{ job: Job|null, metadata: readPodcastMetadata(...) }`; 400 without familyRef; 401 via `authenticate`.
  - `postPodcastRegenerate` — `POST /panels/podcast/api/regenerate` body `{ familyRef, provider? }` → `startPodcastJob({ force: true, … })` → 202 `{ status, jobId }`.
  - `?demo=true` on status/regenerate → simulated job (no Neon/Transistor calls), so the panel works without a configured env.

- [ ] **Step 1: Write failing tests** calling handlers with fake `request`/`reply` (stub Task 5 module via `__setDepsForTest` or `require.cache`):
  - webhook with `examples/out-methode.json` body → 200, `action === 'writeback'`, `payload.status === 'processing'`, `payload.jobId` set
  - webhook with `{}` → 400 `Missing model in request body`
  - regenerate without familyRef → 400
  - status for unknown article → `{ job: null, metadata: {...enabled: false} }`
- [ ] **Step 2:** `node --test test/podcast/handlers.test.js` → FAIL
- [ ] **Step 3: Implement** handlers and register routes + services-list entries in `server.js`.
- [ ] **Step 4:** test → PASS; `npm test` → PASS
- [ ] **Step 5: Manual check:** `npm run dev`, then `curl -s -X POST "http://localhost:3000/out/transistor?apikey=<local key>" -H 'content-type: application/json' --data @examples/out-methode.json` → 200 with `processing`; server log shows the job steps (expected to fail at audio or upload until keys exist — log must name the step and not leak keys).
- [ ] **Step 6: Commit** `feat(transistor): webhook and panel API endpoints`

---

### Task 7: Podcast panel

**Files:**
- Create: `src/panels/podcast-panel.hbs`
- Modify: `src/requestHandlers/panels.js` (add `podcastPanelHandler`, export), `server.js` (`GET /panels/podcast`)

**Interfaces:**
- Consumes: Task 6 endpoints.
- Follow the `neon-create-panel` skill and `article-pdf-panel.hbs` / `articlePdfPanelHandler` (objectId from query, else via `panel-ready`/`getInfo` postMessage; `apiKey` header from panel state; `?demo=true`).
- UI per spec §7 mockup: header status pill (`No podcast` · `Processing — <step>` (+ `chunk n/m`) · `Ready` · `Failed — <error>` · `Disabled`); Episode share URL with open link; MediaUrl `<audio controls>` preview; Voice (`ElevenLabs` / `OpenAI (fallback)` when `fellBack`); Updated time; Provider select (ElevenLabs, OpenAI) + "Force regenerate" button (disabled while a job runs or when `enabled !== true`). Poll status every 3 s while running, stop when finished.

- [ ] **Step 1: Implement** handler, route and template.
- [ ] **Step 2: Verify in browser:** `npm run dev`, open `http://localhost:3000/panels/podcast?demo=true&apikey=<local key>` → status renders; clicking Force regenerate shows the processing steps then Ready. Take a screenshot (webapp-testing / `run` skill).
- [ ] **Step 3:** `npm test` → PASS
- [ ] **Step 4: Commit** `feat(podcast): Neon panel with status and force regenerate`

---

### Task 8: Configuration docs and end-to-end check

**Files:**
- Modify: `.env.example` (new vars from Global Constraints, empty values), `CLAUDE.md` (Outbound Integrations: add Transistor.fm line)

- [ ] **Step 1:** Add the env vars and the one-line doc entries.
- [ ] **Step 2: End-to-end (needs real keys; skip and report if absent):** with `OPENAI_APIKEY`, `TRANSISTOR_APIKEY`, `TRANSISTOR_SHOW_ID` set and `TTS_PROVIDER` unset (no ElevenLabs key → fallback path): POST the example payload with `?env=<test env>` against a test Neon env whose article type has the `<Podcast>` node, on an article with `Enabled=true`. Expect: episode visible in Transistor, `<Podcast>` node populated, `Provider=openai`. Re-POST same payload → `unchanged`, no new episode. Change body text, re-POST → same `EpisodeId`, new audio.
- [ ] **Step 3: Commit** `docs(transistor): env vars and integration entry`
