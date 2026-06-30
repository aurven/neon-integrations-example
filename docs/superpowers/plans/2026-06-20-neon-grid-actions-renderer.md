# Neon Grid Actions Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable AG-Grid `actions` column type to the `neon-grid` widget — one icon button if a single action is configured, a "⋮" dropdown if multiple — wired to stub handlers (Copy/Move/Send) that show a toast, with no real backend call.

**Architecture:** New `ActionsCellRenderer` + small inline-SVG icon dictionary in `columns.jsx`, a new `'actions'` case in `buildColumnDefs`. `NeonGridWidget.jsx` gets a local `Toast` component and a stub `onAction(actionId, row)` dispatcher threaded into `buildColumnDefs`'s new second parameter. One demo column added to `conf/widgets/neon-grid/default.json` for visibility.

**Tech Stack:** React 18, AG-Grid Community/React (existing widget, no new dependencies), Vite (existing build).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-neon-grid-actions-renderer-design.md` — read it if anything below is ambiguous, but the steps in this plan are already complete and self-contained.
- **No test runner exists anywhere in this repo** (confirmed: no Jest/Vitest in `src/react-widgets/package.json`, root `CLAUDE.md` states no test commands are configured). Do not add one. Every "verify" step in this plan uses `npm run build` (catches syntax/import errors) plus a manual trace or `curl`/browser check instead of an automated test — this replaces the usual RED/GREEN test cycle for this codebase.
- Actions are stubs only in this plan: clicking one shows a toast, no `updateMetadata`/Neon call. Real per-action behavior is explicitly out of scope (see spec's "Out of Scope").
- Match existing inline-style conventions exactly — no new CSS classes, no new files. Both target files (`columns.jsx`, `NeonGridWidget.jsx`) already exist and already use 100% inline styles for cell renderers and the widget shell.
- `print-query-board`'s `PriorityChip`/`DateChip`/`Toast` are precedent for *pattern* (backdrop+popover for a dropdown; auto-dismissing toast) — do not import from that file. This widget's instances are local, small, separate.

---

### Task 1: Actions column renderer + stub dispatch + demo wiring

**Files:**
- Modify: `src/react-widgets/src/columns.jsx`
- Modify: `src/react-widgets/src/NeonGridWidget.jsx`
- Modify: `conf/widgets/neon-grid/default.json`

**Interfaces:**
- Produces: `buildColumnDefs(columns, { onAction } = {})` — second parameter is new; existing call sites that omit it are unaffected (defaults to `{}`, `onAction` ends up `undefined`, only matters for the new `'actions'` column type).
- Produces: column config shape `{ field, headerName, type: 'actions', width, actions: [{ id, label, icon }, ...] }` — `icon` is one of `'copy' | 'move' | 'send'` (unknown values fall back to a generic "more" glyph, never render nothing).
- Consumes: AG-Grid `cellRenderer`/`cellRendererParams` contract (existing pattern already used by `BadgeCellRenderer`/`StatusCellRenderer` in the same file).

- [ ] **Step 1: Add the icon dictionary and `ActionsCellRenderer` to `columns.jsx`**

Add `import { useState } from 'react';` as the very first line of the file (no imports currently exist in this file — every other renderer is a stateless function component; this is the first one needing `useState`).

Then add the following, placed after `BadgeCellRenderer` (line 94 in the current file) and before `export function buildColumnDefs` (line 96):

```jsx
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const MoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const ACTION_ICONS = { copy: CopyIcon, move: MoveIcon, send: SendIcon };

function ActionsCellRenderer({ data, colDef }) {
  const [open, setOpen] = useState(false);
  const actions = colDef.cellRendererParams?.actions || [];
  const onAction = colDef.cellRendererParams?.onAction || (() => {});

  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const action = actions[0];
    const Icon = ACTION_ICONS[action.icon] || MoreIcon;
    return (
      <button
        onClick={() => onAction(action.id, data)}
        title={action.label}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
          background: 'none', cursor: 'pointer', color: '#3f3c4e',
        }}
      >
        <Icon />
      </button>
    );
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Actions"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
          background: open ? '#f6f3f6' : 'none', cursor: 'pointer', color: '#3f3c4e',
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
            background: '#ffffff', border: '1px solid #dddce5', borderRadius: '9px',
            boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: '4px', width: '140px',
          }}>
            {actions.map(action => {
              const Icon = ACTION_ICONS[action.icon] || MoreIcon;
              return (
                <button
                  key={action.id}
                  onClick={() => { onAction(action.id, data); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: '#3f3c4e', fontSize: '12px',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <Icon />
                  {action.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Add the `'actions'` case to `buildColumnDefs`'s switch and the new second parameter**

In `columns.jsx`, change the function signature (currently `export function buildColumnDefs(columns = []) {`) to:

```jsx
export function buildColumnDefs(columns = [], { onAction } = {}) {
```

Inside the `switch (col.type) {` block, add a new case — place it right after the existing `case 'select':` block and before `default:`:

```jsx
      case 'actions':
        return { ...base, cellRenderer: ActionsCellRenderer, cellRendererParams: { actions: col.actions || [], onAction } };
```

- [ ] **Step 3: Verify `columns.jsx` builds**

Run: `cd src/react-widgets && npm run build`
Expected: `✓ built` with no errors. This only checks syntax/imports — `ActionsCellRenderer` has no consumer wired yet, so nothing renders differently until Step 5.

- [ ] **Step 4: Add the local `Toast` component and stub dispatcher to `NeonGridWidget.jsx`**

Change the import line (currently `import { useState, useCallback, useMemo } from 'react';`) to add `useRef`:

```jsx
import { useState, useCallback, useMemo, useRef } from 'react';
```

After the existing `RefreshIcon` component (ends at line 15) and before `export default function NeonGridWidget()` (line 17), add:

```jsx
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '22px', left: '50%', transform: 'translateX(-50%)', zIndex: 600,
      background: '#3f3c4e', color: '#fff', borderRadius: '10px', padding: '10px 16px',
      fontSize: '12.5px', fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.28)',
    }}>
      {toast.text}
    </div>
  );
}

const ACTION_LABELS = { copy: 'Copy', move: 'Move', send: 'Send' };
```

- [ ] **Step 5: Wire toast state, stub `handleAction`, and pass `onAction` into `buildColumnDefs`**

Inside `NeonGridWidget()`, replace this block (currently lines 17-19):

```jsx
  const gridConfig = window.CONFIG?.gridConfig ?? { columns: [] };
  const columnDefs = useMemo(() => buildColumnDefs(gridConfig.columns), [gridConfig]);
```

with:

```jsx
  const gridConfig = window.CONFIG?.gridConfig ?? { columns: [] };

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((text) => {
    setToast({ text, t: Date.now() });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const handleAction = useCallback((actionId, row) => {
    const label = ACTION_LABELS[actionId] || actionId;
    showToast(`${label} triggered for "${row?.headline ?? row?.id ?? 'row'}"`);
  }, [showToast]);

  const columnDefs = useMemo(
    () => buildColumnDefs(gridConfig.columns, { onAction: handleAction }),
    [gridConfig, handleAction]
  );
```

(This places the new toast/action hooks before the existing `[rowData, loading, error]` state declarations that follow — leave those, and everything else below them, unchanged.)

- [ ] **Step 6: Render the toast**

In the JSX returned by `NeonGridWidget`, the outermost element is a single `<div style={{ display: 'flex', flexDirection: 'column', ... }}>...</div>` (starts at line 84 in the current file). Add `<Toast toast={toast} />` as the last child inside that outer div, immediately before its closing `</div>` (i.e., as a sibling after the existing data-row `<div style={{ flex: 1, padding: '16px', ... }}>...</div>` block, which currently ends right before the outer div's closing tag).

- [ ] **Step 7: Add the demo actions column to `conf/widgets/neon-grid/default.json`**

In `conf/widgets/neon-grid/default.json`, the `columns` array currently ends with the `status` column entry. Add a new entry after it (the array becomes 5 columns total):

```json
    { "field": "status", "headerName": "Status", "type": "status", "width": 130, "sortable": true, "filter": true },
    { "field": "actions", "headerName": "", "type": "actions", "width": 90, "actions": [
      { "id": "copy", "label": "Copy", "icon": "copy" },
      { "id": "move", "label": "Move", "icon": "move" },
      { "id": "send", "label": "Send", "icon": "send" }
    ] }
```

(That first line is the existing `status` entry shown for context/placement — only the `actions` entry after it is new. Confirm the file is still valid JSON after editing — no trailing comma after the last array element.)

- [ ] **Step 8: Build both verify-able outputs**

Run: `cd src/react-widgets && npm run build`
Expected: `✓ built` with no errors. Confirm `public/js/react/neon-grid-widget.js` mtime updated (`ls -la public/js/react/neon-grid-widget.js` before/after, or just trust a fresh `✓ built` line — `print-query-board` is a separate bundle and is NOT touched by this task, no need to rebuild it).

Then validate the JSON config didn't break:
Run: `node -e "JSON.parse(require('fs').readFileSync('conf/widgets/neon-grid/default.json', 'utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 9: Manual verification (no test runner — this replaces the test step)**

Start the dev server in the background and confirm the demo data endpoint reflects the new column (the column is rendering-only, so the data endpoint's JSON response is unaffected — this just confirms the server boots and the page/bundle wire up):

```bash
PORT=$(grep '^PORT=' .env | cut -d= -f2)
APIKEY=$(grep '^NEON_EXT_APIKEY=' .env | cut -d= -f2)
npm run dev:legacy &> /tmp/neon-dev.log &
for i in $(seq 1 30); do curl -skf "https://localhost:$PORT/" >/dev/null 2>&1 && break; sleep 1; done
curl -sk "https://localhost:$PORT/js/react/neon-grid-widget.js" | grep -o "ActionsCellRenderer" | head -1
```

This server uses local HTTPS (mkcert certs, see `.env`'s `PROJECT_DOMAIN`) — the `-k` flag is required on every `curl` call against it or requests will fail/hang on cert verification, not just time out silently.
Expected: prints `ActionsCellRenderer`, confirming the rebuilt bundle actually contains the new renderer (catches a stale-build mistake that `npm run build` succeeding wouldn't).

If you have a way to drive a real browser (this repo has none configured — no Playwright/chromium-cli installed; installing one is out of scope for this task, don't add it), load `https://localhost:$PORT/widgets/neon-grid?demo=true&apikey=$APIKEY` and confirm:
- A new unlabeled "Actions" column (90px wide) appears after Status, showing a "⋮" button per row (3 actions configured → multi case).
- Clicking "⋮" opens a small dropdown listing Copy/Move/Send with icons.
- Clicking any one of them closes the dropdown and shows a bottom-center toast reading e.g. `Copy triggered for "<that row's headline>"`, which auto-dismisses after ~2.4s.

If browser-driving isn't available, state that explicitly in your report instead of guessing at the visual result — the `grep` check above plus a code re-read of Steps 1-6 against this plan's exact snippets is the fallback evidence.

Stop the dev server when done: `pkill -f "node --env-file=.env server.js"`

- [ ] **Step 10: Commit**

```bash
git add src/react-widgets/src/columns.jsx src/react-widgets/src/NeonGridWidget.jsx conf/widgets/neon-grid/default.json public/js/react/neon-grid-widget.js
git commit -m "Add configurable actions column (stub Copy/Move/Send) to neon-grid widget"
```

(Stage only these files — `public/js/react/neon-grid-widget.css` should be unchanged by this task since no CSS file was touched; confirm with `git status --short public/js/react/` before staging and only add the `.css` too if it actually shows as modified.)
