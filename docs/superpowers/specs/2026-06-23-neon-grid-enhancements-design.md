# Neon Grid Widget Enhancements — Design Spec

**Date:** 2026-06-23  
**Status:** Approved

## Summary

Three independent enhancements to the `neon-grid` React widget:

1. **Actions Dropdown Bug Fix** — fix timing issue where dropdown closes immediately on click
2. **Type Column with Lucide Icons** — new renderer showing content type with icon + label
3. **Date/User Info Renderer** — new renderer showing creation/lock/update dates with user names, cached from articles response

All three are rendering-only changes to `src/react-widgets/`. No API or config changes except adding column definitions to `conf/widgets/neon-grid/default.json`.

---

## Part 1: Actions Dropdown Bug Fix

### Problem

When user clicks the "⋮" actions button to open the dropdown menu, the menu appears briefly and immediately closes. Root cause: the same click event that opens the dropdown also fires the backdrop's `onClick` handler (which closes it), due to event propagation and timing.

### Root Cause

Current code in `columns.jsx` line 173:
```jsx
<div onClick={e => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
```

Even with `stopPropagation()`, the click event that triggered the button's `onClick` (which called `setOpen(true)`) can propagate to the backdrop's `onClick` before React re-renders with the new state. The backdrop then immediately closes the dropdown.

### Solution

Change backdrop from `onClick` to `onMouseDown`. The event phases are distinct:
- `onMouseDown` fires *before* the click settles, capturing the initial interaction
- By the time React re-renders with `open=true`, the backdrop is already listening
- User's next interaction (actual click on backdrop) properly closes the dropdown

This avoids state flags, timers, and relies on native event-phase ordering.

### Implementation

File: `src/react-widgets/src/columns.jsx`

Change line 173 from:
```jsx
<div onClick={e => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
```

to:
```jsx
<div onMouseDown={e => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
```

No state changes needed. Existing `stopPropagation()` on button click remains in place.

---

## Part 2: Type Column with Lucide Icons

### Overview

New column renderer that displays content type with a visual icon from [lucide-react](https://lucide.dev). Icon selection is configurable via local mapping, not tied to Neon's type system.

### Dependencies

Add to `src/react-widgets/package.json`:
```json
"lucide-react": "^latest"
```

### Icon Mapping

Define local mapping in `columns.jsx` (user-maintained):
```js
import { Users, Image, Video, FileText, MoreHorizontal } from 'lucide-react';

const TYPE_ICONS = {
  article: Users,
  photo: Image,
  video: Video,
  document: FileText,
  // ... add more as needed
};
```

Fallback for unknown types: show text only (no icon).

### Renderer

New component `TypeIconRenderer` in `columns.jsx`:
- Takes `value` (type name)
- Looks up icon from `TYPE_ICONS`
- Renders in a chip: icon (left, 14px) + type label (right, text)
- Inline styles only, matches existing badge renderer styling
- If type is unknown or missing, render text-only fallback

### Column Config

Add to `conf/widgets/neon-grid/default.json`:
```json
{ "field": "type", "headerName": "Type", "type": "typeIcon", "width": 100, "sortable": true, "filter": true }
```

The `type: 'typeIcon'` case in `buildColumnDefs` switch wires to `TypeIconRenderer`.

### Success Criteria

- Lucide icons render inline (no external images, no extra HTTP requests)
- Icon + label fit in 100px column, no wrapping
- Unknown types degrade to text-only (no errors)
- Matches visual style of existing badge renderers

---

## Part 3: Date/User Info Renderer

### Overview

New column renderer showing a date with the user who performed the action. Replaces basic date-only columns with context: "when this happened and who did it."

Three use cases, same renderer:
- **Creation:** `versionInfo.createFamilyTime` + `versionInfo.createFamilyUserRef.userId`
- **Lock Info:** `lockInfos.USER.locked` (timestamp) + `lockInfos.USER.userUpdateRef.userId` (only if lock present)
- **Last Update:** `versionInfo.updateVersionTime` + `versionInfo.updateVersionUserRef.userId`

### User Caching

User data (name lookup) comes from articles endpoint response. On widget mount:
1. Extract all unique user IDs from articles' `versionInfo`, `lockInfos`
2. Build map: `{ userId → userName }`
3. Pass cache to `buildColumnDefs` via second parameter (already wired for `onAction`)

Missing users: fall back to user ID (e.g., "john-123" if "john" not in cache).

### Renderer

New component `DateUserRenderer` in `columns.jsx`:
- Takes `value` (timestamp), `colDef.cellRendererParams` (userId, userAliasField, userCache)
- Format date: locale-aware (user's browser locale), compact format
- Show user name from cache (or ID if missing)
- Layout: date on top (bold, 13px), user name below (muted, 11px), stacked vertically
- Inline styles only
- Handle missing data gracefully (no errors, show "—")

### Lock Info Handling

Locks column is optional—only renders if `lockInfos?.USER?.locked` exists. No special behavior; same renderer as other dates, just with a different field path in config.

### Column Config

Three new entries in `conf/widgets/neon-grid/default.json`:

```json
{
  "field": "versionInfo.createFamilyTime",
  "headerName": "Created",
  "type": "dateUser",
  "width": 140,
  "sortable": true,
  "userField": "versionInfo.createFamilyUserRef.userId",
  "userAliasField": "versionInfo.createFamilyUserRef.alias"
},
{
  "field": "lockInfos.USER.locked",
  "headerName": "Locked",
  "type": "dateUser",
  "width": 140,
  "sortable": false,
  "userField": "lockInfos.USER.userUpdateRef.userId",
  "userAliasField": "lockInfos.USER.userUpdateRef.userName"
},
{
  "field": "versionInfo.updateVersionTime",
  "headerName": "Updated",
  "type": "dateUser",
  "width": 140,
  "sortable": true,
  "userField": "versionInfo.updateVersionUserRef.userId",
  "userAliasField": "versionInfo.updateVersionUserRef.alias"
}
```

### User Cache Construction

In `NeonGridWidget.jsx`, before `buildColumnDefs`:

```js
const userCache = useMemo(() => {
  const map = {};
  rowData.forEach(row => {
    // Extract from creation
    if (row.versionInfo?.createFamilyUserRef?.userId) {
      map[row.versionInfo.createFamilyUserRef.userId] = 
        row.versionInfo.createFamilyUserRef.alias || row.versionInfo.createFamilyUserRef.userId;
    }
    // Extract from lock (if present)
    if (row.lockInfos?.USER?.userUpdateRef?.userId) {
      map[row.lockInfos.USER.userUpdateRef.userId] = 
        row.lockInfos.USER.userUpdateRef.userName || row.lockInfos.USER.userUpdateRef.userId;
    }
    // Extract from update
    if (row.versionInfo?.updateVersionUserRef?.userId) {
      map[row.versionInfo.updateVersionUserRef.userId] = 
        row.versionInfo.updateVersionUserRef.alias || row.versionInfo.updateVersionUserRef.userId;
    }
  });
  return map;
}, [rowData]);
```

Then pass to `buildColumnDefs`:
```js
const columnDefs = useMemo(
  () => buildColumnDefs(gridConfig.columns, { onAction: handleAction, userCache }),
  [gridConfig, handleAction, userCache]
);
```

### Success Criteria

- Date formatted in user's locale, human-readable
- User name shown (or ID fallback)
- Lock column only renders if lock exists (no empty cells)
- No console errors on missing user data
- User cache built once per data refresh (not per render)

---

## Implementation Order

1. **Bug Fix** — 1 line change to `columns.jsx` (backdrop event)
2. **Type Renderer** — add lucide import, `TYPE_ICONS` map, `TypeIconRenderer`, switch case
3. **Date/User Renderer** — add user cache logic to `NeonGridWidget.jsx`, `DateUserRenderer`, switch case
4. **Config** — update `default.json` with all three column definitions
5. **Build & Verify** — `npm run build`, validate JSON, manual browser test

Total files modified:
- `src/react-widgets/src/columns.jsx`
- `src/react-widgets/src/NeonGridWidget.jsx`
- `src/react-widgets/package.json`
- `conf/widgets/neon-grid/default.json`
- `public/js/react/neon-grid-widget.js` (generated)

---

## Out of Scope

- Real backend integration for actions (stubs only, unchanged from prior work)
- Export columns to CSV/Excel
- Custom date format per column
- User profile popover on click
- Pagination controls
- Column visibility toggles

These are logged as future enhancements.
