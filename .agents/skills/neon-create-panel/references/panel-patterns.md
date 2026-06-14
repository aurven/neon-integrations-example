# Panel Patterns Reference

## Table of Contents
1. [Minimal .hbs boilerplate](#1-minimal-hbs-boilerplate)
2. [CSS design tokens](#2-css-design-tokens)
3. [Common CSS components](#3-common-css-components)
4. [PanelAPI — all methods](#4-panelapi--all-methods)
5. [Receiving Neon context (PostMessage)](#5-receiving-neon-context-postmessage)
6. [JS state and render pattern](#6-js-state-and-render-pattern)
7. [Toast notifications](#7-toast-notifications)
8. [Tab switching](#8-tab-switching)
9. [Maintenance mode](#9-maintenance-mode)
10. [Handlebars params reference](#10-handlebars-params-reference)

---

## 1. Minimal .hbs boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Panel</title>
    <!-- Dual-load: one path works standalone, the other works when embedded in Neon -->
    <script src="/js/panel-api-helper.js"></script>
    <script src="/neon/api/demo-integration/js/panel-api-helper.js"></script>
    <link rel="stylesheet" href="/css/tailwind-panels.css">
    <link rel="stylesheet" href="/neon/api/demo-integration/css/tailwind-panels.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f6f3f6;
            color: #111827;
            margin: 0;
            padding: 1rem;
        }
    </style>
</head>
<body>
    <div id="panel-root"></div>

    <script>
    // =============================================
    // CONFIG (injected by Handlebars handler)
    // =============================================
    const CONFIG = {
        apiKey:     '{{{apiKey}}}',
        neonAppUrl: '{{neonAppUrl}}'
    };

    // =============================================
    // STATE
    // =============================================
    const state = {
        neonContext: null,   // set by PostMessage or query param
        objectId: null,
        loading: true,
        error: null
    };

    // =============================================
    // INIT
    // =============================================
    document.addEventListener('DOMContentLoaded', async () => {
        // Option A: context from query param
        const params = new URLSearchParams(window.location.search);
        const objectId = params.get('objectId');
        if (objectId) {
            state.objectId = objectId;
            await loadData();
        } else {
            // Option B: context via PostMessage
            initPostMessage();
        }
    });

    // =============================================
    // POSTMESSAGE (if needed)
    // =============================================
    function initPostMessage() {
        window.addEventListener('message', async (event) => {
            if (event.data?.key === 'getInfo') {
                state.neonContext = event.data.info;
                state.objectId = event.data.info?.originalNode?.familyRef;
                await loadData();
            }
        });
        window.parent.postMessage({ type: 'panel-ready', info: { op: 'getInfo' } }, '*');
    }

    // =============================================
    // DATA LOADING
    // =============================================
    async function loadData() {
        try {
            const data = await PanelAPI.apiCallJson(`/panels/my-panel/api/data?id=${state.objectId}`);
            state.loading = false;
            render(data);
        } catch (err) {
            state.error = err.message;
            state.loading = false;
            renderError(err.message);
        }
    }

    // =============================================
    // RENDER
    // =============================================
    function render(data) {
        document.getElementById('panel-root').innerHTML = `<p>${esc(JSON.stringify(data))}</p>`;
    }

    function renderError(message) {
        document.getElementById('panel-root').innerHTML =
            `<div style="color:#dc2626;padding:1rem;">${esc(message)}</div>`;
    }

    // =============================================
    // UTILITIES
    // =============================================
    function esc(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
    </script>
</body>
</html>
```

---

## 2. CSS design tokens

Panels use the same token vocabulary as widgets. Use these values directly (Tailwind panels CSS provides utilities; custom component CSS uses these tokens):

| Token | Value | Usage |
|---|---|---|
| Background | `#f6f3f6` | Panel body background |
| Card surface | `#ffffff` | Cards, input areas |
| Accent | `#2847E2` | Buttons, active states |
| Accent light | `#eef2fe` | Active tab bg, selected chip |
| Text primary | `#111827` or `#3F3C4E` | Body text |
| Text secondary | `#6b7280` | Labels, hints |
| Border | `#e5e7eb` | Cards, inputs |
| Danger | `#dc2626` / `#fee2e2` | Error states, delete buttons |

---

## 3. Common CSS components

```css
/* Compact card (panels have less horizontal space than widgets) */
.panel-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.625rem;
    padding: 0.875rem;
    margin-bottom: 0.625rem;
    transition: box-shadow 0.15s;
}
.panel-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

/* Compact button */
.btn-sm {
    padding: 0.3125rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
}
.btn-sm-primary { background: #2847E2; color: white; }
.btn-sm-primary:hover { background: #1e3bc4; }
.btn-sm-secondary { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }

/* Status badge */
.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.6875rem;
    font-weight: 600;
}
.status-published { background: #dcfce7; color: #16a34a; }
.status-draft      { background: #f3f4f6; color: #6b7280; }
.status-review     { background: #fef9c3; color: #a16207; }

/* Full-width input */
.panel-input {
    width: 100%;
    padding: 0.4375rem 0.625rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-family: inherit;
    background: white;
}
.panel-input:focus { outline: none; border-color: #2847E2; box-shadow: 0 0 0 3px rgba(40,71,226,0.1); }

/* Section heading */
.panel-section-heading {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    margin-bottom: 0.5rem;
}

/* Empty state */
.panel-empty {
    text-align: center;
    padding: 2rem 1rem;
    color: #9ca3af;
    font-size: 0.875rem;
}

/* Loading spinner */
.panel-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
}
.spinner {
    width: 24px; height: 24px;
    border: 2px solid #e5e7eb;
    border-top-color: #2847E2;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

---

## 4. PanelAPI — all methods

`PanelAPI` is globally available after `panel-api-helper.js` loads.

```javascript
// Core fetch wrappers — always use these, never raw fetch()
PanelAPI.apiCall(path, options)         // returns raw Response
PanelAPI.apiCallJson(path, options)     // parses JSON, throws on non-2xx

// Path builders
PanelAPI.buildApiPath(path)             // adds /neon/api/demo-integration prefix if embedded
PanelAPI.buildStaticPath(path)          // same, for static assets
PanelAPI.buildResourceUrl(path, params) // for binary resource endpoints (PDF, download)

// Dynamic asset loading
PanelAPI.loadScript(path, options)      // injects <script> with proper prefix
PanelAPI.loadStylesheet(path, options)  // injects <link> with proper prefix

// Diagnostics
PanelAPI.isEmbedded()                   // boolean — true when in Neon iframe
PanelAPI.getEmbedInfo()                 // { isEmbedded, apiPrefix, ... }
```

**API call pattern:**
```javascript
async function fetchItems() {
    try {
        const items = await PanelAPI.apiCallJson('/panels/<name>/api/items');
        return items;
    } catch (err) {
        console.error('Failed to load items:', err);
        showToast(err.message || 'Failed to load', 'error');
        return [];
    }
}

async function createItem(payload) {
    return PanelAPI.apiCallJson('/panels/<name>/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}
```

---

## 5. Receiving Neon context (PostMessage)

When a panel is opened in the Neon CMS object editor, Neon sends the current article's context via PostMessage after the panel signals it is ready.

```javascript
function initPostMessage() {
    window.addEventListener('message', (event) => {
        // Ignore messages that aren't from the parent Neon app
        if (!event.data) return;

        // Neon sends { key: 'getInfo', info: { originalNode, sites, ... } }
        if (event.data.key === 'getInfo') {
            const ctx = event.data.info;

            // Extract common fields
            const familyRef  = ctx?.originalNode?.familyRef;   // e.g. "article-1234"
            const headline   = ctx?.originalNode?.metadata?.headline;
            const siteNodes  = ctx?.siteNodes || [];

            state.neonContext = ctx;
            state.objectId   = familyRef;
            loadData(familyRef);
        }
    });

    // Tell Neon the panel is ready and request context
    window.parent.postMessage(
        { type: 'panel-ready', info: { op: 'getInfo' } },
        '*'   // use CONFIG.neonAppUrl instead of '*' in production
    );
}
```

**Neon context shape (partial):**
```javascript
{
  originalNode: {
    familyRef: "article-1234",
    metadata: {
      headline: "Article Title",
      section: "/news/politics",
      wordCount: 850
    }
  },
  siteNodes: [
    { site: "theglobe", status: "published", url: "https://..." }
  ]
}
```

---

## 6. JS state and render pattern

Same pattern as widgets — single `state` object, `innerHTML` replacement, delegated events:

```javascript
const state = {
    items: [],
    selectedId: null,
    loading: false,
    activeTab: 'all'
};

function render() {
    if (state.loading) {
        document.getElementById('panel-root').innerHTML =
            '<div class="panel-loading"><div class="spinner"></div></div>';
        return;
    }
    document.getElementById('panel-root').innerHTML = renderPanelHtml();
}

function renderPanelHtml() {
    const filtered = state.items.filter(item =>
        state.activeTab === 'all' || item.status === state.activeTab
    );
    return filtered.length > 0
        ? filtered.map(item => renderItemCard(item)).join('')
        : '<div class="panel-empty">No items found.</div>';
}

function renderItemCard(item) {
    return `
    <div class="panel-card" data-id="${item.id}">
        <div style="font-weight:600;font-size:0.875rem;">${esc(item.title)}</div>
        <div style="font-size:0.8125rem;color:#6b7280;">${esc(item.status)}</div>
    </div>`;
}

// Single delegated listener — set once, survives re-renders
document.getElementById('panel-root').addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (card) { selectItem(card.dataset.id); return; }

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) { deleteItem(deleteBtn.dataset.delete); return; }
});
```

---

## 7. Toast notifications

Panels use the same toast pattern as widgets:

```javascript
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
```

Required CSS (add to `<style>`):
```css
.toast {
    position: fixed; bottom: 1rem; right: 1rem;
    background: #1f2937; color: white;
    padding: 0.625rem 1rem; border-radius: 0.5rem;
    font-size: 0.8125rem; font-weight: 500;
    z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: toastIn 0.2s ease;
}
.toast-error   { background: #dc2626; }
.toast-success { background: #16a34a; }
@keyframes toastIn {
    from { opacity:0; transform:translateY(4px); }
    to   { opacity:1; transform:translateY(0); }
}
```

---

## 8. Tab switching

```javascript
// HTML tabs (static, part of page structure)
// <div id="tabs">
//   <button class="tab-btn active" data-tab="all">All</button>
//   <button class="tab-btn" data-tab="published">Published</button>
// </div>
// <div id="tab-content"></div>

function initTabs() {
    document.getElementById('tabs').addEventListener('click', e => {
        const btn = e.target.closest('.tab-btn[data-tab]');
        if (!btn) return;
        state.activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === state.activeTab)
        );
        renderTabContent();
    });
}

function renderTabContent() {
    document.getElementById('tab-content').innerHTML = renderPanelHtml();
}
```

Compact tab CSS for panels (less horizontal space than widgets):
```css
.tab-bar { display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 0.875rem; }
.tab-btn {
    padding: 0.375rem 0.75rem; font-size: 0.8125rem; font-weight: 500;
    color: #6b7280; background: none; border: none;
    border-bottom: 2px solid transparent; cursor: pointer;
    transition: all 0.15s;
}
.tab-btn:hover { color: #374151; }
.tab-btn.active { color: #2847E2; border-bottom-color: #2847E2; }
```

---

## 9. Maintenance mode

The `shouldShowMaintenance(request, auth, panelName)` helper in `src/helpers/auth.js` controls whether the panel shows a maintenance page instead of its normal content.

In the handler:
```javascript
if (shouldShowMaintenance(request, auth, '<name>')) {
    return reply.view("/src/panels/maintenance-panel.hbs", {
        seo: seo,
        panelName: "<Display Name>",
        isDemoMode: request.query.demo === 'maintenance'
    });
}
```

Trigger maintenance mode in demo by visiting: `/panels/<name>?apikey=<key>&demo=maintenance`

---

## 10. Handlebars params reference

All params passed by the handler are available in the `.hbs` template:

| Expression | Value | Notes |
|---|---|---|
| `{{seo.title}}` | Page `<title>` | From `seo.json` |
| `{{{apiKey}}}` | Auth API key string | Triple braces = unescaped |
| `{{neonAppUrl}}` | `process.env.NEON_APP_URL` | Base URL of the Neon app |
| `{{{trelloApiKey}}}` | Service-specific key | Add to handler params as needed |
| `{{externalRef}}` | Object reference from query param | e.g. Trello card ID |
| `{{isDraggable}}` | Boolean from env var | Panel-specific feature flag |

Access in JS:
```javascript
const apiKey     = '{{{apiKey}}}';
const neonAppUrl = '{{neonAppUrl}}';
const objectRef  = '{{externalRef}}' || null;
```

Access in HTML:
```html
<meta name="neon-app-url" content="{{neonAppUrl}}">
```
