# Neon Grid Widget — Design Spec

**Date:** 2026-06-04  
**Status:** Approved

## Summary

AG-Grid Community React widget that lists Neon CMS articles, served via the existing Fastify server. Uses a self-contained Vite sub-project to avoid touching the server's `package.json`. Fastify proxies data from Neon via `neon-bo-api-v3`.

---

## Architecture

```
src/
  react-widgets/            ← Vite sub-project (own package.json)
    package.json
    vite.config.js
    src/
      main.jsx              ← mounts React app to #root
      NeonGridWidget.jsx    ← AG-Grid wrapper component
      api.js                ← fetch helper (reads CONFIG, calls Fastify proxy)
      columns.js            ← column defs: headline, summary, date, status

public/
  js/
    react/
      neon-grid-widget.js   ← Vite build output (IIFE bundle)

src/
  widgets/
    neon-grid.hbs           ← HBS shell: #root div + CONFIG injection + bundle script
  requestHandlers/
    widgets.js              ← +neonGridWidgetHandler, +neonGridDataHandler
```

**Data flow:**
1. Neon opens widget URL → Fastify auth check → `reply.view('neon-grid.hbs', { neonAppUrl, apiKey })`
2. HBS injects `window.CONFIG = { neonAppUrl, apiKey }` into page
3. React mounts, calls `GET /api/neon/grid/articles` with `apikey` header
4. Fastify proxy uses `neon-bo-api-v3` to query Neon, returns JSON array
5. AG-Grid renders rows

---

## Fastify Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/widgets/neon-grid` | `neonGridWidgetHandler` | Serves HBS shell |
| GET | `/api/neon/grid/articles` | `neonGridDataHandler` | Proxy to Neon, returns JSON |

### `neonGridWidgetHandler`
- Auth via existing `authenticate()` helper
- Passes `{ seo, neonAppUrl, apiKey }` to HBS template

### `neonGridDataHandler`
- Auth via `authenticate()`
- Calls `neon-bo-api-v3` with default preset:
  - `type: article`
  - `limit: 50`
  - `orderBy: date desc`
- Maps response to flat array: `[{ id, headline, summary, date, status, ...metadata }]`
- Returns `application/json`

Default query is hardcoded for now. Configurable later via URL query string params.

---

## Vite Sub-project (`src/react-widgets/`)

### Dependencies
- **Runtime:** `react`, `react-dom`, `ag-grid-community`, `ag-grid-react`
- **Dev:** `vite`, `@vitejs/plugin-react`

### Vite config
- Output format: IIFE (so plain `<script src>` works in HBS)
- Output file: `../../public/js/react/neon-grid-widget.js`
- AG-Grid CSS injected at runtime via JS (no separate CSS file needed in HBS)

### `main.jsx`
Reads `window.CONFIG`, mounts `<NeonGridWidget config={window.CONFIG}>` to `#root`.

### `NeonGridWidget.jsx`
- `useEffect` → fetches `/api/neon/grid/articles` with `apikey` header on mount
- Loading state, error state
- `AgGridReact` with `rowData` + `columnDefs`
- Theme: AG-Grid Alpine

### `columns.js`
Explicit column definitions:
- `headline` — wide, resizable
- `summary` — flex width
- `date` — formatted (ISO → readable)
- `status` — custom pill cell renderer

Designed for extension: adding metadata columns = append to exported array.

### `api.js`
Thin fetch wrapper. Pulls `apiKey` from `window.CONFIG`, adds it as `apikey` header to all requests.

### Build command
```bash
cd src/react-widgets && npm install && npm run build
```
Output lands in `public/js/react/` which Fastify already serves statically via `@fastify/static`.

---

## HBS Shell (`src/widgets/neon-grid.hbs`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{seo.title}}</title>
  <link rel="stylesheet" href="/css/tailwind-panels.css">
  <link rel="stylesheet" href="/neon/api/demo-integration/css/tailwind-panels.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.CONFIG = {
      neonAppUrl: '{{neonAppUrl}}',
      apiKey: '{{{apiKey}}}'
    };
  </script>
  <script src="/js/react/neon-grid-widget.js"></script>
  <script src="/neon/api/demo-integration/js/react/neon-grid-widget.js"></script>
</body>
</html>
```

---

## Out of Scope (deferred)

- Query configurability via URL params or UI controls
- Additional metadata columns (extensibility point exists, columns TBD)
- Column visibility toggles
- Export to CSV/Excel
- Pagination beyond default limit of 50
