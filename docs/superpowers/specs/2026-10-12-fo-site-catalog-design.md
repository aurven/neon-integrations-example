# Front Office Site Catalog: Design

**Date:** 2026-10-12
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:** docs/superpowers/specs/2026-09-30-multi-neon-env-design.md (registry, `neon.fo`, `requireEnv`)

## Problem

Front-office (FO) access relies on hand-written per-site URLs:

- **Registry.** `neon.fo.sites.<site>.<stage>` (legacy: `NEON_FO_<SITE>_<STAGE>_URL`) holds hand-written URLs. They were used both as the FO API base and as the public site address.
- **Mailjet.** `src/mailjet/mailjet.js` hard-codes the site `'theglobe'` and the stage `live`. It falls back to `https://theglobe-demo.neon.eks-dev.dev.eidosmedia.io`.
- **Method for the public hostname.** `getSiteHostname` calls `<site url>/api/sites/current`. On NEAP the configured URL is the public Next.js site, so this returns 404. The newsletter page fetch then times out against the stale eks-dev host.

## Goal

Discover sites from Neon instead of configuring them. Each environment records one FO base URL. The site list, the public hostnames and the per-stage API hosts all come from:

```
GET <fo.url>/api/sites/live?siteMap=false        header: neon-fo-access-key: <fo.apiKey>
```

The response is an array. Each item carries:
- `root.name`, e.g. `TheGlobe`
- `root.title`
- `root.staticAttributes.sitelabel`
- `root.hostname`, the public live site, with scheme
- `apiHostnames.{liveHostname, stageHostname, previewHostname}`, the hosts where `/api/*` works, without scheme

## Non-goals

- Telegram article links (`"#"` today).
- Public hostnames for preview and stage. Only the live `root.hostname` is exposed by the endpoint.
- A `?site=` override on Mailjet.

## 1. Registry schema

```json
"neon": { "fo": { "url": "https://neon-fo-<env>…", "apiKey": "…" } }
```

- **`neon.fo` is optional (unchanged).** When present, both `url` (an absolute http(s) URL) and `apiKey` are required. A missing or invalid value invalidates the entry, as other required fields do.
- **`neon.fo.sites` is no longer read.** If present, it is ignored and the registry adds a warning: `env <id>: neon.fo.sites ignored; sites come from <fo.url>/api/sites/live`. The entry stays valid.
- **Normalized `Env.neon.fo`** is `{ url, apiKey, host }`, where `host` is the hostname of `url`. The `sites` field is removed.
- **Legacy fallback** builds `fo` from `NEON_FO_URL` and `NEON_FO_APIKEY`:
  - If both are set, `fo` is built.
  - If only one is set, `fo` is `null` and a warning names the missing variable.
  - The per-site `NEON_FO_*_URL` variables are no longer read.

## 2. Site catalog: `src/helpers/neon-env/fo-sites.js`

All functions operate on the current request env (`requireEnv()`). If `env.neon.fo` is absent, they throw the existing `NeonEnvConfigError('FO not configured for env <id>', 501)`.

- **`listSites({ refresh = false } = {}) → Promise<Site[]>`**
  - Fetches the endpoint above with `siteMap=false`, a timeout of 10000 ms, and the TLS agent from `env.neon.insecureTls`. Certificate checks are on unless `insecureTls` is set.
  - Normalizes each item to a `Site`:
    ```js
    {
      name,        // root.name
      label,       // root.staticAttributes.sitelabel || root.title || root.name
      id,          // root.id
      publicUrl,   // root.hostname, trailing slash removed
      apiUrls: { live, stage, preview }  // https://<apiHostnames.*Hostname>; a value that already has a scheme is kept; missing → absent
    }
    ```
  - Items without `root.name` are skipped.
  - **Cache.** Results are cached in memory per env id for 10 minutes. A failed fetch is never cached. `refresh: true` bypasses the cache.
  - **Errors.** Network errors and non-2xx responses throw `NeonEnvConfigError('FO site list unavailable for env <id>: <status|code>', 502)`. A response that isn't an array throws `NeonEnvConfigError('FO site list for env <id> has unexpected shape', 502)`.
- **`getSite(name) → Promise<Site>`**
  - Matches `name` case-insensitively.
  - On a miss, refreshes once and retries.
  - If still missing, throws `NeonEnvConfigError("site '<name>' not found in env <id> (available: A, B, C)", 404)`.
- **`apiUrl(siteName, stage = 'live') → Promise<string>`**
  - Calls `getSite`, then returns `apiUrls[stage]`, matched case-insensitively.
  - If the stage is missing, throws `NeonEnvConfigError("site '<name>' in env <id> has no <stage> API host", 404)`.
- **`siteFromModel(neonModel) → Promise<string>`** resolves the site name from a Neon payload. The first match wins:
  1. `neonModel.rootData.pubInfo.siteName`
  2. `neonModel.model.pubInfo.siteName`
  3. `neonModel.pubInfo.siteName`
  4. the only key of `neonModel.rootData.pubInfoEx`, when it has exactly one key
  5. the only site of the env, when `listSites()` returns exactly one
  6. otherwise it throws `NeonEnvConfigError("cannot determine site for env <id>: payload has no pubInfo.siteName (available: …)", 400)`.
- **`clearSiteCache()`** is exported for tests.

## 3. Consumers

- **`src/helpers/sites-helpers.js`**
  - `getFrontOfficeUrl` is removed. Callers use `apiUrl(siteName, environment)` from fo-sites.
  - `getNodeById`, `getResource` and `getResourceById` keep their signatures and return values.
    - Their base URL becomes `await apiUrl(siteName, environment)`.
    - They send the `neon-fo-access-key` header with `env.neon.fo.apiKey`.
    - The TLS agent follows `insecureTls` (today it always disables verification).
  - `getSiteHostname(siteName, environment = 'live')` returns `(await getSite(siteName)).publicUrl`.
    - For a stage other than `live`, it returns the same live `publicUrl` and logs one warning. Only live public hostnames are exposed.
    - It no longer calls `/api/sites/current`.
- **`src/mailjet/mailjet.js` `sendNewsletter`**
  - Base URL resolution order:
    1. `neonModel.siteNode.hostname`, when the payload carries it
    2. otherwise `(await getSite(await siteFromModel(neonModel))).publicUrl`
  - The `'theglobe'` literal and the eks-dev fallback URL are deleted. When resolution fails, the error propagates, and the handler's existing catch returns it as before.
  - The sender display name becomes `<site label> Newsletter`. The label comes from `getSite(...).label`; when the base came from `siteNode.hostname`, the site is still resolved for the label, and `Newsletter` alone is used if that fails.
- **`src/images-importer.js`.** No interface change. `prepareNeonImage({ siteName: model.pubInfo.siteName, environment: 'live' })` now resolves through the catalog.
- **`/services` dashboard.** For admins only (`isAdminRequest`), a "Sites" line lists the current env's sites as `label → publicUrl`. It uses `listSites()`; if that fails, it shows `sites unavailable: <message>`. Anonymous visitors see nothing new.

## 4. Error handling summary

| Case | Result |
|---|---|
| Env has no `neon.fo` | 501 `FO not configured for env X` |
| FO site list unreachable or non-2xx | 502 `FO site list unavailable for env X: <status>` |
| Unknown site | 404 `site 'Y' not found in env X (available: …)` |
| Site lacks the requested stage API host | 404 `site 'Y' in env X has no <stage> API host` |
| Payload without a site, env with more than one site | 400 `cannot determine site for env X …` |

## 5. Testing (`node:test`, no network)

- Axios is stubbed through an injected adapter, a small test seam in fo-sites (`__setHttpForTest(fn)`).
- **Fixture.** The NEAP demorc `/api/sites/live` response (TheGlobe, NextFrontier, SportsArena) is trimmed to `root.{name,title,id,hostname,staticAttributes.sitelabel}` and `apiHostnames`.
- **fo-sites:**
  - normalization: labels, `https://` added, trailing slash removed;
  - the request URL is `<fo.url>/api/sites/live?siteMap=false` and sends the FO key header;
  - the cache is hit within the TTL, the TTL expiry is handled (clock injected), and a miss triggers one refresh;
  - failures are not cached;
  - unknown site → 404 with the available list;
  - missing stage → 404;
  - every `siteFromModel` branch.
- **sites-helpers:** `getNodeById` calls `https://theglobe-demorc-site.sites.neap.eidosmedia.io/api/nodes/<id>` for TheGlobe/live, and `getSiteHostname` returns `publicUrl`.
- **mailjet:** with a payload carrying `rootData.pubInfo.siteName = "NextFrontier"`, the page fetch URL starts with `https://nextfrontier-demorc.sites.neap.eidosmedia.io`; `grep eks-dev src/` is empty.
- **registry:**
  - `fo` without `url` → entry skipped;
  - `fo.sites` present → warning, entry kept;
  - legacy `NEON_FO_URL` + `NEON_FO_APIKEY` → `fo` built;
  - legacy with only one of them → `fo` null plus a warning.
- **Existing tests that referenced `fo.sites`** (fixtures, sites-helpers.test.js) are updated to `fo.url`.

## 6. Rollout

1. The local `config/neon-environments.json` already has `neon.fo.url` for all envs, using the BO URL with `neon-bo` replaced by `neon-fo`.
2. Remove `neon.fo.sites` from the local file after merge. It is harmless until then, because the old code still reads it.
3. Update the Render Secret File the same way: add `neon.fo.url` per env and drop `fo.sites`.
4. Update `config/neon-environments.example.json`, the README and `.env.example`: `NEON_FO_URL` replaces the per-site variables.
