# Phase 3 — Neon Config + IAB Taxonomies Connectors — Design

**Date:** 2026-06-14
**Status:** Approved
**Repo:** neon-integrations-example
**Branch:** `develop` (off `main`)

## Context

Phase 2 (see `docs/superpowers/specs/2026-06-14-populator-delayed-importer-design.md`) ported the Populator + Delayed Importer integration end-to-end, establishing the vertical-slice pattern: `lib/core` → `lib/integrations/<name>/service.ts` → `app/api/.../route.ts`.

`src/connectors/` (13 files, 2122 lines) feeds several unrelated integrations and is too large to port in one slice. This phase ports the **neon-config** + **iab-taxonomies** connectors — both are config/reference-data caches with no associated panels/widgets (API-only, like Phase 2's delayed-importer), and `neon-config` depends on `NeonClient` which was already fully ported in Phase 2.

## Scope

### 1. `web/lib/integrations/neon-config/service.ts` (new)

Direct port of `src/connectors/neon-config-connector.js` (267 lines):
- `CONFIGS` registry (`usersGroups`, `workflows`, `contentTypes` → cache filenames + labels), `DEFAULT_TYPE_LABELS`
- `fetchFromNeon(type)` — calls `NeonClient` (`web/lib/core/neon-bo-api-v3.ts`, already has `getUsers`, `getGroups`, `getWorkflowDefinitions`, `getContentTypesConfig`)
- `flattenContentTypes(node, list)`, `loadContentTypesConfig`, `getTypeLabel(composedTypeName)`
- `getConfig(type, forceRefresh)`, `fetchAndCache(type)`, `loadFromCache(type)`, `cacheExists(type)`, `saveToCache(type, data)`, `initializeAll()`, `refreshAll()`, `refreshConfig(type)`, `getAvailableConfigs()`
- Cache dir: `web/data/neon-config/*.json`, via `fs/promises`, route handlers declare `export const runtime = 'nodejs'`

**Startup pre-warm dropped**: the old app calls `initializeAll()` via `setImmediate` on server start. Next.js has no equivalent long-lived startup hook in the request-per-invocation model. `getConfig()` already fetches-and-caches on first miss, so the first request after deploy is slightly slower — acceptable per Next's serverless-friendly model. `initializeAll()`/`refreshAll()` are still ported (used by the `/refresh` routes), just not auto-invoked at startup.

### 2. `web/lib/integrations/iab-taxonomies/service.ts` (new)

Direct port of `src/connectors/iab-taxonomies-connector.js` (368 lines):
- `TAXONOMIES` registry (`content` v3.1, `audience` v1.1, `adproduct` v2.0 — each `{version, filename, url, cacheFile}`)
- `downloadTSV(url)` — axios, `responseType: 'text'`, 30000ms timeout
- `parseTSV(tsvContent, type)` — detects descriptive first row, filters empty header columns, builds `categories[]` + `index{}`
- `normalizeCategoryStructure(row, type)` — extracts `id`/`name`/`parentId`/`tiers[]` (maxTiers 6/4/3 for audience/content/adproduct), optional `extension`
- `buildPath(category)`, `saveToCache`/`loadFromCache`/`cacheExists`, `downloadAndCache(type)`, `getTaxonomy(type, forceRefresh)`, `initializeAll()`, `refreshAll()`, `getAvailableTaxonomies()`
- Cache dir: `web/data/iab-taxonomies/*.json`, same lazy-fetch model, no startup pre-warm (same rationale as #1)

### 3. `web/lib/integrations/iab-taxonomies/helper.ts` (new)

Direct port of `src/helpers/iab-taxonomies-helper.js` (365 lines), all operating on `getTaxonomy()` results from #2:
- `getLabel(type, id)`, `getLabels(type, ids)`, `getHierarchy(type, id)`, `searchCategories(type, query, options)`, `validateIds(type, ids)`, `getChildren(type, parentId)`, `getTaxonomyStats(type)`, `getTaxonomyTree(type, maxDepth)`

### 4. Routes — `web/app/api/neon/config/`

Ported from `src/requestHandlers/neon-config.js`:
- `route.ts` — `GET` list configs (`listConfigs`, with `buildStats(type, data)` per-type stats: `{userCount, groupCount}` / `{workflowCount}` / `{typeCount}`)
- `[type]/route.ts` — `GET` config data (`getConfigData`); 400 on invalid type (not in `CONFIGS`)
- `refresh/route.ts` — `POST` refresh all (`refreshAllConfigs`)
- `refresh/[type]/route.ts` — `POST` refresh single type (`refreshSingleConfig`)

### 5. Routes — `web/app/api/iab/`

Ported from `src/requestHandlers/iab-taxonomies.js` (~370 lines):
- `taxonomies/route.ts` — `GET` list taxonomies (`listTaxonomies`); static segment, coexists with `[type]` (Next matches static routes before dynamic)
- `lookup/route.ts` — `POST` batch label lookup (`lookupLabels`, body `{type, ids, hierarchy}`)
- `search/route.ts` — `GET` search (`searchTaxonomy`, query `type,q,limit,caseSensitive`)
- `validate/route.ts` — `POST` validate IDs (`validateTaxonomyIds`, body `{type, ids}`)
- `refresh/route.ts` — `POST` refresh all taxonomies (`refreshTaxonomies`)
- `[type]/route.ts` — `GET` taxonomy data (`getTaxonomyData`; `format=flat|tree` + `maxDepth` query params)
- `[type]/children/route.ts` — `GET` children (`getChildrenCategories`; `parentId` query)
- `[type]/stats/route.ts` — `GET` stats (`getTaxonomyStatistics`)

All `[type]` routes validate against `['content', 'audience', 'adproduct']`.

### Auth

Handled automatically by existing `proxy.ts` matcher (`/api/:path*`) — no per-route apikey code, unlike the old Fastify handlers which each called `registerRoutes(fastify, { apikey })` with their own `preHandler`.

### Dependencies

None new — `axios` already present (Phase 1), `fs/promises` is Node built-in.

## Testing

- `web/lib/integrations/neon-config/__tests__/service.test.ts` — mock `NeonClient` (from `lib/core/neon-bo-api-v3`) + `fs/promises`; cover `fetchFromNeon` per config type, `flattenContentTypes`, `getTypeLabel`, cache hit/miss in `getConfig`, `refreshConfig`
- `web/lib/integrations/iab-taxonomies/__tests__/service.test.ts` — mock axios for `downloadTSV`; test `parseTSV`/`normalizeCategoryStructure`/`buildPath` against small fixture TSV strings (pure); cache hit/miss in `getTaxonomy`
- `web/lib/integrations/iab-taxonomies/__tests__/helper.test.ts` — pure logic (`getLabel`, `getHierarchy`, `searchCategories`, `validateIds`, `getChildren`, `getTaxonomyStats`, `getTaxonomyTree`) against a small fixture taxonomy object (mock `getTaxonomy`)
- `web/app/api/neon/config/__tests__/route.test.ts` — exercise all 4 neon-config route handlers + `proxy()` for auth, mirroring Phase 2's `web/app/api/in/delayed-import/__tests__/route.test.ts` pattern
- `web/app/api/iab/__tests__/route.test.ts` — exercise all 8 iab route handlers + `proxy()` for auth, same pattern

## Verification

- `cd web && npx vitest run` — all existing (146) + new tests pass
- `npm run lint` / `npm run build` clean
- Manual smoke test (dev server, with `NEON_EXT_APIKEY` header):
  - `GET /api/iab/taxonomies` → 200, lists `content`/`audience`/`adproduct` with versions
  - `GET /api/iab/content?format=tree` → 200, tree structure (downloads+caches TSV from GitHub on first call)
  - `GET /api/neon/config` → 200 list (against real Neon BO if `NEON_BO_URL`/`NEON_BO_APIKEY` configured; otherwise verify request shaping, same caveat as Phase 2)
- Existing Fastify app (`main`/`render`, `src/connectors/neon-config-connector.js`, `src/connectors/iab-taxonomies-connector.js`, `src/helpers/iab-taxonomies-helper.js`, etc.) untouched

## Out of scope / deferred

- `src/connectors/connector-registry.js` + social media connectors (twitter, facebook, instagram, threads, bluesky) — separate future sub-project
- Startup cache pre-warm (`initializeAll()` via `setImmediate`) — dropped, lazy on-demand fetch instead (see #1, #2)
- Any UI/page for these endpoints (matches current API-only behavior; no panels/widgets reference these routes)
