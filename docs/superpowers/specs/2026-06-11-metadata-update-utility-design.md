# Metadata Update Utility — Design

## Goal

Add v3 Neon BO API wrappers for object metadata (GET/PUT), and a utility
endpoint that applies a list of xpath-based set/unset changes to a node's
metadata XML in one call. Intended to be called from the Neon Grid and Print
Query Board widgets to edit metadata fields (e.g. SEO title, print section)
without the caller needing to handle XML themselves.

## Scope

- Single `familyRef` per call (no bulk).
- `set` / `unset` operations only, addressed by XPath into the
  `ObjectMetadata` XML returned by Neon BO.
- `unset` clears the text content of the matched element; it does not remove
  the element node (keeps XML schema/DTD-valid, matches the always-present
  empty-element skeleton Neon returns).
- An XPath that matches no node is skipped with a logged warning — it does
  not fail the whole request (other changes still applied and saved).
- An XPath that matches multiple nodes applies to the first match only.

## 1. neon-bo-api-v3.js

Add to `NeonClient`:

```js
async getNodeMetadata(familyRef) {
    return await this.makeRequest({
        method: 'get',
        url: `/contents/nodes/${familyRef}/metadata`,
        headers: { 'Accept': 'text/xml' }
    }, `Node metadata for ${familyRef} retrieved`, true);
}
```

`updateNodeMetadata(familyRef, xmlBodyString)` already exists (PUT
`/contents/nodes/{familyRef}/metadata`, `Content-Type: application/xml`).

Export `getNodeMetadata` flat alongside the existing flat exports.

## 2. New helper: src/helpers/metadata-xpath-utils.js

New deps: `@xmldom/xmldom`, `xpath`.

```js
function applyMetadataChanges(xmlString, changes)
// changes: [{ xpath: string, action: 'set' | 'unset', value?: string }]
// returns: updated XML string
```

Behavior:
- Parse `xmlString` with `@xmldom/xmldom` `DOMParser` (preserves DOCTYPE).
- For each change, run `xpath.select(change.xpath, doc)`.
  - No match: `console.warn` and continue.
  - Match: take first node.
    - `set`: set node's text content to `change.value` (string; coerce
      `null`/`undefined` to `''`).
    - `unset`: set node's text content to `''`.
- Serialize the mutated DOM back to a string with `XMLSerializer` and return
  it.

## 3. New handler: src/requestHandlers/metadata.js

`POST /utilities/metadata/update`

Request body:
```json
{
  "familyRef": "02a6-...-1000",
  "changes": [
    { "xpath": "/ObjectMetadata/SEO/SEOTitle", "action": "set", "value": "New title" },
    { "xpath": "/ObjectMetadata/SEO/MetaDescription", "action": "unset" }
  ]
}
```

Flow:
1. `authenticate(request, reply)` — same pattern as other utility handlers.
2. Validate `familyRef` present and `changes` is a non-empty array; 400 if
   not.
3. `xml = await neonBoApi.getNodeMetadata(familyRef)`
4. `updatedXml = applyMetadataChanges(xml, changes)`
5. `success = await neonBoApi.updateNodeMetadata(familyRef, updatedXml)`
6. Reply `{ success, familyRef }` (200), or 502 if `success` is false.

Errors from `getNodeMetadata` (e.g. node not found) propagate as 502 with
the error message, matching existing handler error-handling style in
`utilities.js`.

## 4. server.js wiring

- `const metadataHandlers = require("./src/requestHandlers/metadata.js");`
- `fastify.post("/utilities/metadata/update", metadataHandlers.updateMetadataHandler);`
- Add to `/utilities/services` discovery list:
  `{ name: "Metadata Update", endpoint: "POST /utilities/metadata/update", description: "Apply xpath-based set/unset changes to a node's ObjectMetadata XML" }`

## Out of scope (future)

- Bulk familyRefs.
- Operations beyond set/unset (inc, push, pull — mirrors
  `methode-metadata-utils.js` operators but not needed here yet).
- Wiring actual UI buttons in Grid / Print Query Board to call this endpoint
  — this spec only covers the backend utility.
