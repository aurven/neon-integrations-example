# Multi-Neon-Environment Support — Design

**Date:** 2026-09-30
**Status:** Draft, awaiting review

## Goal

A single deployment of neon-integrations-example (on Render) serves N Neon environments (e.g. demorc, poc, adn-demo). Each request is resolved to exactly one environment and uses only that environment's Neon BO/FO/App config and service credentials. Embedded panels and widgets always act on the Neon instance they are embedded in. Standalone use remains available for debugging, with an explicit environment choice.

## Non-goals

- Self-service onboarding of environments or an admin UI. The registry is curated by hand.
- Persisting delayed-import jobs across restarts. Jobs remain in memory, as today.
- Reworking legacy clients `neon-bo-api.js` / `neon-bo-api-v2.js`. Current code does not require them.

## Background (current state)

- Neon config comes from process-wide env vars: `NEON_BO_URL`, `NEON_BO_APIKEY`, `NEON_USER_API_KEY`, `NEON_APP_URL`, `NEON_FO_APIKEY`, `NEON_FO_<SITE>_<ENV>_URL`, plus Méthode `EDAPI_*`, `SWING_*` and Telegram chat ids.
- `NeonClient` (`src/helpers/neon-bo-api-v3.js:52`) already accepts `{baseUrl, apiKey, userApiKey}`. However, 11 modules use the module-level singleton `defaultClient` (`:430`).
- The constructor sets `NODE_TLS_REJECT_UNAUTHORIZED` process-wide whenever `NEON_EXT_LOCATION=Local`.
- Auth is per handler via `authenticate()` (`src/helpers/auth.js:11`). It reads the `apikey` header, then the query, then the cookie, and compares against `NEON_EXT_APIKEY` / `NEON_EXT_APIKEY_LIMITED`.
- Embedded panels and widgets call the server through Neon's proxy (`/neon/api/demo-integration`, see `public/js/panel-bootstrap.js:21`, `src/react-widgets/src/api.js:11`). The browser Origin is therefore not seen directly by this server.
- Some work runs outside the request that created it: the delayed importer's `setTimeout` ticks, the Neon config cache warm-up at startup, webhooks called server-to-server, SSE, and Claude chat sessions.
- Unauthenticated routes that call Neon: `/neon/api/core/metrics[/*]` (`src/requestHandlers/neon-metrics.js`, which imports `authenticate` but never calls it) and all `/mobileclient*` routes, including `POST /mobileclient/save`, which writes to Neon.

## 1. Environment registry

### Storage

The registry is a Render **Secret File** named `neon-environments.json`.

Load order:
1. `/etc/secrets/neon-environments.json` (Render)
2. `./config/neon-environments.json` (local; gitignored)
3. Legacy fallback: an environment built from the current env vars (see below)

A committed `config/neon-environments.example.json` documents the format.

### Schema (version 1)

```json
{
  "version": 1,
  "adminApiKey": "env:NEON_EXT_APIKEY",
  "environments": [
    {
      "id": "demorc",
      "label": "Demo RC",
      "default": false,
      "hosts": ["neon-app-demorc.neap.example"],
      "extApiKey": "…",
      "extApiKeyLimited": "…",
      "warmup": true,
      "neon": {
        "insecureTls": false,
        "app": { "url": "https://neon-app-demorc.neap.example" },
        "bo":  { "url": "https://…", "apiKey": "…", "userApiKey": "…" },
        "fo":  {
          "apiKey": "…",
          "sites": {
            "theglobe": { "live": "https://…", "preview": "https://…", "stage": "https://…" }
          }
        }
      },
      "services": {
        "methode":  { "server": "…", "restEndpoint": "…", "connectionId": "…", "databaseId": "…",
                      "username": "…", "password": "env:DEMORC_EDAPI_PWD",
                      "swingHost": "…", "swingAppUrl": "…" },
        "telegram": { "botToken": "…", "chatIds": { "default": "…", "theglobe": "…" } },
        "anthropic": { "apiKey": "…", "chatModel": "…" }
      }
    }
  ]
}
```

**Rules**
- `id` must match `^[a-z0-9-]+$` and be unique.
- Required fields: `id`, `label`, `hosts` (non-empty), `extApiKey`, `neon.app.url`, `neon.bo.url`, `neon.bo.apiKey`, `neon.bo.userApiKey`.
- `neon.fo` is optional. Without it, FO features answer 501 "FO not configured for env X".
- `services` is optional, and so is each block inside it (see §5).
- Any string value may be written as `env:VAR_NAME`. It is resolved from `process.env` at load time, and a missing variable makes the entry invalid.
- At most one environment may have `default: true`.
- Each `extApiKey` and `extApiKeyLimited` must be unique across all environments and must differ from `adminApiKey`. On a collision, **all** colliding entries are rejected.
- Each host must be unique across environments. Colliding entries are rejected.
- Validation uses a small hand-written validator. No new dependency is added.

### Legacy fallback

If no registry file exists, one environment is synthesized from today's env vars:
- `id: "legacy"`, `label: NEON_EXT_LOCATION || "Legacy"`, `default: true`, `hosts: []`
- `extApiKey = NEON_EXT_APIKEY`, `extApiKeyLimited = NEON_EXT_APIKEY_LIMITED`
- `neon.bo` comes from `NEON_BO_*` and `NEON_USER_API_KEY`, and `neon.app.url` from `NEON_APP_URL`.
- `neon.fo` comes from `NEON_FO_APIKEY` and `NEON_FO_<SITE>_<ENV>_URL`.
- `insecureTls` is set to `NEON_EXT_LOCATION === "Local"`.
- `services` is left empty, so everything falls back to the global env vars.

The current Render deploy therefore behaves exactly as today.

Once a registry file exists, the legacy Neon env vars are **ignored**. If both are present, startup logs a warning.

### Startup log

Startup prints a table of the loaded environments with these columns: id, label, BO host, key source (file / `env:`), default flag, and warmup result. Skipped entries are listed with the reason. No secrets are printed.

## 2. Request → environment resolution

Resolution happens in a Fastify `onRequest` hook, `src/helpers/neon-env/resolve.js`:

1. **Env-bound key.** If the `apikey` (from header, query, or cookie, in the same order as `authenticate()`) equals some environment's `extApiKey` or `extApiKeyLimited`, that environment is selected. The role (admin or limited) follows from which of the two keys matched.
2. **Admin key plus explicit environment.** If the key equals `adminApiKey`, the environment comes from the `x-neon-env` header or the `?env=<id>` query parameter. An unknown id returns 400, listing the valid ids.
3. **Admin key, no explicit environment.** The environment marked `default: true` is used, or `legacy`. If there is no default, the result is 400 "env required".
4. **Anything else** returns 401.

**Host check (secondary).** If the request carries a recognisable Neon host (from `Origin`, `Referer` or `X-Forwarded-Host`; the exact headers are to be settled by the probe in §9), it must be listed in the resolved environment's `hosts`. A mismatch returns 403 and is logged as `[neon-env] host mismatch env=<id> host=<host>`. If no host header is present, the check is skipped; this covers webhooks, standalone use and server-to-server calls.

The client never supplies URLs or credentials. It can only select an id from the registry, and only with the admin key.

`authenticate()` becomes a thin wrapper that returns the hook's already-resolved result: `{ authenticated, role, apikey, env }`. The existing cookie-setting behaviour is kept.

Routes that are not tied to any environment (static assets, `/`, IAB, tag-manager) skip resolution through a route-level `config: { neonEnv: false }`.

## 3. Environment visibility

- **Response headers:** every resolved request returns `X-Neon-Env: <id>` and `X-Neon-Env-Bo: <bo host>`.
- **Templates:** HBS views and React `window.CONFIG` receive `neonEnv: { id, label, boHost }`. They also receive `neonAppUrl` from `env.neon.app.url`, replacing `process.env.NEON_APP_URL` in `panels.js`, `widgets.js`, `claude-chat-handler.js` and `trello.js`.
- **Browser console:**
  - On page load, a styled banner is logged: `🟢 [neon-env] demorc (Demo RC) → bo: <host>`.
  - The shared fetch helpers (`public/js/panel-api-helper.js`, `public/js/panel-bootstrap.js`, `src/react-widgets/src/api.js`) log `[neon-env] <id> → <METHOD> <path>` on every call, reading the `X-Neon-Env` header of the response.
  - If a response's environment differs from the one logged at page load, the helper logs a red `console.error` mismatch.
- **Server logs:** the Neon client call log is prefixed with `[env=<id>]`.
- **Secrets:** none are ever exposed; only the id, label and BO hostname.

## 4. Request-scoped context and clients

The new module `src/helpers/neon-env/` contains:
- `registry.js` — loads and validates the registry, resolves `env:` refs, and exposes `get(id)`, `list()`, `byKey(key)` and `default()`.
- `context.js` — an `AsyncLocalStorage` that exposes `run(env, fn)`, `currentEnv()`, and `requireEnv()`, which throws `NoNeonEnvError`.
- `resolve.js` — the logic from §2.
- `services.js` — the logic from §5.

**Neon client (`neon-bo-api-v3.js`)**
- `clientFor(env)` returns a cached `NeonClient` per env id, built from `env.neon.bo`.
- The flat exports and argument-less `new NeonClient()` resolve lazily through `clientFor(requireEnv())`. **Existing call sites do not change.**
- If there is no environment in the context, `NoNeonEnvError` is thrown. There is never a silent fallback to the default environment.
- TLS: `insecureTls` becomes a per-client `https.Agent({ rejectUnauthorized: false })`. The process-wide `NODE_TLS_REJECT_UNAUTHORIZED` assignment is removed from `neon-bo-api-v3.js`. Other files that set it (`methode-bo-api.js`, `pdf-generator.js`, `mailjet.js`) switch to a per-request agent where they call environment-bound hosts.

**Other environment-bound helpers**
These switch from `process.env` to `requireEnv()`:
- `sites-helpers.js` — FO key and site URLs from `env.neon.fo`. The key read is moved from module level to call time.
- `neon-content-parser.js:180` — BO URL.
- `neon-events.js` — App URL and BO key for the notifier.
- `neon-config-connector.js` — see §6.

## 5. Services: per-environment with global fallback

`services.js` exposes `serviceConfig(name)`:
- If the current environment has `services.<name>`, **that block alone** is returned.
- Otherwise the global block is built from the existing env vars.
- **Fallback is per block, not per field**, so that credentials from different accounts are never mixed. If a per-environment block lacks a field the service needs, the service throws "`<name>` incomplete for env X".

Global fallback mapping (the current env vars keep working):

| Service | Fields → global env var |
|---|---|
| `anthropic` | apiKey `ANTHROPIC_API_KEY`, chatModel `CLAUDE_CHAT_MODEL` |
| `openai` | apiKey `OPENAI_APIKEY` |
| `pexels` | apiKey `PEXELS_APIKEY` |
| `youtube` | apiKey `YOUTUBE_APIKEY` |
| `dailymotion` | apiKey `DAILYMOTION_APIKEY`, apiSecret `DAILYMOTION_APISECRET` |
| `trello` | apiKey `TRELLO_APIKEY`, token `TRELLO_TOKEN`, organizationId `TRELLO_ORGANIZATION_ID`, panelDraggable `TRELLO_PANEL_DRAGGABLE` |
| `guardian` | apiKey `GUARDIAN_APIKEY` |
| `deepl` | apiKey `DEEPL_APIKEY` |
| `sendgrid` | apiKey `SENDGRID_APIKEY` |
| `mailjet` | apiKey `MAILJET_APIKEY`, apiSecret `MAILJET_APISECRET` |
| `telegram` | botToken `TELEGRAM_BOT_TOKEN`, chatIds.default `TELEGRAM_CHAT_ID`, chatIds.theglobe `TELEGRAM_THEGLOBE_CHAT_ID` |
| `methode` | server `EDAPI_SERVER`, restEndpoint `EDAPI_REST_ENDPOINT`, connectionId `EDAPI_CONNECTIONID`, databaseId `EDAPI_DATABASEID`, username `EDAPI_USERNAME`, password `EDAPI_PASSWORD`, swingHost `SWING_HOST`, swingAppUrl `SWING_APP_URL` |
| `bluesky`, `twitter`, `facebook`, `instagram`, `threads` | One block per connector. The fields are the connector's current `process.env` reads, camelCased with the prefix removed (e.g. `BLUESKY_HANDLE` → `handle`). |

Connectors that read keys at module load (e.g. `pexels-connector.js:3`, `guardian-connector.js:7`, `sendgrid.js:3`, `mailjet.js:7`, `telegram.js:4`, `claude-chat-helper.js:12`, `ai/openai.js:6`) are changed to read `serviceConfig()` at call time. SDK clients that are constructed once (Anthropic, OpenAI, Mailjet) are cached per `(service, envId)`.

When no environment is in context (e.g. at startup), `serviceConfig()` returns the global block.

## 6. Work outside a normal request

- **Webhooks (`/in/neon/webhook`):** each Neon environment's webhook config sends its own `extApiKey`, and resolution follows §2. The site switch in `neon-webhooks.js:75-123` is unchanged; follow-up calls to Méthode, Mailjet and FO use the environment's config.
- **Delayed importer:**
  - A job stores `envId` when it is created.
  - Every tick runs explicitly inside `context.run(registry.get(job.envId), …)`.
  - If the environment is no longer registered, the job fails with the status `env '<id>' no longer registered`.
  - Job list and status endpoints are filtered to the caller's environment. The admin key sees all jobs, tagged by env.
- **Neon config cache:**
  - The cache moves from `data/neon-config/` to `data/neon-config/<envId>/`.
  - Startup warm-up runs for each environment with `warmup !== false`. Warm-ups run in parallel, each inside its own context, with failures isolated: they are logged in the startup table and never block boot.
  - The `/neon-config` routes operate on the current environment.
- **SSE (`/api/neon/events/subscribe`):** the stream binds to its environment when it opens and subscribes to that environment's App notifier.
- **Claude chat:** sessions store `envId`, and later turns and tool calls run inside that environment's context.
- **Not affected:** the IAB cache and tag-manager.

## 7. Security fixes included in scope

- `/neon/api/core/metrics` and `/neon/api/core/metrics/*` call `authenticate()`. The Neon Analytics widget already sends the `apikey` header through `PanelAPI.apiCallJson`.
- All `/mobileclient*` routes call `authenticate()`. The page is opened once as `/mobileclient?apikey=<key>`, which sets the auth cookie; later fetches carry the cookie. Old links without `apikey` stop working (accepted).

## 8. Error handling

| Case | Result |
|---|---|
| Registry unparseable | Error logged, **fall back to legacy**, banner on `/services`. Boot never fails. |
| One invalid entry | That entry is skipped with a logged reason; the others load. |
| Key or host collision | All colliding entries are rejected. |
| Unknown key | 401 |
| Admin key + unknown env id | 400, listing the valid ids |
| Admin key, no env, no default | 400 "env required" |
| Host mismatch | 403, logged |
| Neon call with no env context | `NoNeonEnvError` → 500, logged with the stack |
| Optional `neon.fo` block missing | 501 "FO not configured for env X" |
| Per-environment service block incomplete | 500 "`<name>` incomplete for env X" |
| Delayed-import job env removed | Job status `failed`, with the reason |

## 9. Testing

The tests use `node:test` and are added to the `npm test` script.

- `test/neon-env/registry.test.js` — parsing, `env:` refs, required fields, id format, key/host collision rejection, single default, legacy fallback, and the ignore-legacy-when-file-exists warning.
- `test/neon-env/resolve.test.js` — every branch of §2, host match/mismatch/absent, and the limited-key role.
- `test/neon-env/context.test.js` — two concurrent resolved requests for different environments get different `NeonClient` instances and base URLs; with no context, `requireEnv()` throws.
- `test/neon-env/services.test.js` — the per-environment block wins, the global fallback is used when the block is absent, blocks are never merged field by field, and missing fields throw.
- `test/delayed-importer.test.js` (extended) — a job created under env A keeps ticking on A while requests for env B run in between.
- Route tests — metrics and mobile client return 401 without a key and 200 with one.

Manual checks:
1. The `/debug/headers` probe (§10).
2. Load one panel and one widget in two different Neon environments; confirm the console banner, the per-call logs and the `X-Neon-Env` header.
3. Standalone with the admin key and `?env=`.

## 10. Rollout

1. **Ship with the legacy fallback only.** No Render changes are needed, and behaviour is identical. A temporary `/debug/headers` route (admin key only) echoes the request headers.
2. **Probe.** Call `/debug/headers` through the demorc iframe proxy, record which headers carry the Neon host, and settle the host-check header list in `resolve.js`. Then remove the probe route.
3. **Add the Secret File** with two environments. Update each Neon environment's panel, widget and webhook integration config to use that environment's `extApiKey`.
4. **Remove** the legacy Neon env vars from Render. Global service keys stay as the fallback.

## Open questions

- Which headers the `/neon/api/demo-integration` proxy forwards (resolved in rollout step 2). The key-based resolution does not depend on this; only the secondary host check does.

## Amendments (planning phase, 2026-09-30)

These refinements came up while writing the implementation plan (`docs/superpowers/plans/2026-09-30-multi-neon-env.md`):

1. **Admin key with no explicit env: infer from the caller host.** Resolution order for the global admin key is:
   1. explicit env (`x-neon-env` header → `?env` → `neonEnv` cookie)
   2. registry env whose `hosts` contain the caller host
   3. the default env

   This keeps Neon iframes that still send the shared admin key pointed at the right env during rollout.
2. **Admin key, no env resolvable.** The request proceeds with no env (instead of a 400 at resolution time), and the first Neon call throws `NoNeonEnvError` (statusCode 400, listing valid ids). This way static assets and non-Neon routes are not blocked.
3. **Explicit env persistence.** An admin `?env=` or `x-neon-env` choice is stored in an httpOnly `neonEnv` cookie, so follow-up calls from a standalone page stay on that env. A cookie naming an env that is no longer registered is cleared and ignored.
4. **Self-host exclusion.** The host check ignores `Origin`/`Referer`/`X-Forwarded-Host` values equal to the request `Host` or `PROJECT_DOMAIN`, and ignores `Origin: null`.
5. **Keyless requests in legacy mode.** With no registry file, unauthenticated requests still run in the legacy env context, so keyless routes such as `/in/neon/webhook` (whose auth is currently commented out) keep working. In file mode, keyless requests get no env, so webhooks must carry `?apikey=<extApiKey>`.
6. **Console logging uses a global `fetch` wrapper.** The wrapper is injected inline into every HTML response (right after `<head>`). This replaces patching the individual helpers, so raw `fetch` calls in templates and React bundles are covered too. Only same-origin calls are logged. A missing `X-Neon-Env` header (e.g. stripped by the Neon proxy) is logged as such.
7. **Méthode TLS.** `methode-bo-api.js` keeps its Local-only process-wide TLS flag, because `axios-cookiejar-support` rejects custom `httpsAgent`s. Neon, PDF and Mailjet use per-request agents driven by `neon.insecureTls`.
8. **Claude chat sessions** are keyed by `<envId>:<sessionId>`.
9. **SDK client caches** (Anthropic, Sendgrid) are keyed by API key rather than env id, which gives equivalent isolation and simpler invalidation.
