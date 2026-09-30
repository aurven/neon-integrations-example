# Delayed Importer Service — Design

**Date:** 2026-06-10
**Status:** Approved pending user review
**Repo:** neon-integrations-example

## Purpose

API-only service that simulates a realistic content feed into Neon Back Office. A single request submits a batch of items (stories and/or images); the service imports them one at a time, spread evenly across a caller-supplied timespan, into a target workfolder. Reuses the existing import machinery (`stories-populator.js`, `images-importer.js`, `neon-bo-api-v3.js`) — no new Neon API code.

## Decisions (validated with user)

| Topic | Decision |
|---|---|
| Timing | Even interval: `intervalMs = duration / itemCount`. First item fires **immediately** on submit, then one item per interval. |
| Persistence | In-memory only. Jobs are lost on server restart; acceptable for simulation/demo purposes. |
| Job control | Submit + status + list + cancel endpoints. |
| Payload | Mixed batches: each item declares `type: "story" \| "image"`. |
| Workfolder | Job-level default (`site`, `workspace`, `workfolder`); each item may override `workfolder`. |
| Publish | Job-level `publish` flag, default `false` (items land as drafts in the workfolder, workflow state `Revision`). |

## Architecture

Two new files, following the existing repo layout:

```
src/
  delayed-importer.js               # job store + scheduler + item dispatch (core logic)
  requestHandlers/
    neon-delayed-import.js          # Fastify handlers: auth, validation, HTTP mapping
server.js                           # registers the 4 new routes
```

- **`src/delayed-importer.js`** owns a module-level `Map<jobId, Job>` and the timer chain. It exposes `createJob(payload)`, `getJob(jobId)`, `listJobs()`, `cancelJob(jobId)`. No HTTP concerns.
- **`src/requestHandlers/neon-delayed-import.js`** follows the existing handler pattern (`authenticate()` guard, `safeLogRequest` logging, `console.log` IN/OUT) and translates HTTP ⇄ core calls.

### Why not reuse `populateNeonInstance` directly

`populateNeonInstance` is batch-sequential (reduce-chain, no delays), has no image branch, and uses a shared module-level `createdIds` array (not safe for concurrent jobs). The delayed importer calls the lower-level functions per item instead: `storiesPopulator.newNodeFromStory(story, publish)` for stories and `imagesImporter.uploadImage(...)` for images.

## API

All endpoints require the `apikey` header (validated against `NEON_EXT_APIKEY` via `helpers/auth.js`), consistent with every other endpoint in the repo.

Route prefix: **`/in/delayed-import`** (inbound integration → follows the `/in/*` convention for "external source → Neon").

### POST `/in/delayed-import`

Submit a job.

**Request body:**

```json
{
  "duration": 30,
  "site": "demo-site",
  "workspace": "Demo Workspace",
  "workfolder": "/Demo/Imports",
  "publish": false,
  "items": [
    {
      "contentType": "story",
      "type": "wirestory",
      "title": "Headline here",
      "content": "<p>Body HTML…</p>",
      "summary": "Optional standfirst",
      "byline": "Optional byline",
      "metadata": {},
      "workfolder": "/Demo/Imports/Politics"
    },
    {
      "contentType": "image",
      "url": "https://example.com/live/image.jpg",
      "name": "optional-file-name",
      "metadata": { "caption": "…", "credit": "…" },
      "workfolder": "/Demo/Imports/Photos"
    }
  ]
}
```

- `duration`: minutes, number > 0, required.
- `site`, `workspace`: required (same semantics as the existing `/in/import` handler).
- `workfolder`: job-level default target; per-item `workfolder` overrides it. At least one of the two must resolve for every item.
- `publish`: optional, default `false`.
- `items`: non-empty array; each item must have a valid `contentType` (`story` or `image`) and that type's required fields (`title`+`content` for story, `url` for image).
- `type` (story items only): Neon content type for the created node (e.g. `article`, `wirestory`). Optional, defaults to `article`.

**Validation failures** → `400` with `{ error: "<reason>" }`, listing the index of the first invalid item. Nothing is scheduled on a 400.

**Response `202 Accepted`:**

```json
{
  "jobId": "dlyimp-20260610-a1b2c3",
  "itemCount": 12,
  "intervalMs": 150000,
  "estimatedEndAt": "2026-06-10T15:42:00.000Z"
}
```

### GET `/in/delayed-import`

List all jobs currently in memory (running + finished not yet evicted).

```json
{ "jobs": [ { "jobId": "…", "state": "running", "done": 4, "total": 12, "nextFireAt": "…" } ] }
```

### GET `/in/delayed-import/:jobId`

Full job status:

```json
{
  "jobId": "…",
  "state": "running",
  "done": 4,
  "total": 12,
  "errors": 1,
  "intervalMs": 150000,
  "startedAt": "…",
  "nextFireAt": "…",
  "results": [
    { "index": 0, "type": "story", "status": "ok", "familyRef": "…", "at": "…" },
    { "index": 1, "type": "image", "status": "error", "error": "fetch failed: 404", "at": "…" }
  ]
}
```

`state ∈ running | completed | cancelled`. Unknown jobId → `404`.

### DELETE `/in/delayed-import/:jobId`

Cancel pending ticks. Already-imported items are untouched (no rollback). Returns final job snapshot with `state: "cancelled"`. Cancelling a finished job → `409`. Unknown jobId → `404`.

## Scheduler behavior

- `intervalMs = (duration * 60000) / items.length`.
- Item 0 dispatched immediately (async, after the 202 is sent); each subsequent item scheduled with `setTimeout(intervalMs)` chained from the completion of the previous dispatch — avoids overlapping imports if a single import runs long. `nextFireAt` reflects the chained schedule.
- Per-item errors are caught, recorded in `results`, and the job continues with the next item. A job never fails as a whole.
- Job IDs: `dlyimp-<yyyymmdd>-<6 random hex>`.
- Finished/cancelled jobs evicted from the Map 1 hour after completion (single `setTimeout` per job).

## Item dispatch mapping

### Story item → `storiesPopulator.newNodeFromStory(story, publish)`

The delayed importer builds the `story` object the populator expects:

| Item field | Story field |
|---|---|
| `title` | `title`, `headline` |
| `content` | `mainContentHtml` |
| `summary` | `summary` |
| `byline` | `byline` |
| `metadata` | `metadata` |
| job `site` | `tgtSite` |
| item `workfolder` ?? job `workfolder` ?? job `workspace` | `tgtWorkspace` (used as Neon `workFolder` by `getCreationOptions`) |
| job `publish` | second argument `publishStory` |

No `figureUrl`, `language`, or `translate` set — `uploadImageFromStory` no-ops without `figureUrl`, translation branch skipped.

### Image item → `imagesImporter.uploadImage({ imageName, imageUrl, workspace, metadata })`

- `imageUrl` = item `url` (fetched live at tick time, converted to base64 — existing `imageToBase64`).
- `imageName` = item `name` || derived via `utils.getImageNameFromUrl(url)`.
- `workspace` = item `workfolder` ?? job `workfolder` ?? job `workspace`.

**Targeted improvement (in scope):** `uploadImage` currently hardcodes empty `<credit>` in the IPTC XML. Add an optional `metadata: { caption, credit }` field to its options object and inject the values (XML-escaped) into the generated `ObjectMetadata`. Backward compatible — all existing callers pass no metadata and get today's behavior.

## Error handling

- Auth failure → `401` (standard pattern).
- Body validation → `400` before scheduling.
- Per-item dispatch errors (Neon API failure, image fetch failure) → logged with `❌` prefix (repo convention), recorded in `results`, job continues.
- Server restart → jobs vanish; documented limitation.

## Testing

Repo has no test framework; verification is manual, matching existing practice:

1. Start dev server (`npm run dev`) against a Neon sandbox.
2. Submit a 3-item mixed job with a short duration (e.g. 1 minute) and observe: immediate first import, two more at ~20s intervals, items appearing in the target workfolder as drafts.
3. Check `GET` status mid-run (running, nextFireAt populated) and after (completed, 3 results).
4. Submit + `DELETE` mid-run → remaining ticks stop, state `cancelled`.
5. Invalid payloads (no items, bad type, missing url) → `400`.
6. Image item with bad URL → job completes, result row carries error.

## Out of scope

- Persistence / resume after restart.
- Per-item custom delays or randomized timing.
- Rollback/deletion of imported items on cancel.
- UI/widget — API only.
