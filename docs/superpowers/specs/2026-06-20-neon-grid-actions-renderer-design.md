# Neon Grid Actions Renderer — Design Spec

**Date:** 2026-06-20
**Status:** Approved

## Summary

A new `type: 'actions'` AG-Grid column for the `neon-grid` widget. Each row can show one or more configured actions (Copy, Move, Send, etc. — id/label/icon). One action configured renders as a single icon button in the cell; two or more render as a "⋮" button that opens a small dropdown listing every configured action. For now, every action is a stub: clicking it shows a toast confirming which action fired on which row, with no real backend call. Real per-action behavior (actual copy/move/send against Neon) is deferred — this spec only builds the rendering/dispatch plumbing.

---

## Architecture

```
src/react-widgets/src/
  columns.jsx              ← +ActionsCellRenderer, +icon dictionary (copy/move/send/more), +'actions' case in buildColumnDefs
  NeonGridWidget.jsx        ← +local Toast component, +onAction stub dispatcher, threads onAction into buildColumnDefs

conf/widgets/neon-grid/
  default.json              ← +one actions column (Copy/Move/Send) for demo visibility
```

No backend/Fastify changes. No new files — both touched files already exist.

---

## Column Config Shape

Declared per-column in grid-config JSON, same place as every other column (`fields`/`columns` array), consistent with the existing `headline`/`status`/`badge`/`select` types:

```json
{
  "field": "actions",
  "headerName": "",
  "type": "actions",
  "width": 90,
  "actions": [
    { "id": "copy", "label": "Copy", "icon": "copy" },
    { "id": "move", "label": "Move", "icon": "move" },
    { "id": "send", "label": "Send", "icon": "send" }
  ]
}
```

`actions` is a plain array, no functions in JSON (matches how `metadataXpath`-driven editable columns already keep config declarative and behavior in code). `field` doesn't need to map to real row data — this column doesn't read `getByPath`, it only needs `data.id` (the row's `familyRef`) to dispatch on.

---

## Renderer (`columns.jsx`)

**`ActionsCellRenderer({ data, colDef })`** — reads `colDef.cellRendererParams.actions` (the configured array) and `colDef.cellRendererParams.onAction` (callback from the widget, see below).

- **One action:** render that action's icon as a plain button (`title` = label for tooltip). Click calls `onAction(action.id, data)` directly.
- **Two or more actions:** render a "⋮" (more) icon button. Click toggles an absolute-positioned dropdown panel (backdrop + popover, same structural pattern as `PriorityChip`/`DateChip` in `print-query-board/board.jsx` — a local `open` state + a click-outside backdrop, re-implemented here since it's a different file/widget, not imported). Each row in the panel shows icon + label; clicking one calls `onAction(action.id, data)` and closes the panel.

**Icon dictionary** — a small `ACTION_ICONS` map (`copy`, `move`, `send`, `more`) of inline-SVG glyph components defined in `columns.jsx`, next to the existing cell-renderer functions, matching the inline-SVG style already used by `RefreshIcon` in `NeonGridWidget.jsx`. `action.icon` (a string key) looks up this map; unknown keys fall back to a generic dot/glyph rather than rendering nothing.

`buildColumnDefs(columns, { onAction })` gains a second parameter (default `{}`) so existing call sites without actions columns don't need to change. The `'actions'` case in the switch passes `cellRenderer: ActionsCellRenderer`, `cellRendererParams: { actions: col.actions || [], onAction }`.

---

## Stub Dispatch + Toast (`NeonGridWidget.jsx`)

- New local `Toast` component (small, self-contained — not imported from `print-query-board`, this widget doesn't share components with that one). Single `toast` state (`{ text, t }` or `null`), auto-dismiss after ~2.4s via `setTimeout`, same lifecycle pattern as `print-query-board`'s existing `Toast`/`showToast`, just a fresh local instance.
- `handleAction = useCallback((actionId, row) => { showToast(`${labelFor(actionId)} triggered for "${row.headline ?? row.id}"`); }, [])` — stub only, no `updateMetadata`/Neon call. `labelFor` resolves the human label from whichever actions array is configured (or just title-cases the id as a fallback — doesn't need to be exact for a stub).
- Passed into `buildColumnDefs(gridConfig.columns, { onAction: handleAction })`.

This mirrors the existing `isNew`-clearing wiring already in this file (a callback threaded from the widget down into column config) rather than introducing a new pattern.

---

## Demo Wiring

Add the actions column (id `copy`/`move`/`send`, as shown above) to `conf/widgets/neon-grid/default.json` only. `print-grid.json` is untouched. Visible at `/widgets/neon-grid?demo=true`.

---

## Out of Scope (deferred)

- Real Copy/Move/Send behavior against Neon (metadata updates, node operations) — actions are stubs only.
- Per-action permissions/visibility rules (e.g. hide "Send" for certain workflow states).
- Keyboard navigation inside the dropdown panel.
- Reusing/extracting the dropdown-popover pattern into a shared component across widgets (left duplicated, consistent with how `PriorityChip`/`DateChip` already aren't shared either).
