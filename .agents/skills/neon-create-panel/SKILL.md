---
name: neon-create-panel
description: "Create a new panel for the neon-integrations-example project. Panels are iframe-embedded UI tools that appear inside the Neon CMS object editor (e.g. alongside an article). Use when the user asks to 'create a panel', 'add a panel', 'build a new panel', 'new CMS panel', 'embed a panel', or describes a UI to be embedded inside Neon as a side panel. Triggers on: 'create panel', 'new panel', 'add panel', 'build panel', 'CMS panel', 'embedded panel', 'iframe panel'."
---

# Create a Neon Panel

Panels are iframe-embedded HTML pages that live inside the Neon CMS object editor. They differ from widgets in one key way: they must work both standalone (direct URL access) and embedded (served through a `/neon/api/demo-integration` proxy). This is handled automatically by `panel-api-helper.js`, but requires dual-loading all static assets in the HTML head.

Adding a panel requires changes to **3 files** (4 if a backend API proxy is needed).

## Step 1 — Gather requirements

Ask the user (or infer from context):
- Panel **name** (used for route slug, handler name, file name, catalog entry)
- Panel **purpose** — what does it show/do inside the CMS?
- Does it need to call an **external API**? (Requires a proxy handler)
- Does it need the **Neon object context** (article ID, metadata)? (Received via query param or PostMessage)
- Any **environment variables** to pass (API keys, `NEON_APP_URL`, etc.)?
- Does it need a **maintenance mode** fallback?

## Step 2 — Create the `.hbs` template

**File:** `src/panels/<name>-panel.hbs`

### Head — always dual-load assets

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel Name</title>
    <script src="/js/panel-api-helper.js"></script>
    <script src="/neon/api/demo-integration/js/panel-api-helper.js"></script>
    <link rel="stylesheet" href="/css/tailwind-panels.css">
    <link rel="stylesheet" href="/neon/api/demo-integration/css/tailwind-panels.css">
    <link rel="stylesheet" href="/css/panels/<name>.css">
    <link rel="stylesheet" href="/neon/api/demo-integration/css/panels/<name>.css">
    <style>
        /* inline panel CSS */
    </style>
</head>
```

Both paths are intentional. When embedded, Neon routes requests through `/neon/api/demo-integration`; one path fails silently, the other succeeds. `panel-api-helper.js` also auto-fixes `<script src>`, `<link href>`, and `<img src>` after DOMContentLoaded.

### API calls — always use `PanelAPI.apiCallJson`

```javascript
// GET
const data = await PanelAPI.apiCallJson('/panels/<name>/api/resource');

// POST
const result = await PanelAPI.apiCallJson('/panels/<name>/api/resource', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

`PanelAPI` is defined by `panel-api-helper.js`. It prepends the `/neon/api/demo-integration` prefix automatically when embedded. Never use `fetch()` directly.

### Receiving Neon object context

**Option A — Query param** (simpler, when Neon passes context in the URL):
```javascript
const params = new URLSearchParams(window.location.search);
const objectId = params.get('objectId');
const externalRef = params.get('externalRef');
```

**Option B — PostMessage** (when Neon pushes context after the iframe loads):
```javascript
window.addEventListener('message', (event) => {
    if (event.data?.key === 'getInfo') {
        const neonContext = event.data.info;
        const familyRef = neonContext?.originalNode?.familyRef;
        initWithContext(familyRef);
    }
});
// Signal readiness to parent
window.parent.postMessage({ type: 'panel-ready', info: { op: 'getInfo' } }, '*');
```

### Accessing handler params in the template

Handler params are available as Handlebars expressions (use triple braces for unescaped values):

```javascript
const apiKey = '{{{apiKey}}}';
const neonAppUrl = '{{neonAppUrl}}';
```

See `references/panel-patterns.md` for the full boilerplate and UI patterns.

## Step 3 — Add handler(s) to `src/requestHandlers/panels.js`

### UI handler (always required)

Insert before `module.exports`:

```javascript
function <camelCaseName>PanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Optional maintenance mode check
  if (shouldShowMaintenance(request, auth, '<name>')) {
    return reply.view("/src/panels/maintenance-panel.hbs", {
      seo: seo,
      panelName: "<Display Name>",
      isDemoMode: request.query.demo === 'maintenance'
    });
  }

  let params = {
    seo: seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL
    // add service-specific env vars as needed
  };
  return reply.view("/src/panels/<name>-panel.hbs", params);
}
```

### API proxy handler (only if the panel calls an external API)

```javascript
async function <camelCaseName>ApiProxyHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const endpoint = request.url.replace('/panels/<name>/api/', '');
  const method = request.method.toLowerCase();

  try {
    const baseUrl = 'https://api.external-service.com';
    const url = `${baseUrl}/${endpoint}`;
    const config = {
      headers: {
        'Authorization': `Bearer ${process.env.SERVICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: request.query
    };

    let response;
    if (method === 'get')    response = await axios.get(url, config);
    if (method === 'post')   response = await axios.post(url, request.body, config);
    if (method === 'put')    response = await axios.put(url, request.body, config);
    if (method === 'delete') response = await axios.delete(url, config);

    return reply.send(response.data);
  } catch (error) {
    console.error('[<Name> API] Error:', error);
    return reply.status(error.response?.status || 500).send({
      error: 'API request failed',
      details: error.response?.data || error.message
    });
  }
}
```

Add all new handler names to the `module.exports` object at the bottom of the file.

## Step 4 — Register routes in `server.js`

**UI route** — add after the last `fastify.get("/panels/…")` line (currently after `social-media`):

```javascript
fastify.get("/panels/<name>", panelHandlers.<camelCaseName>PanelHandler);
```

**API proxy route** — only if a proxy handler was created. Must use `fastify.register()`:

```javascript
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/<name>/api/*',
    handler: panelHandlers.<camelCaseName>ApiProxyHandler
  });
});
```

**Catalog entries** — add to the `integrations.panels` array (around line 133):

```javascript
{ name: "<Display Name> Panel", endpoint: "GET /panels/<name>", demoUrl: "/panels/<name>", description: "<description>" },
// If proxy:
{ name: "<Display Name> API Proxy", endpoint: "ALL /panels/<name>/api/*", description: "Proxy for <service> API calls with authentication" },
```

## Step 5 — Verify

1. `npm run dev`
2. Open `http://localhost:3000/panels/<name>?apikey=<key>` (standalone)
3. Open in an iframe (embedded mode) and confirm API calls use the `/neon/api/demo-integration` prefix
4. Check `GET /services` → panel appears in the `panels` catalog array
