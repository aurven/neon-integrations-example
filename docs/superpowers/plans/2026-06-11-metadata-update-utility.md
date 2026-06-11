# Metadata Update Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a v3 Neon BO `getNodeMetadata` API wrapper, an xpath-based set/unset XML editor helper, and a `POST /utilities/metadata/update` endpoint that fetches a node's `ObjectMetadata` XML, applies the requested changes, and saves it back via the existing `updateNodeMetadata` PUT.

**Architecture:** New helper `src/helpers/metadata-xpath-utils.js` does pure XML mutation via `@xmldom/xmldom` + `xpath`. New handler `src/requestHandlers/metadata.js` wires `neon-bo-api-v3.getNodeMetadata` → `applyMetadataChanges` → `neon-bo-api-v3.updateNodeMetadata`. Registered in `server.js` as `POST /utilities/metadata/update`.

**Tech Stack:** Node.js, Fastify, `@xmldom/xmldom`, `xpath`, `node:test` + `node:assert/strict`.

---

### Task 1: Add XML/XPath dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @xmldom/xmldom xpath
```

Expected: `package.json` `dependencies` gains `@xmldom/xmldom` and `xpath` entries, `package-lock.json` updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @xmldom/xmldom and xpath for metadata xpath editing"
```

---

### Task 2: `applyMetadataChanges` helper + tests

**Files:**
- Create: `src/helpers/metadata-xpath-utils.js`
- Test: `test/metadata-xpath-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/metadata-xpath-utils.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { applyMetadataChanges } = require('../src/helpers/metadata-xpath-utils.js');

const SAMPLE_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">` +
  `<ObjectMetadata>` +
  `<General><Keywords/><Keyword>first</Keyword><Keyword>second</Keyword></General>` +
  `<SEO><SEOTitle>Old title</SEOTitle><MetaDescription>Old description</MetaDescription></SEO>` +
  `</ObjectMetadata>`;

test('set replaces an empty element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/General/Keywords', action: 'set', value: 'space, science' }
  ]);
  assert.ok(result.includes('<Keywords>space, science</Keywords>'));
});

test('set replaces an existing element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'New title' }
  ]);
  assert.ok(result.includes('<SEOTitle>New title</SEOTitle>'));
  assert.ok(!result.includes('Old title'));
});

test('unset clears an element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/MetaDescription', action: 'unset' }
  ]);
  assert.ok(result.includes('<MetaDescription/>') || result.includes('<MetaDescription></MetaDescription>'));
  assert.ok(!result.includes('Old description'));
});

test('an xpath matching nothing is skipped without throwing', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/DoesNotExist', action: 'set', value: 'x' },
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'New title' }
  ]);
  assert.ok(result.includes('<SEOTitle>New title</SEOTitle>'));
  assert.ok(!result.includes('DoesNotExist'));
});

test('an xpath matching multiple nodes only changes the first', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/General/Keyword', action: 'set', value: 'changed' }
  ]);
  assert.ok(result.includes('<Keyword>changed</Keyword>'));
  assert.ok(result.includes('<Keyword>second</Keyword>'));
});

test('values are XML-escaped and DOCTYPE is preserved', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'A & <B>' }
  ]);
  assert.ok(result.includes('<SEOTitle>A &amp; &lt;B&gt;</SEOTitle>'));
  assert.ok(result.includes('<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/metadata-xpath-utils.test.js`
Expected: FAIL — `Cannot find module '../src/helpers/metadata-xpath-utils.js'`

- [ ] **Step 3: Write the implementation**

Create `src/helpers/metadata-xpath-utils.js`:

```js
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const xpath = require('xpath');

/**
 * Apply a list of xpath-based set/unset changes to an ObjectMetadata XML
 * string and return the updated XML string.
 *
 * changes: [{ xpath: string, action: 'set' | 'unset', value?: string }]
 *
 * - 'set' replaces the matched element's text content with `value`.
 * - 'unset' clears the matched element's text content.
 * - An xpath matching no node is skipped (logged as a warning).
 * - An xpath matching multiple nodes applies to the first match only.
 */
function applyMetadataChanges(xmlString, changes) {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

    for (const change of changes) {
        const nodes = xpath.select(change.xpath, doc);

        if (!nodes || nodes.length === 0) {
            console.warn(`⚠️ applyMetadataChanges: xpath matched no node, skipping: ${change.xpath}`);
            continue;
        }

        const node = nodes[0];
        const value = change.action === 'unset' ? '' : (change.value ?? '');
        setNodeText(node, value);
    }

    return new XMLSerializer().serializeToString(doc);
}

function setNodeText(node, value) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    if (value !== '') {
        node.appendChild(node.ownerDocument.createTextNode(value));
    }
}

module.exports = {
    applyMetadataChanges
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/metadata-xpath-utils.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/metadata-xpath-utils.js test/metadata-xpath-utils.test.js
git commit -m "feat: add applyMetadataChanges xpath set/unset helper for ObjectMetadata XML"
```

---

### Task 3: `getNodeMetadata` in neon-bo-api-v3

**Files:**
- Modify: `src/helpers/neon-bo-api-v3.js`

- [ ] **Step 1: Add `getNodeMetadata` to `NeonClient`**

In `src/helpers/neon-bo-api-v3.js`, add this method to the `NeonClient` class, directly after `getNode` (after line 104):

```js
    async getNodeMetadata(familyRef) {
        return await this.makeRequest({
            method: 'get',
            url: `/contents/nodes/${familyRef}/metadata`,
            headers: {
                'Accept': 'text/xml'
            }
        }, `Node metadata for ${familyRef} retrieved`, true);
    }
```

- [ ] **Step 2: Export it flat**

In the `module.exports` block at the bottom of `src/helpers/neon-bo-api-v3.js`, add a line right after `getNode`:

```js
    getNodeMetadata: (familyRef) => defaultClient.getNodeMetadata(familyRef),
```

- [ ] **Step 3: Sanity-check the file loads**

Run: `node -e "require('./src/helpers/neon-bo-api-v3.js'); console.log('ok')"`
Expected: prints `ok` (no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/helpers/neon-bo-api-v3.js
git commit -m "feat: add getNodeMetadata to neon-bo-api-v3"
```

---

### Task 4: `updateMetadataHandler` request handler

**Files:**
- Create: `src/requestHandlers/metadata.js`

- [ ] **Step 1: Write the handler**

Create `src/requestHandlers/metadata.js`. This follows the same logging/auth pattern as `src/requestHandlers/utilities.js`:

```js
const neon = require('../helpers/neon-bo-api-v3.js');
const { applyMetadataChanges } = require('../helpers/metadata-xpath-utils.js');
const { authenticate } = require('../helpers/auth.js');
const { safeLogRequest } = require('../helpers/utils.js');

/**
 * POST /utilities/metadata/update
 * Body: { familyRef: string, changes: [{ xpath, action: 'set'|'unset', value? }] }
 *
 * Fetches the node's ObjectMetadata XML, applies the requested xpath
 * set/unset changes, and saves it back to Neon.
 */
async function updateMetadataHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("updateMetadataHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { familyRef, changes } = request.body || {};

  console.log("updateMetadataHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!familyRef) {
    console.error("updateMetadataHandler << ERROR: familyRef is required");
    return reply.status(400).send({ error: "familyRef is required" });
  }

  if (!Array.isArray(changes) || changes.length === 0) {
    console.error("updateMetadataHandler << ERROR: changes must be a non-empty array");
    return reply.status(400).send({ error: "changes must be a non-empty array" });
  }

  try {
    const xml = await neon.getNodeMetadata(familyRef);
    const updatedXml = applyMetadataChanges(xml, changes);
    const success = await neon.updateNodeMetadata(familyRef, updatedXml);

    if (!success) {
      console.error("updateMetadataHandler << ERROR: updateNodeMetadata returned falsy");
      return reply.status(502).send({ error: "Failed to update node metadata" });
    }

    const result = { success: true, familyRef };
    console.log("updateMetadataHandler << OUT:");
    console.log("Response Data:", result);
    return reply.status(200).send(result);
  } catch (error) {
    console.error("updateMetadataHandler << ERROR:", error.message);
    return reply.status(502).send({ error: error.message });
  }
}

module.exports = {
  updateMetadataHandler
};
```

- [ ] **Step 2: Sanity-check the file loads**

Run: `node -e "require('./src/requestHandlers/metadata.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/requestHandlers/metadata.js
git commit -m "feat: add updateMetadataHandler for xpath-based ObjectMetadata edits"
```

---

### Task 5: Wire route into server.js + services list

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Register the handler module and route**

In `server.js`, find the Utilities section (around line 219-223):

```js
// Utilities
const utilitiesHandlers = require("./src/requestHandlers/utilities.js");
fastify.post("/utilities/cleanup", utilitiesHandlers.cleanupHandler);
fastify.post("/ai/openai", utilitiesHandlers.openAiHandler);
fastify.get("/sources/pexels", utilitiesHandlers.pexelsPhotosHandler);
fastify.get("/utilities/services", utilitiesHandlers.neonDiscoveryHandler);
```

Add directly below it:

```js

// Metadata
const metadataHandlers = require("./src/requestHandlers/metadata.js");
fastify.post("/utilities/metadata/update", metadataHandlers.updateMetadataHandler);
```

- [ ] **Step 2: Add to the `/services` discovery list**

In `server.js`, find the `utilities` array inside the `fastify.get("/services", ...)` handler (around line 113-118):

```js
    utilities: [
      { name: "Content Cleanup", endpoint: "POST /utilities/cleanup", description: "Clean up content references" },
      { name: "OpenAI Processing", endpoint: "POST /ai/openai", description: "Process content with OpenAI" },
      { name: "Pexels Photos", endpoint: "GET /sources/pexels", description: "Source photos from Pexels API" },
      { name: "Neon Discovery", endpoint: "GET /utilities/services", description: "Discover Neon services" },
      { name: "Metrics Reports", endpoint: "GET /neon/api/core/metrics", description: "List available Neon BO analytics reports" },
      { name: "Metrics Data", endpoint: "GET /neon/api/core/metrics/*", description: "Get specific metrics data from Neon BO (supports path-style reportId)" }
    ],
```

Add an entry after "Content Cleanup":

```js
      { name: "Metadata Update", endpoint: "POST /utilities/metadata/update", description: "Apply xpath-based set/unset changes to a node's ObjectMetadata XML (familyRef, changes[])" },
```

- [ ] **Step 3: Verify server boots**

Run: `node -e "require('./server.js')" &
sleep 2
curl -s http://localhost:3000/services | grep -o '"Metadata Update"'
kill %1`

Expected: prints `"Metadata Update"`, server starts without throwing.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: register POST /utilities/metadata/update route"
```

---

### Task 6: Add new test file to npm test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `test/metadata-xpath-utils.test.js` to the `test` script**

In `package.json`, update the `"test"` script (line 12) to append the new test file:

```json
    "test": "node --test test/connectors/twitter-connector.test.js test/connectors/facebook-connector.test.js test/connectors/instagram-connector.test.js test/connectors/threads-connector.test.js test/connectors/connector-registry.test.js test/delayed-importer.test.js test/images-importer-metadata.test.js test/metadata-xpath-utils.test.js"
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the 6 new `metadata-xpath-utils` tests.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test: include metadata-xpath-utils tests in npm test"
```

---

## Self-Review Notes

- Spec coverage: GET/PUT v3 wrappers (Task 3, PUT already existed), xpath set/unset helper (Task 2), single-familyRef utility endpoint (Task 4-5), server wiring + discovery listing (Task 5), new deps (Task 1). Bulk familyRefs and non-set/unset operators explicitly out of scope per spec.
- No placeholders — all code blocks are complete and runnable.
- Type/signature consistency: `applyMetadataChanges(xmlString, changes)` used identically in Task 2 (definition) and Task 4 (handler). `getNodeMetadata(familyRef)` / `updateNodeMetadata(familyRef, xmlBodyString)` match existing `NeonClient` method signatures.
