# Phase 2 — Neon Populator + Delayed Importer Migration — Design

**Date:** 2026-06-14
**Status:** Approved
**Repo:** neon-integrations-example
**Branch:** `develop` (off `main`)

## Context

Phase 1 (see `docs/superpowers/specs/2026-06-14-nextjs-migration-design.md`) scaffolded the Next.js app under `web/`, ported `lib/core/{auth,utils,sites-helpers,middleware-logic}`, and set up the apikey-auth + iframe-proxy `proxy.ts`. Phase 1 deliberately deferred porting `neon-bo-api-v3.js` (the shared Neon Back Office API client) since it wasn't required for the smoke test.

Phase 2 picks the **Delayed Importer** integration (`POST/GET/DELETE /in/delayed-import` — simulates a content feed by importing stories/images into Neon over time) as the pilot for porting a real integration end-to-end. It depends on the **Populator** (`src/stories-populator.js` + the populator-relevant parts of `src/images-importer.js`), which in turn depends on `neon-bo-api-v3.js` and `neon-utils.js`. Porting this pilot exercises the full vertical-slice pattern: `lib/core` (shared Neon client) → `lib/integrations/<name>/service.ts` (business logic) → `app/api/.../route.ts` (thin adapter).

Methode integration (much larger — includes an 871-line `.hbs` panel with PDF preview/Swing proxy) is **out of scope** for this phase and gets its own design later.

## Scope

### 1. `web/lib/core/neon-bo-api-v3.ts` (full port)

Direct TypeScript port of `src/helpers/neon-bo-api-v3.js` (452 lines): `NeonClient` class (all ~25 methods) + flat API delegating to a `defaultClient` singleton, including:
- `makeRequest` (shared request wrapper: base URL, auth headers, `update-context-id`, error logging)
- `getCallerName()` / `logNeonCall()` — local dev call-logging to `logs/neon-calls/`, gated on `process.env.NEON_EXT_LOCATION === 'Local'`
- The three stubbed endpoints (`getGroups`, `getWorkflowDefinitions`, `getContentTypesConfig`) ported as-is, including their existing "remove stub when endpoint confirmed" TODO comments — these are pre-existing known-issues, not introduced by this port.

Ported in full (not just the populator/delayed-importer subset) because it's the shared Neon client every future integration phase will need — porting it once now avoids repeatedly revisiting this file.

### 2. `web/lib/core/neon-utils.ts` (partial port)

From `src/helpers/neon-utils.js` (102 lines):
- `workflowTransitionTo` — ported as-is.
- `nextStepAssignmentBodyGenerator` — ported as-is (internal helper used by `workflowTransitionTo`).
- `deleteObjectsByQuery` — **not ported**. It calls `neon.searchNodes(...)`, which does not exist on `NeonClient` (only `searchContents` does) — this is dead/broken code in the original and is unused by populator/delayed-importer. Left out; noted here so it isn't silently lost if someone goes looking for it.

### 3. `web/lib/integrations/populator/service.ts` (new)

Ported from `src/stories-populator.js` (183 lines):
- `getCreationOptions(itemData)` — as-is.
- `getOptionsFromData(itemData)` — as-is.
- `newNodeFromStory(story, publishStory)` — ported, **with the `story.translate` branch removed**. Always uses `getOptionsFromData(story)` for body options (previously: `story.translate ? await translateStory(story) : getOptionsFromData(story)`).
- `populateNeonInstance(data, options)` — ported as-is (sequential reduce over stories, sets target site/workspace/etc per story, calls `newNodeFromStory`).

**Not ported:**
- `translateStory` (DeepL integration) — deferred to Phase 3+. `story.translate` is simply never set by delayed-importer, so this is a no-op removal for the pilot's actual usage.
- `testStoryTranslations` — dev-only helper exercising `translateStory`, unused elsewhere; dropped along with it.
- No `deepl-node` dependency added to `web/`.

### 4. `web/lib/integrations/populator/images.ts` (new)

Populator-relevant subset of `src/images-importer.js` (291 lines):
- `imageToBase64(url)` — as-is (fetches an image via axios, returns `{ mimeType, base64 }`).
- `buildImageMetadataXml(metadata)` — as-is (pure XML string builder).
- `uploadImage(options)` — as-is (builds a manual multipart body, calls `neon.putNode`).
- `uploadImageFromStory(story)` — as-is.
- `mainImageReferenceGenerator(imageNode)` — as-is (pure).

**Not ported** (Methode-specific, stay in `src/images-importer.js` for the Methode phase):
- `prepareNeonImage`, `extractImageCaptions`, `modelImagesToMethode`, `uploadImageToMethode`, `isTrelloUrl`, `getTrelloCoverUrl`.
- No dependency on `neon-content-parser.js` or the `form-data` npm package needed for this subset (`uploadImage` builds its multipart body as a plain string).

### 5. `web/lib/integrations/delayed-importer/service.ts` (new)

Direct port of `src/delayed-importer.js` (263 lines): `validatePayload`, `createJob`, `getJob`, `listJobs`, `cancelJob`, `dispatchStoryItem`, `dispatchImageItem`, `_reset` (test helper), the in-memory `jobs` Map, scheduler (`setTimeout`-based ticks), and the 1-hour eviction of finished jobs. Same in-memory/no-persistence model as the original (documented limitation, unchanged).

`dispatchStoryItem`/`dispatchImageItem` call into `populator/service.ts` and `populator/images.ts` respectively (via the existing dependency-injection pattern — `deps.dispatchStory`/`deps.dispatchImage`, defaulting to the real implementations).

### 6. Routes (API-only — no panel/widget UI)

- `web/app/api/in/delayed-import/route.ts`
  - `POST` → `submitJobHandler` equivalent (`validatePayload` → 400 on invalid → `createJob` → 202)
  - `GET` → `listJobsHandler` equivalent (200 `{ jobs: [...] }`)
- `web/app/api/in/delayed-import/[jobId]/route.ts`
  - `GET` → `getJobHandler` equivalent (200 job snapshot / 404)
  - `DELETE` → `cancelJobHandler` equivalent (200 cancelled snapshot / 404 / 409 if already finished)

Auth is handled automatically by the existing `proxy.ts` matcher (`/api/:path*` requires `apikey`) — no per-route auth code needed (unlike the old Fastify handlers, which called `authenticate()` manually per handler).

### Dependencies added to `web/`

- `dayjs` (used by `populator/service.ts` for `getCreationOptions`'s issue date, and by `delayed-importer/service.ts` for job IDs)

No other new dependencies (`axios` already present from Phase 1's `sites-helpers.ts`).

## Testing

- Port `test/delayed-importer.test.js` → `web/lib/integrations/delayed-importer/__tests__/service.test.ts` (vitest). This file is pure logic with dependency-injected dispatchers — straightforward 1:1 port.
- New `web/lib/core/__tests__/neon-bo-api-v3.test.ts`: mock axios, verify `makeRequest`'s header/auth shaping, success/error logging paths, and the three stub fallbacks (`getGroups`, `getWorkflowDefinitions`, `getContentTypesConfig`) return their documented stub shapes on request failure.
- New `web/lib/integrations/populator/__tests__/images.test.ts`: `buildImageMetadataXml` and `mainImageReferenceGenerator` (pure, direct assertions); `uploadImage`/`uploadImageFromStory`/`imageToBase64` with mocked axios.
- New `web/lib/integrations/populator/__tests__/service.test.ts`: `getCreationOptions`/`getOptionsFromData` (pure); `newNodeFromStory`/`populateNeonInstance` with mocked `neon-bo-api-v3` + `images` + `neon-utils`.
- New `web/app/api/in/delayed-import/__tests__/route.test.ts` (or alongside `proxy`/`health` test style): exercise the route handlers + `proxy()` for auth, mirroring `web/__tests__/health.test.ts`'s pattern.

## Verification

- `cd web && npx vitest run` — all existing (77) + new tests pass.
- `npm run lint` / `npm run build` clean.
- Manual smoke test: `curl -X POST -H "apikey: $NEON_EXT_APIKEY" -H "Content-Type: application/json" -d '{...minimal valid payload...}' localhost:PORT/api/in/delayed-import` → 202 with `jobId`; `GET .../api/in/delayed-import/<jobId>` → job status. (Against a real Neon BO instance if credentials are configured locally; otherwise verify request shaping only, since `NeonClient` will fail to connect without `NEON_BO_URL`/`NEON_BO_APIKEY` — this is expected and matches the old Fastify app's behavior.)
- Existing Fastify app (`main`/`render`, `src/delayed-importer.js` etc.) untouched.

## Out of scope / deferred

- DeepL translation (`translateStory`, `testStoryTranslations`) — Phase 3+.
- Methode-specific image functions in `images-importer.js` — Methode phase.
- Any UI/page for delayed-importer (matches current API-only behavior).
- `neon-content-parser.js` port — not needed until Methode phase.
