# Site Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a headless Neon site with a section hierarchy from a site title and an indented outline. This is exposed as preview and create endpoints and driven by a React "Site Builder" widget.

**Architecture:**
- A pure plan builder (`src/helpers/site-builder/plan.js`) turns `{ title, outline }` into Neon payloads plus validation errors.
- A service (`create-site.js`) checks the plan against Neon and then creates the site and its sections parent-first, continuing past failures.
- Fastify handlers (`src/requestHandlers/site-builder.js`) expose `POST /api/neon/site-builder/preview|create` for admin keys only.
- A Vite IIFE React widget calls them.
- The live hostname comes from the new registry field `neon.fo.siteHostSuffix`.

**Tech Stack:** Node 20, Fastify 4, `node:test`, React 18 + Vite 5 (IIFE bundle, `src/react-widgets`), Neon design tokens (`public/css/neon-design-system.css`).

**Spec:** `docs/superpowers/specs/2026-10-12-site-builder-design.md`

## Global Constraints

- **Site payload:** always `{ type: 'site/headless', name, description: '', parentRef: '', familyRef: '', title, liveHostname, group: '' }`, posted to `/core/sites/create` (through BO).
- **Section payload:** `{ siteName, parentId, name, type: 'section', title, description: null, path, style: { theme: null, variant: null, type: null, template: null }, status: null }`, posted to `/core/sites/nodes/create`.
- **Live hostname:** `https://` + site name without hyphens + `neon.fo.siteHostSuffix`. Example: `il-mio-nuovo-sito` + `-canary.neon.test:3000` → `https://ilmionuovosito-canary.neon.test:3000`.
- **Slugify:** NFD with combining marks stripped, then lowercase, then each run of characters outside `[a-z0-9]` becomes `-`, then leading and trailing `-` are trimmed.
- **Indentation:** a tab = 2 spaces.
  - A line wider than the previous line is its child (depth + 1).
  - A line of equal width is a sibling.
  - A narrower line must match the width of an open level exactly, otherwise it's an error.
  - The first section cannot be indented.
- **Limits:** at most 200 sections.
- **Up-front checks:** on top of the plan errors, a site name already present (case-insensitive on `name` or `siteName`, from `getSites({ limit: 1000 })`) is an error.
- **Admin only:** 401 when unauthenticated; 403 `site creation requires an admin key` for a non-admin role.
- **Create responses:**
  - If there are validation errors: 400 `{ errors }`, and nothing is created.
  - Site created (even with section failures): 200 with the report.
  - Site creation failed: 502 with the report.
- **Failure policy:** sections are created sequentially in plan order. When a section fails, its descendants are `skipped` with the error `parent "<path>" was not created`; siblings continue. Nothing is published.
- **Error messages** (exact):
  - `title is required`
  - `title has no usable characters for a site name`
  - `site creation not configured for env <id>: neon.fo.siteHostSuffix missing`
  - `line N: first section cannot be indented`
  - `line N: indentation does not match any parent level`
  - `line N: "<title>" has no usable characters for a name`
  - `line N: duplicate section "<name>" under <parent path or "/">`
  - `outline has N sections; the limit is 200`
  - `site "<name>" already exists in env <id>`
  - `could not check existing sites in env <id>: <message>`
  - `could not determine the new site's root node id`
  - `node created but no id returned`
- **Tests** use `node:test` and never touch the network.
- **Workflow:** work in branch `develop`, worktree `.claude/worktrees/develop`. Commit per task. Do not push. Baseline `npm test` = 238/238.

## Review Focus

1. **Outline pasted from a Word or email document with mixed tabs and spaces, or CRLF line endings** must parse the way it looks: tab = 2 spaces, `\r` stripped. Covered by a test in Task 2.
2. **Site title with accents or punctuation only** ("Città!" or "!!!") must produce a valid slug or a clean error, never an empty name sent to Neon. Covered by a test in Task 2.
3. **A deep chain where a middle section fails** must skip all of its descendants (grandchildren included) while later top-level siblings are still created. Covered by a test in Task 3.
4. **`getSites` failing** (Neon unreachable) during the up-front check must block create with a clear error instead of creating blindly. Covered by a test in Task 3.
5. **The widget double-submitting** (a double click on Create) must not create the site twice. Covered in Task 5: the button is disabled while the request is in flight.

---

## File Structure

- **Create:**
  - `src/helpers/site-builder/plan.js`: slugify, parseOutline, buildPlan, sectionPayload (pure)
  - `src/helpers/site-builder/create-site.js`: checkPlan, createSiteFromPlan, demoReport
  - `src/requestHandlers/site-builder.js`: preview and create handlers, plus a client test seam
  - `src/react-widgets/src/site-builder/{main.jsx,SiteBuilderWidget.jsx,api.js,site-builder.css}`
  - `src/react-widgets/vite.site-builder.config.js`
  - `src/widgets/site-builder.hbs`
  - `public/js/react/site-builder.{js,css}` (build output, committed like the other bundles)
  - tests: `test/neon-env/site-builder-plan.test.js`, `test/neon-env/site-builder-create.test.js`, `test/neon-env/site-builder-routes.test.js`
- **Modify:**
  - `src/helpers/neon-env/registry.js` (`siteHostSuffix`)
  - `test/neon-env/registry.test.js`
  - `src/helpers/neon-bo-api-v3.js` (`createHeadlessSite`, `createSiteNodeRaw`)
  - `test/neon-env/neon-core-sites.test.js`
  - `server.js` (routes, services dashboard)
  - `src/requestHandlers/widgets.js` (page handler)
  - `src/react-widgets/package.json` (build script)
  - `config/neon-environments.example.json`, `README.md`

---

### Task 1: Registry `neon.fo.siteHostSuffix` + raw site/node client methods

**Files:**
- Modify: `src/helpers/neon-env/registry.js`, `test/neon-env/registry.test.js`, `src/helpers/neon-bo-api-v3.js`, `test/neon-env/neon-core-sites.test.js`, `config/neon-environments.example.json`

**Interfaces:**
- **Produces:**
  - `Env.neon.fo.siteHostSuffix: string | null`
  - `NeonClient#createHeadlessSite(payload) → Promise<object>`: POST `/core/sites/create`, returns the response data
  - `NeonClient#createSiteNodeRaw(payload) → Promise<object>`: POST `/core/sites/nodes/create`, returns the response data
  - Flat exports `createHeadlessSite`, `createSiteNodeRaw`

- [ ] **Step 1: Write the failing tests**

Append to `test/neon-env/registry.test.js`:
```js
test('neon.fo.siteHostSuffix is normalized (default null)', () => {
  const withSuffix = envJson('a', { neon: { ...envJson('a').neon, fo: { url: 'https://neon-fo-a.example.com', apiKey: 'k', siteHostSuffix: '-canary.neon.test:3000' } } });
  const reg = buildRegistry({ json: registryJson([withSuffix, envJson('b')]), envVars: {} });
  assert.equal(reg.get('a').neon.fo.siteHostSuffix, '-canary.neon.test:3000');
  assert.equal(reg.get('b').neon.fo.siteHostSuffix, null);
});

test('neon.fo.siteHostSuffix must be a non-empty string when present', () => {
  const bad = envJson('bad', { neon: { ...envJson('bad').neon, fo: { url: 'https://neon-fo-bad.example.com', apiKey: 'k', siteHostSuffix: '' } } });
  const reg = buildRegistry({ json: registryJson([bad, envJson('ok')]), envVars: {} });
  assert.deepEqual(reg.ids(), ['ok']);
  assert.match(reg.skipped[0].reason, /neon\.fo\.siteHostSuffix must be a non-empty string/);
});

test('legacy NEON_FO_SITE_HOST_SUFFIX is read with legacy fo', () => {
  const reg = buildRegistry({ json: null, envVars: { NEON_FO_URL: 'https://fo.local', NEON_FO_APIKEY: 'fo', NEON_FO_SITE_HOST_SUFFIX: '-x.local' } });
  assert.equal(reg.get('legacy').neon.fo.siteHostSuffix, '-x.local');
});
```

Append to `test/neon-env/neon-core-sites.test.js`:
```js
test('createHeadlessSite posts the raw payload unchanged', async () => {
  const payload = { type: 'site/headless', name: 'il-mio-nuovo-sito', description: '', parentRef: '', familyRef: '', title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000', group: '' };
  const c = await callOf((n) => n.createHeadlessSite(payload), { id: 'root-1' });
  assert.deepEqual({ method: c.method, url: c.url, data: c.data }, { method: 'post', url: '/core/sites/create', data: payload });
  assert.deepEqual(c.result, { id: 'root-1' });
});

test('createSiteNodeRaw posts the raw payload unchanged', async () => {
  const payload = { siteName: 'il-mio-nuovo-sito', parentId: 'p', name: 'prima-sezione', type: 'section', title: 'Prima Sezione', description: null, path: '/prima-sezione/', style: { theme: null, variant: null, type: null, template: null }, status: null };
  const c = await callOf((n) => n.createSiteNodeRaw(payload), { id: 'n-1' });
  assert.deepEqual({ method: c.method, url: c.url, data: c.data }, { method: 'post', url: '/core/sites/nodes/create', data: payload });
});

test('raw create methods require a payload and are flat-exported', async () => {
  const { client, calls } = stubbedClient();
  await assert.rejects(() => client.createHeadlessSite(), /payload is required/);
  await assert.rejects(() => client.createSiteNodeRaw(), /payload is required/);
  assert.equal(calls.length, 0);
  assert.equal(typeof neonApi.createHeadlessSite, 'function');
  assert.equal(typeof neonApi.createSiteNodeRaw, 'function');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/neon-env/registry.test.js test/neon-env/neon-core-sites.test.js`
Expected: FAIL (`siteHostSuffix` undefined; `createHeadlessSite` is not a function).

- [ ] **Step 3: Implement**

In `src/helpers/neon-env/registry.js`:
- In `validateEntry`, inside the `if (neon.fo !== undefined) { … }` block, append:
  ```js
      if (neon.fo?.siteHostSuffix !== undefined && !isNonEmptyString(neon.fo.siteHostSuffix)) errors.push('neon.fo.siteHostSuffix must be a non-empty string');
  ```
- In `normalize`, change the `fo` object to:
  ```js
        ? { url: raw.neon.fo.url.replace(/\/+$/, ''), apiKey: raw.neon.fo.apiKey, host: hostOf(raw.neon.fo.url), siteHostSuffix: raw.neon.fo.siteHostSuffix || null }
  ```
- In `buildLegacyEnv`, change the legacy `fo = { … }` to:
  ```js
      fo = { url: envVars.NEON_FO_URL.replace(/\/+$/, ''), apiKey: envVars.NEON_FO_APIKEY, host: hostOf(envVars.NEON_FO_URL), siteHostSuffix: envVars.NEON_FO_SITE_HOST_SUFFIX || null };
  ```
- Existing tests that `deepEqual` a normalized `fo` object must now include `siteHostSuffix: null`. Update those assertions; they are the ones asserting `{ url, apiKey, host }`.

In `src/helpers/neon-bo-api-v3.js`, add to the `NeonClient` class directly after `createSiteNode`:
```js
    // Raw payload as sent by the Neon UI (Site Builder); not the OpenAPI SiteForCreate shape
    async createHeadlessSite(payload) {
        requireArg(payload, 'payload');
        return await this.makeRequest({
            method: 'post',
            url: '/core/sites/create',
            data: payload
        }, `Site ${payload.name} created`, true);
    }

    // Raw payload as sent by the Neon UI (Site Builder); not the OpenAPI NodeForCreate shape
    async createSiteNodeRaw(payload) {
        requireArg(payload, 'payload');
        return await this.makeRequest({
            method: 'post',
            url: '/core/sites/nodes/create',
            data: payload
        }, `Site node ${payload.path} created`, true);
    }
```
Add these flat exports next to `createSiteNode:`:
```js
    createHeadlessSite: (payload) => currentClient().createHeadlessSite(payload),
    createSiteNodeRaw: (payload) => currentClient().createSiteNodeRaw(payload),
```

In `config/neon-environments.example.json`, add `"siteHostSuffix": "-demorc.example.com"` inside the `fo` object. Validate with `node -e "JSON.parse(require('fs').readFileSync('config/neon-environments.example.json','utf8'))"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/neon-env/registry.test.js test/neon-env/neon-core-sites.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/neon-env/registry.js test/neon-env/registry.test.js src/helpers/neon-bo-api-v3.js test/neon-env/neon-core-sites.test.js config/neon-environments.example.json
git commit -m "feat(site-builder): neon.fo.siteHostSuffix and raw site/node create client methods"
```

---

### Task 2: Plan builder (`src/helpers/site-builder/plan.js`)

**Files:**
- Create: `src/helpers/site-builder/plan.js`, `test/neon-env/site-builder-plan.test.js`

**Interfaces:**
- **Consumes:** `Env` shape `{ id, neon: { fo: { siteHostSuffix } | null } }` (Task 1).
- **Produces:**
  - `slugify(text) → string`
  - `parseOutline(outline) → { sections: Section[], errors: string[] }`, where `Section = { line, title, name, depth, parentIndex: number | null, path }`
  - `buildPlan({ title, outline }, env) → { site: { name, title, liveHostname, payload }, sections: Section[], errors: string[] }`
  - `sectionPayload(section, siteName, parentId) → object`
  - `MAX_SECTIONS = 200`

- [ ] **Step 1: Write the failing tests `test/neon-env/site-builder-plan.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify, parseOutline, buildPlan, sectionPayload, MAX_SECTIONS } = require('../../src/helpers/site-builder/plan.js');

const ENV = { id: 'sandbox', neon: { fo: { url: 'https://neon-fo.neon.test', apiKey: 'k', siteHostSuffix: '-canary.neon.test:3000' } } };

test('slugify', () => {
  assert.equal(slugify('Il Mio Nuovo Sito'), 'il-mio-nuovo-sito');
  assert.equal(slugify('Prima Sottosezione'), 'prima-sottosezione');
  assert.equal(slugify('Città & Cultura!'), 'citta-cultura');
  assert.equal(slugify('  --Économie__2026--  '), 'economie-2026');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(undefined), '');
});

test('parseOutline: nesting with spaces, paths and parents', () => {
  const { sections, errors } = parseOutline('Prima Sezione\n  Prima Sottosezione\n    Terzo Livello\nSeconda Sezione\n  Altra Sottosezione');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => [s.depth, s.name, s.path, s.parentIndex]), [
    [1, 'prima-sezione', '/prima-sezione/', null],
    [2, 'prima-sottosezione', '/prima-sezione/prima-sottosezione/', 0],
    [3, 'terzo-livello', '/prima-sezione/prima-sottosezione/terzo-livello/', 1],
    [1, 'seconda-sezione', '/seconda-sezione/', null],
    [2, 'altra-sottosezione', '/seconda-sezione/altra-sottosezione/', 3],
  ]);
  assert.equal(sections[0].title, 'Prima Sezione');
  assert.equal(sections[0].line, 1);
});

test('parseOutline: tabs = 2 spaces, CRLF and blank lines ignored', () => {
  const { sections, errors } = parseOutline('A\r\n\tB\r\n  C\r\n\r\n\t\tD\r\nE');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => [s.depth, s.path]), [
    [1, '/a/'], [2, '/a/b/'], [2, '/a/c/'], [3, '/a/c/d/'], [1, '/e/'],
  ]);
});

test('parseOutline: a much wider line is still exactly one level deeper', () => {
  const { sections } = parseOutline('A\n        B');
  assert.deepEqual(sections.map((s) => s.depth), [1, 2]);
});

test('parseOutline: back-dedent to a matching open level', () => {
  const { sections, errors } = parseOutline('A\n  B\n    C\n  D');
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.map((s) => s.path), ['/a/', '/a/b/', '/a/b/c/', '/a/d/']);
});

test('parseOutline: indentation errors', () => {
  assert.deepEqual(parseOutline('  A\nB').errors, ['line 1: first section cannot be indented']);
  assert.deepEqual(parseOutline('A\n    B\n  C').errors, ['line 3: indentation does not match any parent level']);
});

test('parseOutline: unusable titles and duplicate siblings', () => {
  assert.deepEqual(parseOutline('A\n  !!!').errors, ['line 2: "!!!" has no usable characters for a name']);
  assert.deepEqual(parseOutline('News\n  Sport\n  sport!\nnews').errors, [
    'line 3: duplicate section "sport" under /news/',
    'line 4: duplicate section "news" under /',
  ]);
  assert.deepEqual(parseOutline('A\n  X\nB\n  X').errors, []);
});

test('buildPlan: site payload and hostname from the reference example', () => {
  const plan = buildPlan({ title: '  Il Mio Nuovo Sito ', outline: 'Prima Sezione\n  Prima Sottosezione' }, ENV);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.site, {
    name: 'il-mio-nuovo-sito',
    title: 'Il Mio Nuovo Sito',
    liveHostname: 'https://ilmionuovosito-canary.neon.test:3000',
    payload: {
      type: 'site/headless', name: 'il-mio-nuovo-sito', description: '', parentRef: '', familyRef: '',
      title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000', group: '',
    },
  });
});

test('sectionPayload matches the reference payloads', () => {
  const plan = buildPlan({ title: 'Il Mio Nuovo Sito', outline: 'Prima Sezione\n  Prima Sottosezione' }, ENV);
  assert.deepEqual(sectionPayload(plan.sections[0], 'il-mio-nuovo-sito', '40ec-3774c37ee54c-9ccd1bdde21f-2000'), {
    siteName: 'il-mio-nuovo-sito', parentId: '40ec-3774c37ee54c-9ccd1bdde21f-2000', name: 'prima-sezione', type: 'section',
    title: 'Prima Sezione', description: null, path: '/prima-sezione/',
    style: { theme: null, variant: null, type: null, template: null }, status: null,
  });
  assert.deepEqual(sectionPayload(plan.sections[1], 'il-mio-nuovo-sito', '40ec-e686376c1ef5-0d86c42db72b-2001'), {
    siteName: 'il-mio-nuovo-sito', parentId: '40ec-e686376c1ef5-0d86c42db72b-2001', name: 'prima-sottosezione', type: 'section',
    title: 'Prima Sottosezione', description: null, path: '/prima-sezione/prima-sottosezione/',
    style: { theme: null, variant: null, type: null, template: null }, status: null,
  });
});

test('buildPlan: title errors', () => {
  assert.deepEqual(buildPlan({ title: '   ', outline: '' }, ENV).errors, ['title is required']);
  const bad = buildPlan({ title: '!!!', outline: '' }, ENV);
  assert.deepEqual(bad.errors, ['title has no usable characters for a site name']);
  assert.equal(bad.site.liveHostname, null);
});

test('buildPlan: missing siteHostSuffix', () => {
  const env = { id: 'nosuffix', neon: { fo: { url: 'https://x', apiKey: 'k', siteHostSuffix: null } } };
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, env).errors, ['site creation not configured for env nosuffix: neon.fo.siteHostSuffix missing']);
  const noFo = { id: 'nofo', neon: { fo: null } };
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, noFo).errors, ['site creation not configured for env nofo: neon.fo.siteHostSuffix missing']);
});

test('buildPlan: empty outline is allowed; section limit enforced', () => {
  assert.deepEqual(buildPlan({ title: 'Sito', outline: '' }, ENV).sections, []);
  const many = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => `S ${i}`).join('\n');
  assert.deepEqual(buildPlan({ title: 'Sito', outline: many }, ENV).errors, [`outline has ${MAX_SECTIONS + 1} sections; the limit is ${MAX_SECTIONS}`]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/neon-env/site-builder-plan.test.js`
Expected: FAIL with `Cannot find module '../../src/helpers/site-builder/plan.js'`

- [ ] **Step 3: Implement `src/helpers/site-builder/plan.js`**

```js
'use strict';
/**
 * Site Builder plan: site title + indented outline → Neon site/section payloads + validation errors.
 * Pure, no network. Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §2
 */

const MAX_SECTIONS = 200;
const TAB_WIDTH = 2;

function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH;
    else break;
  }
  return width;
}

function parseOutline(outline) {
  const sections = [];
  const errors = [];
  let stack = []; // open levels: { width, depth, index }

  String(outline ?? '').replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const width = indentWidth(raw);
    const title = raw.trim();

    let parent = null;
    let depth;
    let nextStack;
    if (stack.length === 0) {
      if (width !== 0) { errors.push(`line ${line}: first section cannot be indented`); return; }
      depth = 1;
      nextStack = [];
    } else if (width > stack[stack.length - 1].width) {
      parent = stack[stack.length - 1];
      depth = parent.depth + 1;
      nextStack = [...stack];
    } else {
      const s = [...stack];
      while (s.length && s[s.length - 1].width > width) s.pop();
      const level = s[s.length - 1];
      if (!level || level.width !== width) { errors.push(`line ${line}: indentation does not match any parent level`); return; }
      s.pop();
      parent = s[s.length - 1] || null;
      depth = level.depth;
      nextStack = s;
    }

    const name = slugify(title);
    if (!name) { errors.push(`line ${line}: "${title}" has no usable characters for a name`); return; }

    const parentPath = parent ? sections[parent.index].path : '/';
    const index = sections.length;
    sections.push({ line, title, name, depth, parentIndex: parent ? parent.index : null, path: `${parentPath}${name}/` });
    nextStack.push({ width, depth, index });
    stack = nextStack;
  });

  const seen = new Map();
  for (const section of sections) {
    const key = `${section.parentIndex}|${section.name}`;
    if (seen.has(key)) {
      const parentPath = section.parentIndex === null ? '/' : sections[section.parentIndex].path;
      errors.push(`line ${section.line}: duplicate section "${section.name}" under ${parentPath}`);
    } else {
      seen.set(key, section);
    }
  }

  return { sections, errors };
}

function buildPlan({ title, outline } = {}, env) {
  const errors = [];
  const siteTitle = String(title ?? '').trim();
  const name = slugify(siteTitle);
  if (!siteTitle) errors.push('title is required');
  else if (!name) errors.push('title has no usable characters for a site name');

  const suffix = env?.neon?.fo?.siteHostSuffix;
  if (!suffix) errors.push(`site creation not configured for env ${env?.id}: neon.fo.siteHostSuffix missing`);
  const liveHostname = name && suffix ? `https://${name.replace(/-/g, '')}${suffix}` : null;

  const parsed = parseOutline(outline);
  errors.push(...parsed.errors);
  if (parsed.sections.length > MAX_SECTIONS) {
    errors.push(`outline has ${parsed.sections.length} sections; the limit is ${MAX_SECTIONS}`);
  }

  return {
    site: {
      name,
      title: siteTitle,
      liveHostname,
      payload: { type: 'site/headless', name, description: '', parentRef: '', familyRef: '', title: siteTitle, liveHostname, group: '' },
    },
    sections: parsed.sections,
    errors,
  };
}

function sectionPayload(section, siteName, parentId) {
  return {
    siteName,
    parentId,
    name: section.name,
    type: 'section',
    title: section.title,
    description: null,
    path: section.path,
    style: { theme: null, variant: null, type: null, template: null },
    status: null,
  };
}

module.exports = { MAX_SECTIONS, slugify, parseOutline, buildPlan, sectionPayload };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/neon-env/site-builder-plan.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/site-builder/plan.js test/neon-env/site-builder-plan.test.js
git commit -m "feat(site-builder): outline parser and Neon site/section plan builder"
```

---

### Task 3: Create service (`src/helpers/site-builder/create-site.js`)

**Files:**
- Create: `src/helpers/site-builder/create-site.js`, `test/neon-env/site-builder-create.test.js`

**Interfaces:**
- **Consumes:**
  - `buildPlan` and `sectionPayload` (Task 2)
  - a client object with `getSites({ limit }) → Promise<Site[]>`, `createHeadlessSite(payload)` and `createSiteNodeRaw(payload)` (Task 1)
- **Produces:**
  - `checkPlan(plan, neon, envId) → Promise<string[]>`
  - `createSiteFromPlan(plan, neon, envId) → Promise<Report>`
  - `demoReport(plan, envId) → Report`
  - `Report = { env, site: { status, name, title, liveHostname, id?, error? }, sections: [{ path, title, depth, status, id?, error? }], counts: { created, failed, skipped } }`

- [ ] **Step 1: Write the failing tests `test/neon-env/site-builder-create.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../../src/helpers/site-builder/plan.js');
const { checkPlan, createSiteFromPlan, demoReport } = require('../../src/helpers/site-builder/create-site.js');

const ENV = { id: 'sandbox', neon: { fo: { url: 'https://fo', apiKey: 'k', siteHostSuffix: '-canary.neon.test:3000' } } };
const plan = (outline) => buildPlan({ title: 'Il Mio Nuovo Sito', outline }, ENV);

function fakeNeon({ sites = [], siteResponse = { id: 'root-1' }, failPaths = [], noIdPaths = [], siteError = null, sitesError = null } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async getSites(options) {
      calls.push(['getSites', options]);
      if (sitesError) throw sitesError;
      return typeof sites === 'function' ? sites() : sites;
    },
    async createHeadlessSite(payload) {
      calls.push(['site', payload]);
      if (siteError) throw siteError;
      return siteResponse;
    },
    async createSiteNodeRaw(payload) {
      calls.push(['node', payload]);
      if (failPaths.includes(payload.path)) {
        const err = new Error('Request failed'); err.response = { status: 409, data: { message: 'name already used' } }; throw err;
      }
      if (noIdPaths.includes(payload.path)) return {};
      n += 1;
      return { id: `node-${n}` };
    },
  };
}

test('checkPlan: name collision is case-insensitive on name or siteName', async () => {
  assert.deepEqual(await checkPlan(plan(''), fakeNeon({ sites: [{ name: 'other' }] }), 'sandbox'), []);
  assert.deepEqual(await checkPlan(plan(''), fakeNeon({ sites: [{ siteName: 'IL-MIO-NUOVO-SITO' }] }), 'sandbox'),
    ['site "il-mio-nuovo-sito" already exists in env sandbox']);
  const neon = fakeNeon();
  await checkPlan(plan(''), neon, 'sandbox');
  assert.deepEqual(neon.calls[0], ['getSites', { limit: 1000 }]);
});

test('checkPlan: getSites failure blocks with a clear error', async () => {
  const errors = await checkPlan(plan(''), fakeNeon({ sitesError: new Error('ECONNREFUSED') }), 'sandbox');
  assert.deepEqual(errors, ['could not check existing sites in env sandbox: ECONNREFUSED']);
});

test('creates site then sections parent-first with correct parentIds', async () => {
  const neon = fakeNeon();
  const report = await createSiteFromPlan(plan('Prima Sezione\n  Prima Sottosezione\nSeconda'), neon, 'sandbox');
  assert.equal(neon.calls[0][0], 'site');
  assert.equal(neon.calls[0][1].type, 'site/headless');
  const nodes = neon.calls.filter((c) => c[0] === 'node').map((c) => [c[1].path, c[1].parentId, c[1].siteName]);
  assert.deepEqual(nodes, [
    ['/prima-sezione/', 'root-1', 'il-mio-nuovo-sito'],
    ['/prima-sezione/prima-sottosezione/', 'node-1', 'il-mio-nuovo-sito'],
    ['/seconda/', 'root-1', 'il-mio-nuovo-sito'],
  ]);
  assert.deepEqual(report.site, { status: 'created', name: 'il-mio-nuovo-sito', title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000', id: 'root-1' });
  assert.deepEqual(report.sections.map((s) => [s.path, s.status, s.id]), [
    ['/prima-sezione/', 'created', 'node-1'],
    ['/prima-sezione/prima-sottosezione/', 'created', 'node-2'],
    ['/seconda/', 'created', 'node-3'],
  ]);
  assert.deepEqual(report.counts, { created: 3, failed: 0, skipped: 0 });
  assert.equal(report.env, 'sandbox');
});

test('a failed middle section skips all its descendants; siblings continue', async () => {
  const neon = fakeNeon({ failPaths: ['/a/b/'] });
  const report = await createSiteFromPlan(plan('A\n  B\n    C\n      D\n  E\nF'), neon, 'sandbox');
  assert.deepEqual(report.sections.map((s) => [s.path, s.status]), [
    ['/a/', 'created'], ['/a/b/', 'failed'], ['/a/b/c/', 'skipped'], ['/a/b/c/d/', 'skipped'], ['/a/e/', 'created'], ['/f/', 'created'],
  ]);
  assert.equal(report.sections[1].error, '409: name already used');
  assert.equal(report.sections[2].error, 'parent "/a/b/" was not created');
  assert.equal(report.sections[3].error, 'parent "/a/b/c/" was not created');
  assert.ok(!neon.calls.some((c) => c[0] === 'node' && c[1].path.startsWith('/a/b/c/')));
  assert.deepEqual(report.counts, { created: 3, failed: 1, skipped: 2 });
});

test('node created without id -> failed, descendants skipped', async () => {
  const report = await createSiteFromPlan(plan('A\n  B'), fakeNeon({ noIdPaths: ['/a/'] }), 'sandbox');
  assert.deepEqual(report.sections.map((s) => [s.status, s.error]), [['failed', 'node created but no id returned'], ['skipped', 'parent "/a/" was not created']]);
});

test('site creation failure -> site failed, all sections skipped, no node calls', async () => {
  const err = new Error('boom'); err.response = { status: 500, data: { message: 'internal' } };
  const neon = fakeNeon({ siteError: err });
  const report = await createSiteFromPlan(plan('A\n  B'), neon, 'sandbox');
  assert.equal(report.site.status, 'failed');
  assert.equal(report.site.error, '500: internal');
  assert.ok(report.sections.every((s) => s.status === 'skipped' && s.error === 'site was not created'));
  assert.ok(!neon.calls.some((c) => c[0] === 'node'));
  assert.deepEqual(report.counts, { created: 0, failed: 0, skipped: 2 });
});

test('root id resolution: familyRef, root.id, result.id', async () => {
  for (const [response, expected] of [[{ familyRef: 'fr-1' }, 'fr-1'], [{ root: { id: 'r-1' } }, 'r-1'], [{ result: { id: 'x-1' } }, 'x-1']]) {
    const neon = fakeNeon({ siteResponse: response });
    const report = await createSiteFromPlan(plan('A'), neon, 'sandbox');
    assert.equal(report.site.id, expected);
    assert.equal(neon.calls.find((c) => c[0] === 'node')[1].parentId, expected);
  }
});

test('root id falls back to getSites lookup after create', async () => {
  let created = false;
  const neon = fakeNeon({ siteResponse: {}, sites: () => (created ? [{ name: 'il-mio-nuovo-sito', root: { id: 'looked-up' } }] : []) });
  const origCreate = neon.createHeadlessSite;
  neon.createHeadlessSite = async (p) => { const r = await origCreate(p); created = true; return r; };
  const report = await createSiteFromPlan(plan('A'), neon, 'sandbox');
  assert.equal(report.site.id, 'looked-up');
  assert.equal(report.sections[0].status, 'created');
});

test('root id not found -> site created, sections skipped', async () => {
  const report = await createSiteFromPlan(plan('A\nB'), fakeNeon({ siteResponse: {}, sites: [] }), 'sandbox');
  assert.equal(report.site.status, 'created');
  assert.equal(report.site.error, "could not determine the new site's root node id");
  assert.ok(report.sections.every((s) => s.status === 'skipped' && s.error === "could not determine the new site's root node id"));
});

test('demoReport simulates success without Neon', () => {
  const report = demoReport(plan('A\n  B'), 'sandbox');
  assert.equal(report.site.id, 'demo-root');
  assert.deepEqual(report.sections.map((s) => [s.status, s.id]), [['created', 'demo-1'], ['created', 'demo-2']]);
  assert.deepEqual(report.counts, { created: 2, failed: 0, skipped: 0 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/neon-env/site-builder-create.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement `src/helpers/site-builder/create-site.js`**

```js
'use strict';
/**
 * Site Builder: check a plan against Neon, then create the site and its sections
 * parent-first, continuing past failures (failed section → descendants skipped).
 * Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §3
 */
const { sectionPayload } = require('./plan.js');

const SITES_LOOKUP_LIMIT = 1000;
const ROOT_ID_UNKNOWN = "could not determine the new site's root node id";

function errorMessage(error) {
  const status = error && error.response && error.response.status;
  const detail = (error && error.response && error.response.data && error.response.data.message) || (error && error.message) || String(error);
  return status ? `${status}: ${detail}` : detail;
}

function siteMatches(site, name) {
  const wanted = String(name).toLowerCase();
  return [site && site.name, site && site.siteName].some((v) => typeof v === 'string' && v.toLowerCase() === wanted);
}

async function listSites(neon) {
  const sites = await neon.getSites({ limit: SITES_LOOKUP_LIMIT });
  return Array.isArray(sites) ? sites : [];
}

async function checkPlan(plan, neon, envId) {
  if (!plan.site.name) return [];
  let sites;
  try {
    sites = await listSites(neon);
  } catch (error) {
    return [`could not check existing sites in env ${envId}: ${error.message}`];
  }
  return sites.some((s) => siteMatches(s, plan.site.name)) ? [`site "${plan.site.name}" already exists in env ${envId}`] : [];
}

function firstNonEmpty(...values) {
  return values.find((v) => typeof v === 'string' && v.length > 0) || null;
}

async function resolveRootId(created, neon, siteName) {
  const direct = firstNonEmpty(created && created.id, created && created.familyRef, created && created.root && created.root.id, created && created.result && created.result.id);
  if (direct) return direct;
  try {
    const site = (await listSites(neon)).find((s) => siteMatches(s, siteName));
    return site ? firstNonEmpty(site.id, site.root && site.root.id, site.familyRef) : null;
  } catch {
    return null;
  }
}

function baseReport(plan, envId) {
  return {
    env: envId,
    site: { status: 'failed', name: plan.site.name, title: plan.site.title, liveHostname: plan.site.liveHostname },
    sections: plan.sections.map((s) => ({ path: s.path, title: s.title, depth: s.depth, status: 'skipped' })),
    counts: { created: 0, failed: 0, skipped: 0 },
  };
}

function finalize(report) {
  for (const s of report.sections) report.counts[s.status] += 1;
  return report;
}

async function createSiteFromPlan(plan, neon, envId) {
  const report = baseReport(plan, envId);

  let created;
  try {
    created = await neon.createHeadlessSite(plan.site.payload);
  } catch (error) {
    report.site.error = errorMessage(error);
    report.sections.forEach((s) => { s.error = 'site was not created'; });
    return finalize(report);
  }
  report.site.status = 'created';

  const rootId = await resolveRootId(created, neon, plan.site.name);
  if (!rootId) {
    report.site.error = ROOT_ID_UNKNOWN;
    report.sections.forEach((s) => { s.error = ROOT_ID_UNKNOWN; });
    return finalize(report);
  }
  report.site.id = rootId;

  for (let i = 0; i < plan.sections.length; i += 1) {
    const section = plan.sections[i];
    const result = report.sections[i];
    let parentId = rootId;
    if (section.parentIndex !== null) {
      const parent = report.sections[section.parentIndex];
      if (parent.status !== 'created') {
        result.status = 'skipped';
        result.error = `parent "${parent.path}" was not created`;
        continue;
      }
      parentId = parent.id;
    }
    try {
      const node = await neon.createSiteNodeRaw(sectionPayload(section, plan.site.name, parentId));
      const id = firstNonEmpty(node && node.id, node && node.familyRef);
      if (id) {
        result.status = 'created';
        result.id = id;
      } else {
        result.status = 'failed';
        result.error = 'node created but no id returned';
      }
    } catch (error) {
      result.status = 'failed';
      result.error = errorMessage(error);
    }
  }

  return finalize(report);
}

function demoReport(plan, envId) {
  const report = baseReport(plan, envId);
  report.site.status = 'created';
  report.site.id = 'demo-root';
  report.sections.forEach((s, i) => { s.status = 'created'; s.id = `demo-${i + 1}`; });
  return finalize(report);
}

module.exports = { checkPlan, createSiteFromPlan, demoReport };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/neon-env/site-builder-create.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/site-builder/create-site.js test/neon-env/site-builder-create.test.js
git commit -m "feat(site-builder): create site and sections parent-first with per-section report"
```

---

### Task 4: HTTP endpoints (`src/requestHandlers/site-builder.js`)

**Files:**
- Create: `src/requestHandlers/site-builder.js`, `test/neon-env/site-builder-routes.test.js`
- Modify: `server.js` (route registration and services dashboard `integrations` entries)

**Interfaces:**
- **Consumes:**
  - `authenticate(request, reply)` from `src/helpers/auth.js`: `{ authenticated, apikey, role }`
  - `request.neonEnv`
  - `buildPlan` (Task 2)
  - `checkPlan`, `createSiteFromPlan`, `demoReport` (Task 3)
  - `currentClient()` from `src/helpers/neon-bo-api-v3.js`
- **Produces:**
  - `previewSiteHandler(request, reply)`
  - `createSiteHandler(request, reply)`
  - `__setClientProviderForTest(fn | null)`
  - routes `POST /api/neon/site-builder/preview` and `POST /api/neon/site-builder/create`

- [ ] **Step 1: Write the failing tests `test/neon-env/site-builder-routes.test.js`**

```js
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { buildRegistry } = require('../../src/helpers/neon-env/registry.js');
const handlers = require('../../src/requestHandlers/site-builder.js');
const { envJson, registryJson } = require('./fixtures.js');

const withSuffix = envJson('a', {
  extApiKeyLimited: 'lim-a',
  neon: { ...envJson('a').neon, fo: { url: 'https://neon-fo-a.example.com', apiKey: 'fo-a', siteHostSuffix: '-canary.neon.test:3000' } },
});
const reg = buildRegistry({ json: registryJson([withSuffix, envJson('b')]), envVars: {} });

let neon;
function fakeNeon(sites = []) {
  const calls = [];
  return {
    calls,
    async getSites(o) { calls.push(['getSites', o]); return sites; },
    async createHeadlessSite(p) { calls.push(['site', p]); return { id: 'root-1' }; },
    async createSiteNodeRaw(p) { calls.push(['node', p]); return { id: `n-${calls.length}` }; },
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('../../src/helpers/neon-env/fastify-plugin.js'), { getRegistry: () => reg });
  app.post('/api/neon/site-builder/preview', handlers.previewSiteHandler);
  app.post('/api/neon/site-builder/create', handlers.createSiteHandler);
  return app;
}

const BODY = { title: 'Il Mio Nuovo Sito', outline: 'Prima Sezione\n  Prima Sottosezione' };

beforeEach(() => {
  neon = fakeNeon();
  handlers.__setClientProviderForTest(() => neon);
});

test('401 without key, 403 with limited key', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', payload: BODY })).statusCode, 401);
  const limited = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'lim-a' }, payload: BODY });
  assert.equal(limited.statusCode, 403);
  assert.deepEqual(limited.json(), { error: 'site creation requires an admin key' });
  assert.equal(neon.calls.length, 0);
});

test('400 on a bad body', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: { title: 'x' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'body must be { title: string, outline: string }' });
});

test('preview returns the plan and runs only the name check', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    env: 'a',
    site: { name: 'il-mio-nuovo-sito', title: 'Il Mio Nuovo Sito', liveHostname: 'https://ilmionuovosito-canary.neon.test:3000' },
    sections: [
      { path: '/prima-sezione/', title: 'Prima Sezione', depth: 1, name: 'prima-sezione' },
      { path: '/prima-sezione/prima-sottosezione/', title: 'Prima Sottosezione', depth: 2, name: 'prima-sottosezione' },
    ],
    errors: [],
  });
  assert.deepEqual(neon.calls.map((c) => c[0]), ['getSites']);
});

test('preview reports a taken name; create refuses with 400 and makes no create calls', async () => {
  neon = fakeNeon([{ name: 'il-mio-nuovo-sito' }]);
  const app = await buildApp();
  const preview = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview', headers: { apikey: 'key-a' }, payload: BODY });
  assert.deepEqual(preview.json().errors, ['site "il-mio-nuovo-sito" already exists in env a']);
  const create = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(create.statusCode, 400);
  assert.deepEqual(create.json(), { errors: ['site "il-mio-nuovo-sito" already exists in env a'] });
  assert.ok(!neon.calls.some((c) => c[0] === 'site' || c[0] === 'node'));
});

test('env without siteHostSuffix -> create 400', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json().errors, ['site creation not configured for env b: neon.fo.siteHostSuffix missing']);
});

test('create runs the flow and returns the report', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 200);
  const report = res.json();
  assert.equal(report.site.status, 'created');
  assert.deepEqual(report.counts, { created: 2, failed: 0, skipped: 0 });
  assert.deepEqual(neon.calls.map((c) => c[0]), ['getSites', 'site', 'node', 'node']);
});

test('create returns 502 when the site creation fails', async () => {
  neon.createHeadlessSite = async () => { throw new Error('boom'); };
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create', headers: { apikey: 'key-a' }, payload: BODY });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().site.status, 'failed');
});

test('demo mode never calls Neon, even for an env without siteHostSuffix', async () => {
  const app = await buildApp();
  const preview = await app.inject({ method: 'POST', url: '/api/neon/site-builder/preview?demo=true', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.json().errors, []);
  assert.equal(preview.json().site.liveHostname, 'https://ilmionuovosito-demo.neon.example');
  const create = await app.inject({ method: 'POST', url: '/api/neon/site-builder/create?demo=true', headers: { apikey: 'key-b' }, payload: BODY });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().site.id, 'demo-root');
  assert.equal(neon.calls.length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/neon-env/site-builder-routes.test.js`
Expected: FAIL with `Cannot find module '../../src/requestHandlers/site-builder.js'`

- [ ] **Step 3: Implement `src/requestHandlers/site-builder.js`**

```js
'use strict';
/**
 * Site Builder endpoints: preview (no side effects) and create.
 * Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildPlan } = require('../helpers/site-builder/plan.js');
const { checkPlan, createSiteFromPlan, demoReport } = require('../helpers/site-builder/create-site.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const DEMO_SITE_HOST_SUFFIX = '-demo.neon.example';

let clientProvider = () => neonApi.currentClient();

function readRequest(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return null; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'site creation requires an admin key' }); return null; }
  const { title, outline } = request.body || {};
  if (typeof title !== 'string' || typeof outline !== 'string') {
    reply.status(400).send({ error: 'body must be { title: string, outline: string }' });
    return null;
  }
  if (!request.neonEnv) {
    reply.status(400).send({ errors: ['No Neon environment selected for this request'] });
    return null;
  }
  return { title, outline, env: request.neonEnv, demo: request.query?.demo === 'true' };
}

// Demo mode works on any env: a missing siteHostSuffix is replaced by a placeholder
function planEnv(env, demo) {
  if (!demo || env.neon?.fo?.siteHostSuffix) return env;
  return { ...env, neon: { ...env.neon, fo: { ...(env.neon?.fo || {}), siteHostSuffix: DEMO_SITE_HOST_SUFFIX } } };
}

async function planWithChecks({ title, outline, env, demo }) {
  const plan = buildPlan({ title, outline }, planEnv(env, demo));
  const errors = [...plan.errors];
  if (!demo && plan.site.name) errors.push(...await checkPlan(plan, clientProvider(), env.id));
  return { plan, errors };
}

async function previewSiteHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, errors } = await planWithChecks(req);
  return reply.status(200).send({
    env: req.env.id,
    site: { name: plan.site.name, title: plan.site.title, liveHostname: plan.site.liveHostname },
    sections: plan.sections.map(({ path, title, depth, name }) => ({ path, title, depth, name })),
    errors,
  });
}

async function createSiteHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, errors } = await planWithChecks(req);
  if (errors.length) return reply.status(400).send({ errors });
  if (req.demo) return reply.status(200).send(demoReport(plan, req.env.id));
  const report = await createSiteFromPlan(plan, clientProvider(), req.env.id);
  console.log(`[site-builder] env=${req.env.id} site=${plan.site.name} status=${report.site.status} counts=${JSON.stringify(report.counts)}`);
  return reply.status(report.site.status === 'created' ? 200 : 502).send(report);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || (() => neonApi.currentClient());
}

module.exports = { previewSiteHandler, createSiteHandler, __setClientProviderForTest };
```

In `server.js`:
- Add near the other `/api/neon/...` widget API routes (next to `fastify.get("/widgets/nss-demo", …)`):
  ```js
  // Site Builder (create a Neon site from a section outline)
  const siteBuilderHandlers = require("./src/requestHandlers/site-builder.js");
  fastify.post("/api/neon/site-builder/preview", siteBuilderHandlers.previewSiteHandler);
  fastify.post("/api/neon/site-builder/create", siteBuilderHandlers.createSiteHandler);
  ```
- In the services dashboard `integrations` object, in its `utilities` array (or the closest existing API section), add:
  ```js
      { name: "Site Builder Preview", endpoint: "POST /api/neon/site-builder/preview", description: "Plan a headless Neon site from { title, outline } without creating anything (admin key; ?demo=true supported)" },
      { name: "Site Builder Create", endpoint: "POST /api/neon/site-builder/create", description: "Create a headless Neon site and its section hierarchy from { title, outline } (admin key; ?demo=true supported)" },
  ```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/neon-env/site-builder-routes.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/requestHandlers/site-builder.js test/neon-env/site-builder-routes.test.js server.js
git commit -m "feat(site-builder): preview and create endpoints (admin only, demo mode)"
```

---

### Task 5: Site Builder React widget

**Follow the repo's React widget workflow:** read `~/.claude/skills/neon-react-widget/SKILL.md` first. It is the reference for the HBS shell (dual asset paths, design-system CSS, `window.CONFIG`, the double-mount guard), the handler in `widgets.js`, the services dashboard entry, and the build. Use a dedicated Vite config, like `nss-demo`.

**Files:**
- Create:
  - `src/react-widgets/vite.site-builder.config.js`
  - `src/react-widgets/src/site-builder/main.jsx`
  - `src/react-widgets/src/site-builder/api.js`
  - `src/react-widgets/src/site-builder/SiteBuilderWidget.jsx`
  - `src/react-widgets/src/site-builder/site-builder.css`
  - `src/widgets/site-builder.hbs`
  - `public/js/react/site-builder.js` and `.css` (build output, committed)
- Modify: `src/react-widgets/package.json`, `src/requestHandlers/widgets.js`, `server.js`, `README.md`

**Interfaces:**
- **Consumes:** `POST /api/neon/site-builder/preview|create` with body `{ title, outline }`, and the response shapes from Task 4.
- `window.CONFIG = { apiKey, demo, neonEnv }`.

- [ ] **Step 1: Build config and script**

`src/react-widgets/vite.site-builder.config.js`: copy `vite.nss-demo.config.js` verbatim, with `const WIDGET = 'site-builder'` and `name: 'SiteBuilderWidget'`.

`src/react-widgets/package.json` scripts: add `"build:site-builder": "vite build --config vite.site-builder.config.js"`.

- [ ] **Step 2: `src/react-widgets/src/site-builder/api.js`**

```js
function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';

async function post(path, body) {
  const demo = window.CONFIG?.demo ? '?demo=true' : '';
  const response = await fetch(`${BASE_URL}/api/neon/site-builder/${path}${demo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: window.CONFIG?.apiKey ?? '' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export const previewSite = (title, outline) => post('preview', { title, outline });
export const createSite = (title, outline) => post('create', { title, outline });
```

- [ ] **Step 3: `src/react-widgets/src/site-builder/SiteBuilderWidget.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { previewSite, createSite } from './api.js';

const PLACEHOLDER = 'Prima Sezione\n  Prima Sottosezione\nSeconda Sezione';
const STATUS_LABEL = { created: 'Created', failed: 'Failed', skipped: 'Skipped' };

export default function SiteBuilderWidget() {
  const envLabel = window.CONFIG?.neonEnv?.label || window.CONFIG?.neonEnv?.id || 'current environment';
  const [title, setTitle] = useState('');
  const [outline, setOutline] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!title.trim()) { setPreview(null); setPreviewError(null); return undefined; }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { status, data } = await previewSite(title, outline);
        if (seq !== requestSeq.current) return;
        if (status === 200) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data.error || (data.errors || []).join('; ') || `Preview failed (${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, outline]);

  function onOutlineKeyDown(e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.target;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${outline.slice(0, start)}  ${outline.slice(end)}`;
    setOutline(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
  }

  const errors = preview?.errors || [];
  const canCreate = !!title.trim() && !!preview && errors.length === 0 && !loading && !creating;

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create site "${preview.site.title}" in ${envLabel}?`)) return;
    setCreating(true);
    setReport(null);
    try {
      const { status, data } = await createSite(title, outline);
      if (status === 400) setReport({ errors: data.errors || [data.error] });
      else setReport(data);
    } catch (e) {
      setReport({ errors: [e.message] });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="sbw">
      <header className="sbw-header">
        <h1>Site Builder</h1>
        <span className="sbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>

      <div className="sbw-body">
        <section className="sbw-form">
          <label className="sbw-label" htmlFor="sbw-title">Site title</label>
          <input id="sbw-title" className="sbw-input" value={title} placeholder="Il Mio Nuovo Sito"
            onChange={(e) => { setTitle(e.target.value); setReport(null); }} />

          <label className="sbw-label" htmlFor="sbw-outline">Sections (one per line, indent to nest)</label>
          <textarea id="sbw-outline" className="sbw-outline" value={outline} placeholder={PLACEHOLDER} spellCheck={false}
            onChange={(e) => { setOutline(e.target.value); setReport(null); }} onKeyDown={onOutlineKeyDown} />

          <button type="button" className="sbw-button" disabled={!canCreate} onClick={onCreate}>
            {creating ? 'Creating…' : 'Create site'}
          </button>
        </section>

        <section className="sbw-preview" aria-live="polite">
          <h2>Preview {loading && <span className="sbw-muted">updating…</span>}</h2>
          {previewError && <p className="sbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="sbw-muted">Type a site title to see the preview.</p>}
          {preview && (
            <>
              <dl className="sbw-site">
                <dt>Name</dt><dd><code>{preview.site.name || '—'}</code></dd>
                <dt>Live hostname</dt><dd><code>{preview.site.liveHostname || '—'}</code></dd>
              </dl>
              {errors.length > 0 && (
                <ul className="sbw-errors">{errors.map((err) => <li key={err}>{err}</li>)}</ul>
              )}
              <ul className="sbw-tree">
                {preview.sections.map((s) => (
                  <li key={s.path} style={{ paddingLeft: `${(s.depth - 1) * 20}px` }}>
                    <span className="sbw-node-title">{s.title}</span> <code className="sbw-muted">{s.path}</code>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report && (
            <div className="sbw-report">
              <h2>Result</h2>
              {report.errors ? (
                <ul className="sbw-errors">{report.errors.map((err) => <li key={err}>{err}</li>)}</ul>
              ) : (
                <>
                  <p>
                    Site <code>{report.site.name}</code>: <span className={`sbw-badge sbw-${report.site.status}`}>{STATUS_LABEL[report.site.status] || report.site.status}</span>
                    {report.site.id && <> — id <code>{report.site.id}</code></>}
                    {report.site.error && <span className="sbw-error"> {report.site.error}</span>}
                  </p>
                  <p className="sbw-muted">{report.counts.created} created · {report.counts.failed} failed · {report.counts.skipped} skipped</p>
                  <ul className="sbw-tree">
                    {report.sections.map((s) => (
                      <li key={s.path} style={{ paddingLeft: `${(s.depth - 1) * 20}px` }}>
                        <span className={`sbw-badge sbw-${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.title} <code className="sbw-muted">{s.path}</code>
                        {s.error && <span className="sbw-error"> {s.error}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `src/react-widgets/src/site-builder/main.jsx` and `site-builder.css`**

`main.jsx`:
```jsx
import { createRoot } from 'react-dom/client';
import SiteBuilderWidget from './SiteBuilderWidget.jsx';
import './site-builder.css';

const container = document.getElementById('root');
if (container && !container._reactRoot) {
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<SiteBuilderWidget />);
}
```

`site-builder.css`: use the Neon design tokens from `public/css/neon-design-system.css`, following the token guidance in the skill (Source Sans 3, the theme color for the primary button, neutral surfaces, 4/8 px spacing). Style:
- the classes used in the JSX: `sbw`, `sbw-header`, `sbw-env`, `sbw-body`, `sbw-form`, `sbw-label`, `sbw-input`, `sbw-outline`, `sbw-button`, `sbw-preview`, `sbw-site`, `sbw-tree`, `sbw-node-title`, `sbw-errors`, `sbw-error`, `sbw-muted`, `sbw-report`, `sbw-badge`, `sbw-created`, `sbw-failed`, `sbw-skipped`;
- a two-column layout (form | preview) that stacks under 720px;
- a monospace textarea, min-height 280px;
- badges: green for created, red for failed, grey for skipped;
- the disabled button visibly dimmed.

- [ ] **Step 5: HBS shell, page handler, routes, dashboard**

`src/widgets/site-builder.hbs`: follow the skill's HBS shell exactly (design-system CSS plus `site-builder.css` with dual paths, `#root`, and the dual-path `site-builder.js`), with:
```html
  <script>
    window.CONFIG = {
      apiKey: '{{{apiKey}}}',
      demo: {{demo}},
      neonEnv: {{{neonEnvJson}}}
    };
  </script>
```

`src/requestHandlers/widgets.js`: add and export the handler:
```js
function siteBuilderWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const neonEnvInfo = request.neonEnv ? { id: request.neonEnv.id, label: request.neonEnv.label, boHost: request.neonEnv.neon.bo.host } : null;
  return reply.view("/src/widgets/site-builder.hbs", {
    seo: { title: "Site Builder — create a Neon site", description: "Create a headless Neon site and its sections from an outline" },
    apiKey: auth.apikey,
    demo: request.query.demo === 'true',
    neonEnvJson: JSON.stringify(neonEnvInfo).replace(/</g, '\\u003c'),
  });
}
```

`server.js`:
- Add `fastify.get("/widgets/site-builder", widgetHandlers.siteBuilderWidgetHandler);` next to the nss-demo route.
- Add a `widgets` dashboard entry: `{ name: "Site Builder", endpoint: "GET /widgets/site-builder", demoUrl: "/widgets/site-builder?demo=true", description: "Create a headless Neon site and its section hierarchy from an indented outline (admin key; demo mode simulates creation)" }`.

`README.md`: add a short "Site Builder" subsection covering:
- the widget URL and the two endpoints;
- that `neon.fo.siteHostSuffix` is required per env, with the hostname rule;
- that it's admin only;
- that nothing is published;
- the partial-failure behavior.

- [ ] **Step 6: Build and verify**

```bash
cd src/react-widgets && npm install && npm run build:site-builder && cd ../..
ls -l public/js/react/site-builder.js public/js/react/site-builder.css
npm test
```
Expected: both bundle files exist, and the tests pass.

Smoke test in legacy mode, using demo mode. Move the registry aside first and restore it after. Never print it.
```bash
mv config/neon-environments.json /tmp/sb-registry-backup.json 2>/dev/null
NEON_EXT_APIKEY=test-admin PORT=3999 node server.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3999/widgets/site-builder?demo=true&apikey=test-admin"   # expect 200
curl -s -X POST "http://localhost:3999/api/neon/site-builder/create?demo=true" -H "apikey: test-admin" -H "Content-Type: application/json" \
  -d '{"title":"Il Mio Nuovo Sito","outline":"Prima Sezione\n  Prima Sottosezione"}'   # expect site.id demo-root, 2 created
kill %1; mv /tmp/sb-registry-backup.json config/neon-environments.json 2>/dev/null
lsof -iTCP -sTCP:LISTEN -P | grep node   # expect nothing
```

- [ ] **Step 7: Commit**

```bash
git add src/react-widgets/vite.site-builder.config.js src/react-widgets/package.json src/react-widgets/src/site-builder src/widgets/site-builder.hbs src/requestHandlers/widgets.js server.js README.md public/js/react/site-builder.js public/js/react/site-builder.css
git commit -m "feat(site-builder): React Site Builder widget with live preview and per-section report"
```

---

## After implementation (manual)

1. Add `neon.fo.siteHostSuffix` to the envs that should allow site creation, in the local `config/neon-environments.json` and the Render Secret File. For the sandbox: `-canary.neon.test:3000`.
2. On the sandbox, create a small two-level site with the widget. Check it in Neon: headless type, nesting, ids. This confirms where the create response puts the root node id.
