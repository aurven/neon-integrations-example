# Neon Grid Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AG-Grid Community React widget that lists Neon CMS articles (headline, summary, date, status), served by Fastify with a proxy data endpoint backed by `neon-bo-api-v3`.

**Architecture:** Self-contained Vite sub-project at `src/react-widgets/` builds an IIFE bundle to `public/js/react/`. A thin HBS shell loads the bundle and injects `window.CONFIG`. Fastify serves the shell page and a `/api/neon/grid/articles` proxy that queries Neon via `neon-bo-api-v3.searchContents`.

**Tech Stack:** React 18, AG-Grid Community + ag-grid-react, Vite 5 + @vitejs/plugin-react, Node.js/Fastify, Handlebars

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/react-widgets/package.json` | Vite sub-project manifest |
| Create | `src/react-widgets/vite.config.js` | Build to IIFE → `public/js/react/` |
| Create | `src/react-widgets/src/api.js` | Fetch wrapper reading `window.CONFIG.apiKey` |
| Create | `src/react-widgets/src/columns.jsx` | AG-Grid column definitions |
| Create | `src/react-widgets/src/NeonGridWidget.jsx` | AG-Grid React component with loading/error states |
| Create | `src/react-widgets/src/main.jsx` | Entry point — mounts React to `#root` |
| Create | `src/widgets/neon-grid.hbs` | HBS shell: `#root` div + CONFIG + script tags |
| Modify | `src/requestHandlers/widgets.js` | Add `neonGridWidgetHandler` + `neonGridDataHandler` |
| Modify | `server.js` | Register 2 new routes |

---

## Task 1: Scaffold Vite sub-project

**Files:**
- Create: `src/react-widgets/package.json`
- Create: `src/react-widgets/vite.config.js`

- [ ] **Step 1: Create `src/react-widgets/package.json`**

```json
{
  "name": "neon-grid-widget",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "ag-grid-community": "^31.3.2",
    "ag-grid-react": "^31.3.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.14"
  }
}
```

- [ ] **Step 2: Create `src/react-widgets/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'NeonGridWidget',
      fileName: () => 'neon-grid-widget.js',
      formats: ['iife']
    },
    outDir: '../../public/js/react',
    emptyOutDir: false,
    cssFileName: 'neon-grid-widget'
  }
})
```

- [ ] **Step 3: Install dependencies**

```bash
cd src/react-widgets && npm install
```

Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 4: Commit scaffold**

```bash
git add src/react-widgets/package.json src/react-widgets/package-lock.json src/react-widgets/vite.config.js
git commit -m "feat: scaffold Vite sub-project for React widgets"
```

---

## Task 2: Create `api.js` — fetch helper

**Files:**
- Create: `src/react-widgets/src/api.js`

- [ ] **Step 1: Create `src/react-widgets/src/api.js`**

```js
const BASE_URL = '';

async function apiFetch(path) {
  const apiKey = window.CONFIG?.apiKey ?? '';
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { apikey: apiKey }
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }
  return response.json();
}

export function fetchArticles() {
  return apiFetch('/api/neon/grid/articles');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/react-widgets/src/api.js
git commit -m "feat: add API fetch helper for neon grid widget"
```

---

## Task 3: Create `columns.jsx` — AG-Grid column definitions

**Files:**
- Create: `src/react-widgets/src/columns.jsx`

- [ ] **Step 1: Create `src/react-widgets/src/columns.jsx`**

Note: file is `.jsx` (not `.js`) because `StatusCellRenderer` uses JSX — `@vitejs/plugin-react` only transforms JSX in `.jsx` files by default.

```js
function StatusCellRenderer({ value }) {
  const colors = {
    PUBLISHED: '#22c55e',
    DRAFT: '#f59e0b',
    READY: '#3b82f6',
    ARCHIVED: '#6b7280'
  };
  const bg = colors[value?.toUpperCase()] ?? '#9ca3af';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#fff',
      background: bg,
      whiteSpace: 'nowrap'
    }}>
      {value || 'Unknown'}
    </span>
  );
}

function formatDate(params) {
  if (!params.value) return '—';
  const d = new Date(params.value);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export const columnDefs = [
  {
    field: 'headline',
    headerName: 'Headline',
    flex: 2,
    minWidth: 200,
    resizable: true,
    sortable: true,
    filter: true
  },
  {
    field: 'summary',
    headerName: 'Summary',
    flex: 3,
    minWidth: 200,
    resizable: true,
    sortable: false,
    filter: false
  },
  {
    field: 'date',
    headerName: 'Date',
    width: 180,
    resizable: true,
    sortable: true,
    valueFormatter: formatDate
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    resizable: false,
    sortable: true,
    filter: true,
    cellRenderer: StatusCellRenderer
  }
];

export const defaultColDef = {
  suppressMovable: false,
  cellStyle: { fontSize: '13px' }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/react-widgets/src/columns.jsx
git commit -m "feat: add AG-Grid column definitions for neon grid widget"
```

---

## Task 4: Create `NeonGridWidget.jsx` — AG-Grid component

**Files:**
- Create: `src/react-widgets/src/NeonGridWidget.jsx`

- [ ] **Step 1: Create `src/react-widgets/src/NeonGridWidget.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { columnDefs, defaultColDef } from './columns.jsx';
import { fetchArticles } from './api.js';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function NeonGridWidget() {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchArticles()
      .then(data => {
        setRowData(data.articles ?? data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
        Loading articles…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#ef4444' }}>
        Failed to load articles: {error}
      </div>
    );
  }

  return (
    <div
      className="ag-theme-alpine"
      style={{ height: 'calc(100vh - 48px)', width: '100%' }}
    >
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows={true}
        pagination={true}
        paginationPageSize={25}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/react-widgets/src/NeonGridWidget.jsx
git commit -m "feat: add NeonGridWidget AG-Grid React component"
```

---

## Task 5: Create `main.jsx` — React entry point

**Files:**
- Create: `src/react-widgets/src/main.jsx`

- [ ] **Step 1: Create `src/react-widgets/src/main.jsx`**

```jsx
import { createRoot } from 'react-dom/client';
import NeonGridWidget from './NeonGridWidget.jsx';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<NeonGridWidget />);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/react-widgets/src/main.jsx
git commit -m "feat: add React entry point for neon grid widget"
```

---

## Task 6: Build the React bundle

**Files:**
- Creates: `public/js/react/neon-grid-widget.js`
- Creates: `public/js/react/neon-grid-widget.css`

- [ ] **Step 1: Run Vite build**

```bash
cd src/react-widgets && npm run build
```

Expected output (paths relative to repo root):
```
public/js/react/neon-grid-widget.js       ~400-600 kB (minified)
public/js/react/neon-grid-widget.css      ~10-30 kB
```

No errors. If you see `RollupError` about missing modules, run `npm install` first.

- [ ] **Step 2: Verify output files exist**

```bash
ls -lh ../../public/js/react/
```

Expected: `neon-grid-widget.js` and `neon-grid-widget.css` both present.

- [ ] **Step 3: Commit build output**

```bash
cd ../..
git add public/js/react/neon-grid-widget.js public/js/react/neon-grid-widget.css
git commit -m "feat: add compiled Vite bundle for neon grid widget"
```

---

## Task 7: Create HBS shell

**Files:**
- Create: `src/widgets/neon-grid.hbs`

- [ ] **Step 1: Create `src/widgets/neon-grid.hbs`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{seo.title}}</title>
  <link rel="stylesheet" href="/css/tailwind-panels.css">
  <link rel="stylesheet" href="/neon/api/demo-integration/css/tailwind-panels.css">
  <link rel="stylesheet" href="/js/react/neon-grid-widget.css">
  <link rel="stylesheet" href="/neon/api/demo-integration/js/react/neon-grid-widget.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
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

- [ ] **Step 2: Commit**

```bash
git add src/widgets/neon-grid.hbs
git commit -m "feat: add HBS shell for neon grid React widget"
```

---

## Task 8: Add Fastify handlers to `widgets.js`

**Files:**
- Modify: `src/requestHandlers/widgets.js`

`widgets.js` currently requires: `mammoth`, `../seo.json`, `../ai/openai.js`, `../stories-populator.js`, `../helpers/utils.js`, `../helpers/auth.js`. Add `neon-bo-api-v3` require and two new handlers.

- [ ] **Step 1: Add require at top of `src/requestHandlers/widgets.js`**

After the existing requires (line 6), add:

```js
const neonBoApi = require("../helpers/neon-bo-api-v3.js");
```

- [ ] **Step 2: Add `neonGridWidgetHandler` before `module.exports`**

Insert before `module.exports = {`:

```js
function neonGridWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "Neon Articles Grid",
      description: "AG-Grid list of articles from Neon CMS"
    },
    neonAppUrl: process.env.NEON_APP_URL,
    apiKey: auth.apikey
  };
  return reply.view("/src/widgets/neon-grid.hbs", params);
}

async function neonGridDataHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const queryPayload = {
    queryStatement: {
      bool: {
        and: [
          { type: "match", path: "typeName", match: "article*" }
        ]
      },
      sort: {
        type: "fields",
        sorts: [
          { path: "versionInfo.createFamilyTime", order: "DESC" }
        ]
      }
    },
    variables: {
      domain: ["editorial"]
    },
    options: {
      showLoadPublishInfo: true,
      showSystemAttributes: true
    }
  };

  try {
    const searchResults = await neonBoApi.searchContents(queryPayload, 50, 50);
    const nodes = searchResults.nodes || [];

    const articles = nodes.map(node => ({
      id: node.familyRef,
      headline: node.title || '',
      summary: node.nodeMeta?.teaser?.title || '',
      date: node.updateTs || null,
      status: node.workflowInfo?.workflow || 'Unknown'
    }));

    return reply.status(200).send({ articles });
  } catch (error) {
    console.error('neonGridDataHandler error:', error);
    return reply.status(500).send({ error: 'Failed to fetch articles from Neon' });
  }
}
```

- [ ] **Step 3: Add exports to `module.exports`**

In `module.exports`, add after `planningBoardWidgetHandler`:

```js
  neonGridWidgetHandler,
  neonGridDataHandler,
```

- [ ] **Step 4: Verify the file has no syntax errors**

```bash
node -e "require('./src/requestHandlers/widgets.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/requestHandlers/widgets.js
git commit -m "feat: add neonGridWidgetHandler and neonGridDataHandler"
```

---

## Task 9: Register routes in `server.js`

**Files:**
- Modify: `server.js`

The widgets block is around line 232–242. Add 2 routes after the `planning-board` line.

- [ ] **Step 1: Add routes after the planning-board route in `server.js`**

After:
```js
fastify.get("/widgets/planning-board", widgetHandlers.planningBoardWidgetHandler);
```

Add:
```js
fastify.get("/widgets/neon-grid", widgetHandlers.neonGridWidgetHandler);
fastify.get("/api/neon/grid/articles", widgetHandlers.neonGridDataHandler);
```

- [ ] **Step 2: Verify server starts without errors**

```bash
node -e "
process.env.NEON_EXT_APIKEY = 'test';
process.env.NEON_BO_URL = 'http://localhost';
process.env.NEON_BO_APIKEY = 'test';
require('./server.js');
setTimeout(() => process.exit(0), 2000);
" 2>&1 | head -20
```

Expected: Fastify starts, no `TypeError` or `SyntaxError` in first 20 lines.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: register neon-grid widget and data API routes"
```

---

## Task 10: Smoke test end-to-end

No automated test framework in this project. Manual verification steps.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Confirm server starts on port 3000 (or configured port) without errors.

- [ ] **Step 2: Test the data endpoint**

```bash
curl -s -H "apikey: $NEON_EXT_APIKEY" http://localhost:3000/api/neon/grid/articles | head -200
```

Expected: JSON like `{"articles":[{"id":"...","headline":"...","summary":"...","date":"...","status":"..."},...]}`.
If Neon is unreachable: `{"error":"Failed to fetch articles from Neon"}` with 500 — data endpoint wired correctly, Neon connectivity is separate.

- [ ] **Step 3: Test the widget page**

Open in browser:
```
http://localhost:3000/widgets/neon-grid?apikey=<your-NEON_EXT_APIKEY>
```

Expected: Page loads, `#root` div mounts, AG-Grid table appears. If Neon is reachable: rows populate. If not: "Failed to load articles" error message shown in the React component.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -p  # stage only intentional changes
git commit -m "chore: cleanup after neon grid widget smoke test"
```

---

## Rebuild after source changes

If you edit any file in `src/react-widgets/src/`, re-run:

```bash
cd src/react-widgets && npm run build
```

Then stage and commit the updated `public/js/react/neon-grid-widget.js` and `public/js/react/neon-grid-widget.css`.
