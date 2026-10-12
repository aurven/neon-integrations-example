# Taxonomy Builder at scale: background jobs up to 50,000 items (Design)

**Date:** 2026-10-13
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:** `docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md`. Merge rules, payloads and read rules are unchanged unless stated here.

## Goal

Import taxonomies of up to 50,000 items. The reference file is `france-municipalities.txt`: 1 family, 19 regions, 106 departments and 34,960 communes, 35,086 items in all, plus 3 `#` comment lines. The import runs as a server-side background job, so the browser does not have to stay open.

- The widget loads the outline from a `.txt` file or a paste.
- Preview shows a summary.
- Create starts a job and the widget follows its progress.
- Re-running the same outline after an interruption resumes the import, because existing items are merged.

## Non-goals

- Persisting jobs across server restarts. Jobs live in memory, like the delayed importer; resuming means re-running the outline.
- Multipart upload. The browser reads the file and posts its text.
- Running jobs in parallel in the same environment.
- Changing the existing synchronous `POST /api/neon/taxonomy-builder/create`. It keeps its contract and its 500-item limit.

## 1. Input

- **Comments:** taxonomy outlines ignore lines whose first non-blank character is `#`. A comment line never affects indentation tracking.
  - This is implemented as an option of the shared parser, `parseIndented(text, { comments: true })`.
  - The Site Builder does not enable it, so its behaviour is unchanged.
- **Limits:** the item limit becomes a parameter.
  - Synchronous create keeps 500: `outline has N items; the limit is 500`.
  - Preview and jobs allow 50,000: `outline has N items; the limit is 50000`.
- **Body size:** the four taxonomy POST routes (`preview`, `create`, `jobs`, `jobs/:id/cancel`) accept bodies up to 5 MB through Fastify's route-level `bodyLimit: 5 * 1024 * 1024`. A larger body is rejected by Fastify with 413.

## 2. Preview at scale

`POST /api/neon/taxonomy-builder/preview` performs the same reads as today; the item limit for preview is 50,000.

- **Up to 500 items:** the response is unchanged.
- **Above 500 items:** the response is a summary:
  ```js
  { env, mode: 'summary', total, toCreate,
    levels: [{ outline: 'categories' | 'tags', depth, kind, total, new, exists }],  // one row per (outline, depth)
    sample: { categories: [<first 200 items, same shape as today>], tags: [<first 200>] },
    errors: [<first 200>], errorCount }
  ```
- Small previews gain `mode: 'full'` and `errorCount`.

## 3. Background jobs: `src/helpers/taxonomy-builder/jobs.js`

### Job record

Jobs are kept in memory, in a `Map` keyed by `jobId` (`txj-<yyyymmdd>-<6 hex>`).

```js
{ jobId, envId, state: 'running' | 'completed' | 'cancelled' | 'failed',
  createdAt, finishedAt, phase: 'categories level N' | 'tag families' | 'tags' | null,
  total, counts: { created, exists, failed, skipped }, done /* created+exists+failed+skipped */,
  failures: [{ outline, path, error }],      // all failures; status view returns the first 5000
  report: { categories: [...], tags: [...] } // full per-item report (same item shape as the sync report)
  error?: string }                           // set when state = 'failed' (unexpected crash)
```

### Start

`startJob({ plan, existing, envId, getClient })` creates the record. Items already marked `exists` count immediately as `exists`. It then runs asynchronously, with no `await` in the request, and returns the record.

### Execution

The job runs inside `context.run(env, …)` for its environment and follows the same merge rules and payloads as the synchronous create.

- **Order:** level by level.
  1. Category families (depth 1), then categories at depth 2, then depth 3, and so on.
  2. Tag families, then tags.
  3. Within a level, items are processed in outline order, with at most **4** Neon calls in flight (`CONCURRENCY = 4`).
- **Parents before children:** a level starts only after the previous level has fully finished. So an item's parent always has its final status before the item is attempted.
- **Per-item rules:** the same as synchronous create.
  - A parent that is not `created` or `exists` makes the item `skipped` with the error `parent "<name>" was not created`.
  - A create with no id makes the item `failed` with the error `created but no id returned`.
  - The missing-ref guards apply.
  - Each failure is appended to `failures`.
- **Cancel:** `cancelJob(id)` sets a flag that is checked before each call starts. Calls already in flight finish. Every item not yet attempted becomes `skipped` with the error `cancelled`. The state becomes `cancelled`.
- **Unexpected error:** an exception outside the per-item try/catch makes the state `failed`, with `error` set to the message. Counts so far are kept.
- **Logging:** a log line at start, every 1,000 items, and at the end, with `[taxonomy-job] <jobId> env=<id> …`.

### Single running job per environment

`startJob` throws `JobConflictError` (carrying the running `jobId`) when the environment already has a job in state `running`.

### Retention

Finished jobs are evicted 24 hours after `finishedAt`. Each environment keeps at most 20 finished jobs; the oldest are evicted first. Eviction timers are `unref`'d.

### Refactor

The synchronous `createTaxonomy` and the job runner share one per-item creation function, so payloads and status rules cannot drift between them.

- The synchronous path keeps its current, sequential behaviour.
- The job path uses the level-and-concurrency scheduler.

## 4. Endpoints

All endpoints are admin only, with the same gate and env resolution as today: 401 / 403 `taxonomy creation requires an admin key`. They are scoped by environment like the delayed importer: an environment-bound key sees only its environment's jobs, and the global admin key sees all jobs.

| Endpoint | Behaviour |
|---|---|
| `POST /api/neon/taxonomy-builder/jobs` | Same body validation as create, with a 50,000-item limit and comments ignored. If the plan or the reads have errors: 400 `{ errors, errorCount }`, and nothing is written. If a job is already running in this environment: 409 `{ error: 'a taxonomy job is already running in env <id>', jobId }`. Otherwise **202** `{ jobId, total, toCreate }`. |
| `GET /api/neon/taxonomy-builder/jobs` | 200 `{ jobs: [{ jobId, envId, state, createdAt, finishedAt, total, done, counts }] }`, newest first. |
| `GET /api/neon/taxonomy-builder/jobs/:id` | 200 `{ jobId, envId, state, phase, createdAt, finishedAt, total, done, counts, failures: <first 5000>, failureCount, error? }`. 404 when the job is unknown or not visible to the caller. |
| `GET /api/neon/taxonomy-builder/jobs/:id/report` | 200 with the full report JSON `{ jobId, envId, state, counts, categories, tags }`, sent with `Content-Disposition: attachment; filename="<jobId>-report.json"`. 404 as above. |
| `POST /api/neon/taxonomy-builder/jobs/:id/cancel` | 200 with the status view after the cancel flag is set. 409 `{ error: 'job is not running' }` when the job has finished. 404 as above. |

- **Demo mode:** `?demo=true` on `POST /jobs` makes no Neon reads or calls. It runs a simulated job that marks every item `created` with ids `demo-<n>`, completing in about 3 seconds (items spread over timer ticks). The other job endpoints work the same in demo mode.

## 5. Widget changes (Taxonomy Builder)

- **Loading files:** a "Load .txt file" button next to each outline box reads the file with `FileReader` (UTF-8) into that outline.
  - Above 2,000 lines, the box is replaced by a chip, `<N> lines loaded from <file name> · Clear · Edit`. Edit shows the textarea again.
- **Preview:** for `mode: 'summary'`, the widget shows the per-level table (outline, depth, kind, total, new, exists), the sample trees, and the errors with "…and N more".
- **Create:** always uses `POST /jobs`.
  - A 202 response opens the **progress panel**: a progress bar showing `done / total`, the counts, the phase, the elapsed time and a **Cancel** button. The panel polls `GET /jobs/:id` every 2 seconds until the job leaves `running`.
  - A 400 response shows the errors. A 409 response offers "Open running job".
- **Jobs list:** on load, and after each job finishes, the widget fetches `GET /jobs` and lists running and recent jobs (state, counts, time) with an "Open" action that attaches the progress panel.
- **Finished job:** the widget shows the counts, a scrollable failures list (path and error), and a "Download full report" button that requests `/jobs/:id/report` with the apikey header and saves the blob. It then refreshes the preview.

## 6. Error handling

| Case | Result |
|---|---|
| Body over 5 MB | 413 (Fastify) |
| Plan or read errors on start | 400 `{ errors, errorCount }`, no job, nothing written |
| A job is already running in the environment | 409 with `jobId` |
| An item fails | That item is `failed`, its descendants are `skipped`, the job continues |
| Cancel | Items not yet attempted are `skipped` with `cancelled`; state `cancelled` |
| Unexpected crash in the runner | State `failed` with `error`; partial counts kept |
| Server restart | The job is lost; re-running the outline resumes it through the merge |

## 7. Testing (`node:test`, no network)

- **Parser:**
  - `comments: true` skips `#` lines, including indented ones, without affecting indentation.
  - The default is off, so the Site Builder is unchanged.
- **Plan:**
  - the limit is a parameter (500 and 50,000 messages);
  - comments are ignored in taxonomy plans.
- **Preview:** summary mode above 500 items (levels, sample sizes, error cap) and full mode at or below 500.
- **Jobs**, using a fake client with call recording and controllable delays:
  - level-by-level order, with no child call before its parent's call has resolved;
  - concurrency never above 4;
  - a failure cascades to descendants;
  - existing items are counted, not called;
  - cancel mid-run;
  - a second start in the same environment is a conflict;
  - environment scoping and visibility;
  - retention and eviction;
  - the full report and the 5,000 failure cap.
- **Scale:** a generated outline shaped like the reference file (1 / 19 / 106 / 34,960) against an instant fake client completes. It makes exactly 35,086 create calls in a valid order, in well under 10 seconds.
- **Routes:**
  - 202 / 400 / 409 / 404 / 401 / 403;
  - status, report and cancel;
  - the demo job;
  - a 1.2 MB body is accepted and a 6 MB body is rejected with 413;
  - the synchronous create still enforces 500.
- **Widget:** the bundle builds.

## 8. Rollout

1. Run the demo with the reference file to check loading, the summary preview and progress.
2. Run a real job on a test environment with a small file, then with a slice of the reference file (for example one department). Check it in Neon, then re-run it and expect all `exists`.
3. Run the full reference file. Watch the `[taxonomy-job]` logs and note the throughput, then adjust `CONCURRENCY` if Neon is slow or rate-limits.
