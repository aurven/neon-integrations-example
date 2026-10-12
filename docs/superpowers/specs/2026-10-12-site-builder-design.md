# Site Builder (create a Neon site from a section outline): Design

**Date:** 2026-10-12
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:**
- `docs/superpowers/specs/2026-09-30-multi-neon-env-design.md` (per-request Neon env, registry)
- `docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md` (`neon.fo`)

## Goal

Editors give a site title and an indented outline of sections. The integrations hub then creates a headless Neon site with that section hierarchy in the request's Neon environment. A React widget, "Site Builder", drives the flow. Two endpoints back it: a side-effect-free preview and a create.

## Non-goals

- Publishing the site or sections. Create only; publishing stays manual in Neon.
- Undoing a partially created site. Site deletion needs a `secureCode`; admin endpoints are excluded.
- A visual tree editor. The outline text box is the input.
- Section styles, templates or custom attributes. `style` is sent with all-null values, as in the reference payload.

## 1. Registry: `neon.fo.siteHostSuffix`

- **New optional field:** `neon.fo.siteHostSuffix`, a non-empty string. Example: `"-canary.neon.test:3000"`.
- **Validation:** if the field is present, it must be a non-empty string. Otherwise the entry fails validation, as other fields do.
- **Normalized env:** `Env.neon.fo.siteHostSuffix` is the string, or `null` when absent.
- **Legacy mode:** `NEON_FO_SITE_HOST_SUFFIX`, read only when legacy `fo` is built.
- **Hostname rule:** `liveHostname = "https://" + siteName.replace(/-/g, "") + siteHostSuffix`.
  - Example: `il-mio-nuovo-sito` + `-canary.neon.test:3000` → `https://ilmionuovosito-canary.neon.test:3000`.
- **When it's missing:** both endpoints refuse with a plan error, `site creation not configured for env <id>: neon.fo.siteHostSuffix missing`. Nothing is created.

## 2. Plan builder: `src/helpers/site-builder/plan.js`

The parsing and pure validation in this module are deterministic and make no network calls. The "site name already exists" check needs Neon and is done in §3.

### Slugify: `slugify(text) → string`

1. NFD normalize, then strip combining marks (`à` → `a`).
2. Lowercase.
3. Replace each run of characters outside `[a-z0-9]` with `-`.
4. Trim leading and trailing `-`.

Examples:
- "Il Mio Nuovo Sito" → `il-mio-nuovo-sito`
- "Prima Sottosezione" → `prima-sottosezione`
- "Città & Cultura!" → `citta-cultura`

### Outline parsing: `parseOutline(outline) → { sections, errors }`

- **Lines:**
  - Lines are split on `\n` (`\r` stripped).
  - Lines that are blank or whitespace-only are ignored.
  - The title is the trimmed line.
- **Indentation width:** a tab counts as 2 spaces. The width is the count of leading spaces after tab expansion.
- **Depth uses a stack of open ancestors' widths:**
  - The first non-blank line must have width 0; otherwise it's an error (`line N: first section cannot be indented`).
  - A line wider than the current top of the stack is a child of the previous line. Only one level can be opened per line: a line whose width exceeds the previous line's width while the previous line itself was opened at a deeper depth is still exactly one level deeper.
  - A line not wider than the top pops ancestors until a match. The line's width must equal the width of an existing ancestor level, or 0; otherwise it's an error (`line N: indentation does not match any parent level`).
- **Section shape:** `{ line, title, name: slugify(title), depth (1-based), parentIndex (index into sections, or null for top level), path }`.
  - `path` is `"/" + ancestor names and own name joined by "/" + "/"`. Example: `/prima-sezione/prima-sottosezione/`.
- **Errors:**
  - `line N: "<title>" has no usable characters for a name` when the slug is empty.
  - `line N: duplicate section "<name>" under <parent path or "/">` for siblings with the same `name`.

### Plan: `buildPlan({ title, outline }, env) → { site, sections, errors }`

- **`title`:** trimmed. If empty, the error is `title is required`. If its slug is empty, the error is `title has no usable characters for a site name`.
- **`site`:**
  ```js
  { name, title, liveHostname,
    payload: { type: 'site/headless', name, description: '', parentRef: '', familyRef: '', title, liveHostname, group: '' } }
  ```
- **`sections`:** from `parseOutline`. Each section also has a `payload(siteName, parentId)` builder that produces:
  ```js
  { siteName, parentId, name, type: 'section', title, description: null, path,
    style: { theme: null, variant: null, type: null, template: null }, status: null }
  ```
- **`errors`:** title errors, outline errors, plus the `siteHostSuffix` error from §1 when that field is missing.
- **No sections:** an outline with no sections is allowed (the site is created alone).
- **Section limit:** at most 200 sections. More is an error, `outline has N sections; the limit is 200`.

## 3. Service: `src/helpers/site-builder/create-site.js`

`createSiteFromPlan(plan, neon) → Promise<Report>`, where `neon` is a `NeonClient` (env-bound). It is injected for tests.

### Up-front checks (`checkPlan(plan, neon) → errors[]`)

- These run on top of `plan.errors`.
- **Name collision:** if a site named `plan.site.name` already exists, the error is `site "<name>" already exists in env <id>`.
  - The existing sites come from `neon.getSites({ limit: 1000 })`.
  - A site matches when its `name` or `siteName` equals `plan.site.name`, ignoring case.

### Creating the site

1. **Create the site.** Call `neon.makeRequest({ method: 'post', url: '/core/sites/create', data: plan.site.payload }, …, true)`.
   - This is the raw payload shape from §2, not `createSite`, because the Neon UI payload (`parentRef`, `familyRef`, `group`) is not the OpenAPI `SiteForCreate`. A thin method, `createHeadlessSite(payload)`, is added to `NeonClient` for this.
2. **Resolve the root node id.** Take the first non-empty value of:
   - `res.id`
   - `res.familyRef`
   - `res.root?.id`
   - `res.result?.id`
   - otherwise, look up the site: call `neon.getSites({ limit: 1000 })`, match by name, and take the matched site's root id from `id`, then `root.id`, then `familyRef`.

   If no root id is found, the site status is `created` but every section is `skipped`, with the error `could not determine the new site's root node id`.
3. **Create the sections.** Go in plan order, which is already parent-before-child.
   - **Skipped:** if the section's parent is not `created`, the section is `skipped` with the error `parent "<parent path>" was not created`.
   - **Otherwise:**
     - Call `neon.createSiteNodeRaw(section.payload(plan.site.name, parentId))`, a POST to `/core/sites/nodes/create` with the raw payload.
     - `parentId` is the root id for depth 1, or the parent's created id otherwise.
     - The new id comes from `res.id || res.familyRef`.
     - On success the section is `created` with that id. If the id is missing, it is `failed` with the error `node created but no id returned`.
     - On an exception it is `failed` with the error message (including the Neon status when present).
   - **Order:** sections run sequentially.
4. **Site creation failure.** If step 1 throws, the report has site status `failed` and every section is `skipped`.

### Report

```js
{
  env: '<id>',
  site: { status: 'created' | 'failed', name, title, liveHostname, id?, error? },
  sections: [{ path, title, depth, status: 'created' | 'failed' | 'skipped', id?, error? }],
  counts: { created, failed, skipped }
}
```

## 4. HTTP endpoints

The endpoints are registered in `server.js` under `/api/neon/site-builder/…` and run inside the request env context.

- **Auth:**
  - Unauthenticated → 401.
  - Role other than `admin` → 403 `site creation requires an admin key`.
- **Request body:** `{ title: string, outline: string }`. A missing or non-string field → 400.
- **`POST /api/neon/site-builder/preview`:**
  - Returns 200 with `{ env, site: { name, title, liveHostname }, sections: [{ path, title, depth, name }], errors }`, where `errors` = `plan.errors` + `checkPlan` errors.
  - It never creates anything.
- **`POST /api/neon/site-builder/create`:**
  - Builds the plan and runs `checkPlan`. If there are errors, it returns 400 `{ errors }` and creates nothing.
  - Otherwise it runs `createSiteFromPlan`:
    - 200 with the report when the site was created (even if some sections failed);
    - 502 with the report when the site creation failed.
- **Demo mode:**
  - `?demo=true` on either endpoint skips Neon entirely.
  - Preview works without the `getSites` check.
  - Create returns a simulated report: every section `created` with ids `demo-<n>`, and the site id `demo-root`.

## 5. Widget: Site Builder

- **Build:** React, Vite IIFE bundle, Neon design system. It follows the existing React widget setup (the `neon-react-widget` skill: Vite config, HBS shell, Fastify route, demo mode, services dashboard entry).
- **Route:** `GET /widgets/site-builder`, served through the HBS shell with `window.CONFIG = { apiKey, demo, neonEnv }`.
- **UI:**
  - A "Site title" text field.
  - An "Sections" textarea (monospace; Tab inserts two spaces), with a placeholder showing a two-level example.
  - **Preview panel,** fed by a debounced (400 ms) `POST …/preview`:
    - the target env label;
    - the resolved `liveHostname`;
    - the section tree with each title, `name` and `path`;
    - the error list.
  - **"Create site" button:**
    - disabled while the preview has errors, is loading, or the title is empty;
    - asks for confirmation (`Create site "<title>" in <env label>?`) before calling `…/create`.
  - **Result view:**
    - site status;
    - per-section status badges (created / failed / skipped), with error text;
    - the counts summary.
- The page gets the existing console environment banner automatically.
- **Services dashboard:** gets a "Site Builder" widget entry.

## 6. Error handling summary

| Case | Result |
|---|---|
| No / bad key | 401 |
| Limited key | 403 |
| Body not `{ title: string, outline: string }` | 400 |
| `siteHostSuffix` missing, bad title or outline, duplicate siblings, more than 200 sections, site name taken | preview: 200 with `errors`; create: 400 `{ errors }`, nothing created |
| Site create fails | 502 with the report, all sections `skipped` |
| Root id not found | 200 with the report, site `created`, sections `skipped` |
| A section fails | 200 with the report; the section is `failed`, its descendants `skipped`, siblings continue |

## 7. Testing (`node:test`, no network)

- **plan:**
  - slugify cases, including accents and punctuation;
  - indentation (spaces, tabs, multi-level, back-dedent, a bad first line, an indent that matches no parent level);
  - duplicate siblings;
  - empty slug;
  - the 200 limit;
  - `liveHostname` from the reference example;
  - site and section payloads equal to the two reference payloads field for field. Example: `il-mio-nuovo-sito` / `prima-sezione` / `prima-sottosezione`, with parent ids injected.
- **create-site,** against a fake `NeonClient`:
  - call order, and the `parentId` passed for each level;
  - a failure skips only the failed section's descendants;
  - site-create failure;
  - each root-id resolution branch, including the `getSites` fallback;
  - a missing node id → `failed`;
  - `checkPlan` name collision.
- **routes:** registered with the neon-env plugin and a stubbed client: 401, 403 (limited key), 400 for a bad body, 400 on create with errors (no Neon calls), preview has no side effects, and the demo create report.
- **registry:** `siteHostSuffix` normalized, validated, and in legacy form.
- **widget:** `npm run build` for the widget bundle succeeds.

## 8. Rollout

1. Add `neon.fo.siteHostSuffix` to each env that should allow site creation, in both the local `config/neon-environments.json` and the Render Secret File. Example for the sandbox: `-canary.neon.test:3000`.
2. On the sandbox, create one small site (2 levels) and check:
   - the site appears in Neon as headless;
   - the sections are nested correctly;
   - the report's ids match Neon.

   This confirms where the create response puts the root node id (§3 step 2).
