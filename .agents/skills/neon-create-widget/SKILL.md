---
name: neon-create-widget
description: "Create a new widget for the neon-integrations-example project. Use when the user asks to 'create a widget', 'add a widget', 'build a new widget', or describes a new UI tool to embed in the CMS dashboard. Triggers on: 'create widget', 'new widget', 'add widget', 'build widget', 'widget for'."
---

# Create a Neon Widget

Widgets are self-contained Handlebars pages served by Fastify. Each widget lives in a `.hbs` file containing necessary JS that needs to live in the Handlebars template (interactions with panelApis, etc.) and CSS and JS in separate files inside the public directory. Adding one requires changes to **3 files**.

## Step 1 — Gather requirements

Ask the user (or infer from context):
- Widget **name** (used for route slug, handler name, file name, and catalog entry)
- Widget **purpose** — what does it do and display?
- Any **Neon API data** needed (articles, workflow tasks, users…)?
- Any **environment variables** to pass (e.g. `NEON_APP_URL`)?

## Step 2 — Create the `.hbs` template

**File:** `src/widgets/<name>.hbs`

Use the head pattern below exactly (dual-path assets for embedded vs. standalone serving):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{seo.title}}</title>
    <script src="/js/panel-api-helper.js"></script>
    <script src="/neon/api/demo-integration/js/panel-api-helper.js"></script>
    <link rel="stylesheet" href="/css/tailwind-panels.css">
    <link rel="stylesheet" href="/neon/api/demo-integration/css/tailwind-panels.css">
    <link rel="stylesheet" href="/css/widgets/<name>.css">
    <link rel="stylesheet" href="/neon/api/demo-integration/css/widgets/<name>.css">
    <style>
        /* inline CSS */
    </style>
</head>
<body>
    <!-- HTML structure -->
    <script>
        // vanilla JS
    </script>
    <script src="/js/widgets/<name>.js"></script>
    <script src="/neon/api/demo-integration/js/widgets/<name>.js"></script>
</body>
</html>
```

**CSS conventions:**
- CSS custom properties in `:root` — use `--bg: #F6F3F6`, `--card: #FFFFFF`, `--accent: #2847E2`, `--text-primary: #3F3C4E`
- Prefix all widget-specific classes with a short widget abbreviation (e.g. `.pb-` for Planning Board)
- Separate sections with `/* ── Section Name ───── */` comments

**JS conventions:**
- No frontend frameworks — plain vanilla JS
- Organise with `// ===== SECTION NAME =====` block comments
- State lives in a single `const state = { ... }` object
- `PanelAPI.apiCallJson(path, options)` for all backend HTTP calls (wraps fetch with auth cookies)
- `esc(str)` utility for XSS-safe HTML escaping — always define it
- Init with `document.addEventListener('DOMContentLoaded', () => { ... })`
- Toast pattern: `showToast(message, type)` — auto-removes after 3 s

See `references/widget-patterns.md` for full boilerplate and UI patterns.

## Step 3 — Add the handler to `src/requestHandlers/widgets.js`

Insert **before** `module.exports`:

```javascript
function <camelCaseName>WidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "<Widget Display Name>",
      description: "<One-line description>"
    },
    neonAppUrl: process.env.NEON_APP_URL   // include if widget opens articles
  };
  return reply.view("/src/widgets/<name>.hbs", params);
}
```

Then add the handler name to the `module.exports` object at the bottom of the file.

## Step 4 — Register the route and catalog entry in `server.js`

**Route** — add after the last `fastify.get("/widgets/…")` line (currently after `planning-board`):

```javascript
fastify.get("/widgets/<name>", widgetHandlers.<camelCaseName>WidgetHandler);
```

**Catalog entry** — add to the `integrations.widgets` array (around line 129):

```javascript
{ name: "<Display Name>", endpoint: "GET /widgets/<name>", demoUrl: "/widgets/<name>", description: "<description>" },
```

## Step 5 — Verify

1. `npm run dev`
2. Open `http://localhost:3000/widgets/<name>?apikey=<key>`
3. Confirm `GET /services` lists the new widget in the `widgets` array
