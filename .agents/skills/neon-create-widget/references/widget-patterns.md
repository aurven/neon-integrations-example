# Widget Patterns Reference

## Table of Contents
1. [Minimal .hbs boilerplate](#1-minimal-hbs-boilerplate)
2. [CSS design tokens](#2-css-design-tokens)
3. [Common CSS components](#3-common-css-components)
4. [JS state pattern](#4-js-state-pattern)
5. [API calls with PanelAPI](#5-api-calls-with-panelapi)
6. [Toast notifications](#6-toast-notifications)
7. [Modal dialogs](#7-modal-dialogs)
8. [Tab switching](#8-tab-switching)
9. [XSS-safe rendering](#9-xss-safe-rendering)
10. [Neon environment variables in templates](#10-neon-environment-variables-in-templates)

---

## 1. Minimal .hbs boilerplate

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
    <style>
        :root {
            --bg: #F6F3F6;
            --card: #FFFFFF;
            --accent: #2847E2;
            --accent-hover: #1e3bc4;
            --accent-light: #eef2fe;
            --accent-border: #b9cbfb;
            --text-primary: #3F3C4E;
            --text-secondary: #6b7280;
            --text-muted: #9ca3af;
            --border: #e5e7eb;
            --radius-card: 0.75rem;
            --radius-pill: 9999px;
        }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text-primary);
            margin: 0;
        }
    </style>
</head>
<body>
    <div id="app"><!-- widget root --></div>
    <div id="modalContainer"></div>

    <script>
    // =============================================
    // STATE
    // =============================================
    const state = {
        items: [],
        activeTab: 'all'
    };

    // =============================================
    // API HELPERS
    // =============================================
    async function apiFetch(path, options = {}) {
        try {
            return await PanelAPI.apiCallJson(path, options);
        } catch (err) {
            showToast(err.message || 'API error', 'error');
            throw err;
        }
    }

    async function apiPost(path, body) {
        return apiFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    // =============================================
    // TOAST
    // =============================================
    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // =============================================
    // MODAL
    // =============================================
    function showModal(html) {
        document.getElementById('modalContainer').innerHTML = html;
    }
    function closeModal() {
        document.getElementById('modalContainer').innerHTML = '';
    }

    // =============================================
    // RENDER
    // =============================================
    function render() {
        document.getElementById('app').innerHTML = renderHtml();
    }

    function renderHtml() {
        return `<p>Hello from widget</p>`;
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

    // =============================================
    // INIT
    // =============================================
    document.addEventListener('DOMContentLoaded', () => {
        render();
    });
    </script>
</body>
</html>
```

---

## 2. CSS design tokens

Always define these in `:root`. Do not hardcode hex values in component CSS.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F6F3F6` | Page background |
| `--card` | `#FFFFFF` | Card/panel surfaces |
| `--accent` | `#2847E2` | Primary action colour |
| `--accent-hover` | `#1e3bc4` | Hover state for primary |
| `--accent-light` | `#eef2fe` | Active tab / selected bg |
| `--accent-border` | `#b9cbfb` | Active tab / selected border |
| `--text-primary` | `#3F3C4E` | Body text |
| `--text-secondary` | `#6b7280` | Secondary / helper text |
| `--text-muted` | `#9ca3af` | Placeholder, disabled |
| `--border` | `#e5e7eb` | Default border |
| `--border-light` | `#f3f4f6` | Subtle separator |
| `--radius-card` | `0.75rem` | Card border radius |
| `--radius-pill` | `9999px` | Pills, badges, avatars |

---

## 3. Common CSS components

Copy and adapt these classes. Prefix with your widget abbreviation for component-specific variants.

```css
/* Buttons */
.btn-primary {
    background: var(--accent); color: white;
    padding: 0.5rem 1rem; border-radius: 0.5rem;
    font-weight: 500; font-size: 0.875rem;
    border: none; cursor: pointer;
    transition: background 0.15s ease;
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
    background: #f3f4f6; color: var(--text-primary);
    padding: 0.5rem 1rem; border-radius: 0.5rem;
    font-weight: 500; font-size: 0.875rem;
    border: 1px solid var(--border); cursor: pointer;
}

.btn-danger {
    background: #fee2e2; color: #dc2626;
    padding: 0.375rem 0.75rem; border-radius: 0.5rem;
    font-weight: 500; font-size: 0.8125rem;
    border: 1px solid #fecaca; cursor: pointer;
}

/* Input */
.input-field {
    width: 100%; padding: 0.5rem 0.75rem;
    border: 1px solid var(--border); border-radius: 0.5rem;
    font-size: 0.875rem; color: var(--text-primary);
    background: white; font-family: inherit;
}
.input-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(40,71,226,0.12); }

/* Card */
.card {
    background: white; border: 1px solid var(--border);
    border-radius: var(--radius-card); padding: 1.25rem;
    transition: box-shadow 0.2s ease;
}
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

/* Tab button */
.tab-btn {
    padding: 0.5rem 1.25rem; border-radius: 0.5rem;
    font-weight: 500; font-size: 0.875rem;
    color: var(--text-secondary); background: transparent;
    border: 1px solid transparent; cursor: pointer;
    transition: all 0.15s ease;
}
.tab-btn:hover { color: var(--text-primary); background: #f3f4f6; }
.tab-btn.active { color: var(--accent); background: var(--accent-light); border-color: var(--accent-border); }

/* Badge / pill */
.badge {
    display: inline-flex; align-items: center;
    padding: 0.125rem 0.5rem; border-radius: var(--radius-pill);
    font-size: 0.6875rem; font-weight: 600;
    background: #f3f4f6; color: var(--text-secondary);
    border: 1px solid var(--border);
}

/* Toast */
.toast {
    position: fixed; bottom: 1.5rem; right: 1.5rem;
    background: #1f2937; color: white;
    padding: 0.75rem 1.25rem; border-radius: 0.625rem;
    font-size: 0.875rem; font-weight: 500;
    z-index: 9999; box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    animation: toastIn 0.25s ease;
}
.toast-error   { background: #dc2626; }
.toast-success { background: #16a34a; }
@keyframes toastIn {
    from { opacity: 0; transform: translateY(0.5rem); }
    to   { opacity: 1; transform: translateY(0); }
}

/* Modal overlay */
.modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.35);
    z-index: 50; display: flex;
    align-items: center; justify-content: center; padding: 1rem;
}
.modal-content {
    background: white; border-radius: var(--radius-card);
    padding: 1.75rem; width: 100%; max-width: 36rem;
    max-height: 90vh; overflow-y: auto;
    box-shadow: 0 16px 48px rgba(0,0,0,0.18);
}
```

---

## 4. JS state pattern

Use a single mutable `state` object. Re-render by replacing `innerHTML` of the root element.

```javascript
const state = {
    items: [],
    activeTab: 'all',
    loading: false,
    selectedId: null
};

// Pure filter function — never mutates state
function getFilteredItems() {
    if (state.activeTab === 'all') return state.items;
    return state.items.filter(item => item.type === state.activeTab);
}

// Top-level render dispatcher
function render() {
    document.getElementById('app').innerHTML = renderAppHtml();
}

// Sub-renderers return HTML strings
function renderAppHtml() {
    return `
        ${renderTabsHtml()}
        ${renderListHtml()}
    `;
}
```

**Event handling:** Use a single delegated listener on the root element instead of per-element listeners. Re-renders won't break event handling.

```javascript
document.getElementById('app').addEventListener('click', e => {
    const card = e.target.closest('[data-item-id]');
    if (card) { openDetail(card.dataset.itemId); return; }

    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) { deleteItem(deleteBtn.dataset.deleteId); return; }
});
```

---

## 5. API calls with PanelAPI

`PanelAPI.apiCallJson(path, options)` is available from the injected `panel-api-helper.js`. It handles auth cookies automatically.

```javascript
// GET
const data = await PanelAPI.apiCallJson('/widgets/my-widget/items');

// POST
const result = await PanelAPI.apiCallJson('/widgets/my-widget/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'foo' })
});

// PUT
await PanelAPI.apiCallJson(`/widgets/my-widget/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
});

// DELETE
await PanelAPI.apiCallJson(`/widgets/my-widget/items/${id}`, { method: 'DELETE' });
```

If the widget is demo/mock-only, add `// INTEGRATION POINT: replace with apiCallJson(...)` where real calls would go.

---

## 6. Toast notifications

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

// Usage
showToast('Item saved');
showToast('Something went wrong', 'error');
showToast('Item created', 'success');
```

---

## 7. Modal dialogs

```javascript
function showModal(html) {
    document.getElementById('modalContainer').innerHTML = html;
}
function closeModal() {
    document.getElementById('modalContainer').innerHTML = '';
}

// Usage — close on overlay click with inline handler
function openCreateModal() {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal-content">
            <h2 style="font-size:1.125rem;font-weight:600;margin:0 0 1.25rem;">Create Item</h2>
            <div style="margin-bottom:1rem;">
                <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-secondary);margin-bottom:0.375rem;">Name</label>
                <input type="text" class="input-field" id="modal-name" autofocus>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1.5rem;">
                <button class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn-primary" onclick="createItem()">Create</button>
            </div>
        </div>
    </div>`);
}

function createItem() {
    const name = document.getElementById('modal-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    // ... create logic ...
    closeModal();
    showToast(`"${name}" created`);
    render();
}
```

---

## 8. Tab switching

```javascript
// In HTML (static, part of page structure)
// <div id="tabs">
//   <button class="tab-btn active" data-tab="all">All</button>
//   <button class="tab-btn" data-tab="draft">Draft</button>
// </div>
// <div id="tabContent"></div>

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
    document.getElementById('tabContent').innerHTML = renderItemsHtml(getFilteredItems());
}
```

---

## 9. XSS-safe rendering

Always escape user-supplied or API-sourced strings before inserting into HTML.

```javascript
function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// Usage in template strings
function renderCardHtml(item) {
    return `<div class="card">${esc(item.title)}</div>`;
}
```

**Rule:** Every piece of dynamic content inserted via `innerHTML` or template literals must go through `esc()`. Static strings from your own code do not need escaping.

---

## 10. Neon environment variables in templates

The handler passes `neonAppUrl` from `process.env.NEON_APP_URL`. Access it in the template as a Handlebars expression inside a JS string:

```javascript
// In the <script> block of the .hbs file:
function openArticle(ref) {
    const baseUrl = '{{neonAppUrl}}';
    if (!baseUrl) { showToast('Neon App URL not configured', 'error'); return; }
    window.open(`${baseUrl}/neon/app/neon.html#open/${ref}`, '_blank');
}
```

The handler must pass the variable:
```javascript
let params = {
    seo: { title: "...", description: "..." },
    neonAppUrl: process.env.NEON_APP_URL
};
```
