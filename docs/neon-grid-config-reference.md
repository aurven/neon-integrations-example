# Neon Grid — Config Reference

This document is the single source of truth for every configuration option supported by the `neon-grid` widget.  
Config files live in `conf/widgets/neon-grid/` and are loaded at runtime via `window.CONFIG.gridConfig`.

---

## Table of Contents

1. [Top-level keys](#1-top-level-keys)
2. [locales](#2-locales)
3. [fields](#3-fields)
4. [icons registry](#4-icons-registry)
5. [typeIcons registry](#5-typeicons-registry)
6. [actions](#6-actions)
7. [rowColorRules](#7-rowcolorrules)
8. [Condition / showWhen syntax](#8-condition--showwhen-syntax)
9. [columns — universal properties](#9-columns--universal-properties)
10. [Column types](#10-column-types)
    - [status](#101-status)
    - [headline](#102-headline)
    - [title](#103-title-new)
    - [date](#104-date)
    - [badge](#105-badge)
    - [select](#106-select)
    - [typeIcon](#107-typeicon)
    - [dateUser](#108-dateuser)
    - [publication](#109-publication)
    - [info](#1010-info-new)
    - [actions](#1011-actions)
11. [Full annotated example — adn-v2.json](#11-full-annotated-example--adn-v2json)

---

## 1. Top-level keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `title` | string | yes | Widget heading shown in the toolbar bar. |
| `demoData` | string | no | Filename (relative to the demo-data folder) to load when `window.CONFIG.demo` is `true`. Skips real API calls. |
| `pollIntervalMs` | number | yes | Polling interval in milliseconds. The widget re-fetches articles on this cadence and diffs the result against the previous snapshot; new rows receive the `isNew` flag and a NEW badge. |
| `workfolderTypes` | string[] | no | Array of Neon content-type identifiers that are eligible as move-to destinations when the `moveToWorkspace` action is used. Omitting this key means no workspace picker filter is applied. |
| `locales` | object | no | UI string overrides. See [§ 2 locales](#2-locales). When omitted, English defaults are used. |
| `fields` | object[] | yes | Data-mapping declarations. See [§ 3 fields](#3-fields). |
| `icons` | object | no | Icon ID → Lucide component name registry. See [§ 4 icons registry](#4-icons-registry). |
| `typeIcons` | object | no | Content-type → icon ID registry. See [§ 5 typeIcons registry](#5-typeicons-registry). |
| `actions` | object[] | no | Grid-level action definitions used by the `actions` column type. See [§ 6 actions](#6-actions). |
| `rowColorRules` | object[] | no | Rules that colour entire rows based on row data. See [§ 7 rowColorRules](#7-rowcolorrules). |
| `columns` | object[] | yes | Column definitions rendered by AG Grid. See [§ 9 columns](#9-columns--universal-properties). |

---

## 2. locales

The `locales` object allows all user-facing strings to be overridden, enabling full internationalisation without code changes.  
Every key is optional. When absent the English default is used.

| Key | English default | Where it appears |
|-----|----------------|------------------|
| `loading` | `"Loading articles…"` | Full-height loading state shown while the first fetch is in progress. |
| `refresh` | `"Refresh"` | Label on the manual-refresh button in the toolbar. |
| `notPublished` | `"Not published"` | Tooltip body for a `publication` icon when the channel has never been published. |
| `noWorkfolders` | `"No workfolders available"` | Empty-state message inside the workspace picker sub-panel. |
| `actions` | `"Actions"` | Tooltip on the `⋯` button in the `actions` column when multiple actions are available. |
| `selectWorkspace` | `"Select workspace"` | Header inside the workspace picker sub-panel. |

**Example (Italian):**

```json
"locales": {
  "loading":         "Caricamento articoli…",
  "refresh":         "Aggiorna",
  "notPublished":    "Non pubblicato",
  "noWorkfolders":   "Nessuna cartella disponibile",
  "actions":         "Azioni",
  "selectWorkspace": "Seleziona cartella"
}
```

---

## 3. fields

The `fields` array maps raw Neon API properties to the flat keys used by column renderers.

Each entry is either a **source mapping** (reads a path from the API payload) or a **derived field** (computed by the widget from the payload).

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | The key name available to column `field` definitions. |
| `source` | string | Dot-notation path into the raw API row object. Mutually exclusive with `derived`. |
| `derived` | string | Named derivation computed internally. Mutually exclusive with `source`. |

**Available `derived` values:**

| Value | Description |
|-------|-------------|
| `typeLabel` | Human-readable content type label. |
| `status` | Workflow status label string. |
| `statusColor` | Hex colour string for the current workflow status. |
| `printPriority` | Resolved print priority value from metadata. |
| `issueDate` | Resolved print issue date from metadata. |

**Example:**

```json
"fields": [
  { "key": "headline",     "source": "title" },
  { "key": "summary",      "source": "summary" },
  { "key": "type",         "derived": "typeLabel" },
  { "key": "status",       "derived": "status" },
  { "key": "statusColor",  "derived": "statusColor" },
  { "key": "versionInfo",  "source": "versionInfo" },
  { "key": "lockInfos",    "source": "lockInfos" },
  { "key": "publishInfos", "source": "publishInfos" },
  { "key": "workFolder",   "source": "metadataGroups.eom.sys_attributes_json.workFolder" }
]
```

---

## 4. icons registry

The `icons` object maps short icon IDs (used throughout the rest of the config) to Lucide React component names (resolved at runtime).

```json
"icons": {
  "<id>": "<LucideComponentName>"
}
```

Icon IDs are arbitrary strings — choose names that describe the semantic meaning in your context (`"rss"`, `"monitor"`, `"file"`, etc.).  
The Lucide name must exactly match one of the components available in the widget bundle:

| Lucide component | Description |
|-----------------|-------------|
| `FileText` | Generic article / document |
| `Image` | Photo or image content |
| `Video` | Video content |
| `Mic` | Audio content |
| `Copy` | Copy / duplicate action |
| `ArrowRight` | Move or navigate forward |
| `ArrowLeft` | Navigate back (used internally in workspace picker) |
| `Send` | Send / distribute action |
| `Zap` | Flash / breaking news content type |
| `Globe` | Web / global publication channel |
| `Trophy` | Sports publication channel |
| `Rocket` | Next Frontier or featured publication channel |
| `Rss` | Wire / RSS publication channel |
| `Monitor` | Web / monitor publication channel |
| `MoreHorizontal` | Overflow menu button (used internally) |
| `ChevronRight` | Sub-panel drill-in indicator (used internally) |
| `Lock` | Lock indicator for `dateUser` icon mode |

> Icons listed as "used internally" are available for config use but are also rendered by the widget itself; avoid reusing them for unrelated semantic purposes.

**Example:**

```json
"icons": {
  "file":    "FileText",
  "image":   "Image",
  "video":   "Video",
  "mic":     "Mic",
  "zap":     "Zap",
  "rss":     "Rss",
  "monitor": "Monitor",
  "copy":    "Copy",
  "move":    "ArrowRight",
  "send":    "Send"
}
```

---

## 5. typeIcons registry

`typeIcons` maps Neon content-type identifiers (lower-cased) to icon IDs defined in the [`icons` registry](#4-icons-registry). Used by the [`typeIcon`](#107-typeicon) column renderer.

```json
"typeIcons": {
  "<contentType>": "<iconId>"
}
```

Content-type keys are matched case-insensitively. Any type not listed falls back to a plain text label.

**Example:**

```json
"typeIcons": {
  "article":       "file",
  "article/flash": "zap",
  "gallery":       "image",
  "photo":         "image",
  "video":         "video",
  "audio":         "mic"
}
```

---

## 6. actions

The `actions` array defines all workspace actions available to the grid. The [`actions` column type](#1011-actions) reads this array and renders the appropriate buttons per row.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | Unique action identifier. Passed to the `onAction` callback. |
| `label` | string | yes | Human-readable label shown in the menu or as a tooltip on single-action rows. |
| `icon` | string | yes | Icon ID (key in the [`icons` registry](#4-icons-registry)) rendered next to the label. |
| `actionType` | string | no | When set to `"moveToWorkspace"`, clicking the action opens the workspace picker sub-panel instead of calling `onAction` directly. |
| `workspaceFilter` | string | no | When `actionType` is `"moveToWorkspace"`, restricts the workspace picker to workfolders whose `workspace` property equals this value. Omit to show all workfolders. |
| `showWhen` | condition | no | A [condition object](#8-condition--showwhen-syntax) evaluated against each row. When the condition is falsy the action is hidden for that row. When omitted the action is always visible. |

**Behaviour:**

- If a row has exactly **one** visible action and it is not `moveToWorkspace`, a single icon button is shown directly in the cell (no dropdown).
- If a row has **multiple** visible actions (or the single action is `moveToWorkspace`), a `⋯` button opens a dropdown menu.
- Rows with **zero** visible actions render an empty cell.

**Example:**

```json
"actions": [
  {
    "id": "copy-wire",
    "label": "Copia in Wire",
    "icon": "rss",
    "actionType": "moveToWorkspace",
    "workspaceFilter": "Wire",
    "showWhen": { "field": "workFolder", "op": "contains", "value": "/Web" }
  },
  {
    "id": "copy-web",
    "label": "Copia in Web",
    "icon": "monitor",
    "actionType": "moveToWorkspace",
    "workspaceFilter": "Web",
    "showWhen": { "field": "workFolder", "op": "contains", "value": "/Wire" }
  }
]
```

---

## 7. rowColorRules

`rowColorRules` is an array of rules evaluated against each row in order. The first matching rule is applied; subsequent rules are ignored.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `when` | condition | yes | A [condition object](#8-condition--showwhen-syntax) evaluated against the row data. |
| `background` | string | yes | CSS colour value applied as the row background when the condition matches. |
| `label` | string | no | Semantic label for the rule (used for documentation / debugging; not rendered in the UI). |

**Example:**

```json
"rowColorRules": [
  {
    "when": { "field": "type", "op": "eq", "value": "article/flash" },
    "background": "#fef9c3",
    "label": "flash"
  },
  {
    "when": { "field": "lockInfos.USER", "op": "exists" },
    "background": "#ebebeb",
    "label": "locked"
  }
]
```

---

## 8. Condition / showWhen syntax

A condition object is used in `rowColorRules[].when`, `actions[].showWhen`, and `info` column icon entries.

```json
{
  "field": "<dot.notation.path>",
  "op":    "<operator>",
  "value": "<comparison value>"
}
```

| Property | Type | Description |
|----------|------|-------------|
| `field` | string | Dot-notation path into the row data object (e.g. `"workFolder"`, `"lockInfos.USER"`, `"publishInfos.Wire.liveFirstPublicationDate"`). Nested resolution stops at `null` or `undefined`. |
| `op` | string | Comparison operator. See table below. |
| `value` | any | The right-hand side value for comparison operators. Not used by `exists` / `notExists`. |

**Operators:**

| Operator | Description | `value` required? |
|----------|-------------|:-----------------:|
| `exists` | True when the field resolves to a non-null, non-empty-string value. | No |
| `notExists` | True when the field is null, undefined, or empty string. | No |
| `eq` | True when `String(fieldValue) === String(value)`. | Yes |
| `neq` | True when `String(fieldValue) !== String(value)`. | Yes |
| `contains` | True when `String(fieldValue)` includes `String(value)`. | Yes |
| `in` | True when `value` is an array and `fieldValue` is one of its elements. | Yes (array) |
| `gt` | True when `fieldValue > value` (numeric). | Yes |
| `lt` | True when `fieldValue < value` (numeric). | Yes |

---

## 9. columns — universal properties

Every column definition, regardless of `type`, supports the following base properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `field` | string | — | Dot-notation path into the row data object, or a semantic key (e.g. `"actions"`). Maps to AG Grid `field`. |
| `headerName` | string | `""` | Column header label. May be an empty string (common for the `actions` column). |
| `type` | string | — | Column renderer to use. See [§ 10 Column types](#10-column-types). |
| `width` | number | — | Fixed column width in pixels. Mutually exclusive with `flex`. |
| `flex` | number | — | Flex grow factor. The column takes up proportional space within remaining width. Mutually exclusive with `width`. |
| `minWidth` | number | — | Minimum column width in pixels (applies when using `flex`). |
| `sortable` | boolean | `false` | Enables click-to-sort on the column header. |
| `filter` | boolean | `false` | Enables AG Grid column filter. |
| `editable` | boolean | `false` | Enables in-cell editing. Supported by `date`, `select`, and `badge` (with limitations). |
| `resizable` | boolean | `true` | Allows the user to resize the column by dragging the header edge. |

---

## 10. Column types

### 10.1 status

Renders the article's workflow status. Two visual modes are supported.

**Additional properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `display` | string | `undefined` | When set to `"dot"`, renders a small coloured circle (12 px) with a balloon tooltip on hover. Without this property (or any other value), renders a coloured pill badge with the status label. |

The colour is resolved from the `statusColor` derived field in `fields`.

**Example:**

```json
{ "field": "status", "headerName": "Stato", "type": "status", "width": 20, "sortable": true, "filter": true, "display": "dot" }
```

---

### 10.2 headline

Renders the article title and optional summary in a two-line stacked layout.

- Title: 13 px, semi-bold, single-line ellipsis overflow.
- Summary (when present): 11 px, muted, single-line ellipsis overflow.
- When `data.isNew` is `true` (newly appeared row since last poll), a blue `NEW` pill badge appears above the title.

No additional properties beyond the universal set.

**Example:**

```json
{ "field": "headline", "headerName": "Title", "type": "headline", "flex": 5, "minWidth": 260, "sortable": true, "filter": true }
```

---

### 10.3 title *(new)*

A compact headline-only renderer. Use when vertical space is tight or a summary column is not needed.

- Headline: 13 px, semi-bold, **2-line `-webkit-line-clamp`** (text wraps to a second line before clipping). This is the key difference from `headline`, which single-line-clips.
- No summary is shown, even if present in the data.
- When `data.isNew` is `true`, the same blue `NEW` pill badge appears above the headline.

No additional properties beyond the universal set.

**Example:**

```json
{ "field": "headline", "headerName": "Titolo", "type": "title", "flex": 4, "minWidth": 200, "sortable": true, "filter": true }
```

---

### 10.4 date

Renders a date/time value using the JavaScript `Intl` API.

**Additional properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dateFormat` | string | `undefined` | When set to `"ddmmyyyy"`, applies a fixed `dd/mm/yyyy` formatter for compact print dates (e.g. `"31/12/2025"`). All other values use the `Intl` formatter. |
| `locale` | string | browser default | BCP 47 locale tag (e.g. `"it-IT"`, `"en-GB"`) passed to `Date.toLocaleString()`. |
| `dateFormatOptions` | object | `{ day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }` | An `Intl.DateTimeFormat` options object. Ignored when `dateFormat: "ddmmyyyy"` is set. |
| `editable` | boolean | `false` | Enables inline date editing via AG Grid's `agDateStringCellEditor`. |
| `metadataXpath` | string | — | XPath used to write back to Neon metadata when the cell is edited. Requires `editable: true`. |
| `isDate` | boolean | `false` | When `true`, tells the metadata writer that the value is a date type (affects XML serialisation). Requires `metadataXpath`. |

**Example:**

```json
{ "field": "issueDate", "headerName": "Issue Date", "type": "date", "dateFormat": "ddmmyyyy",
  "width": 140, "editable": true, "metadataXpath": "/ObjectMetadata/DistributionChannels/Print/PrintIssueDate", "isDate": true }
```

---

### 10.5 badge

Renders a coloured pill badge driven by a value-to-option lookup. When `options` is empty or omitted the cell falls back to a plain type-chip renderer (grey pill with the raw value).

**Additional properties:**

| Property | Type | Description |
|----------|------|-------------|
| `options` | `{ value, label, color }[]` | Array of option objects. `value`: the raw cell value (string or number). `label`: display string. `color`: CSS hex colour for the pill background. When no option matches, the cell shows `—`. |

**Example:**

```json
{ "field": "type", "headerName": "Type", "type": "badge", "width": 130,
  "options": [
    { "value": "article",       "label": "Article",   "color": "#2563eb" },
    { "value": "article/flash", "label": "Flash",     "color": "#d97706" }
  ] }
```

---

### 10.6 select

An editable variant of `badge`. Renders like `badge` in read mode; clicking the cell opens a native AG Grid dropdown (`agSelectCellEditor`) populated from `options`.

**Additional properties (superset of `badge`):**

| Property | Type | Description |
|----------|------|-------------|
| `options` | `{ value, label, color }[]` | Same as `badge`. Also drives the dropdown values. |
| `metadataXpath` | string | XPath used to write the selected value back to Neon metadata on change. |
| `isDate` | boolean | When `true`, tells the metadata writer that the value is a date type. |
| `editable` | boolean | Must be `true` for the dropdown to be active. |

**Example:**

```json
{ "field": "printSection", "headerName": "Print Section", "type": "select",
  "width": 160, "editable": true,
  "metadataXpath": "/ObjectMetadata/DistributionChannels/Print/PrintSection",
  "options": [
    { "value": "/Product/Front",    "label": "Front Page", "color": "#0A2EE6" },
    { "value": "/Product/World",    "label": "World",      "color": "#2563eb" },
    { "value": "/Product/Politics", "label": "Politics",   "color": "#7c3aed" }
  ] }
```

---

### 10.7 typeIcon

Renders the content type resolved through `typeIcons` → `icons`. Supports two visual modes.

**Additional properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `iconOnly` | boolean | `false` | When `false` (default), renders a grey pill badge containing the icon and the type label text. When `true`, renders only the icon (no text) with a balloon tooltip showing the type label on hover. |

**Example:**

```json
{ "field": "type", "headerName": "Tipo", "type": "typeIcon", "width": 100, "sortable": true, "filter": true, "iconOnly": false }
```

---

### 10.8 dateUser

Renders a date/time alongside the user who performed the action (the "lock" or "create" or "update" user). Supports two display modes.

**Additional properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `userField` | string | — | Dot-notation path to the user ID in the row data. The ID is looked up in the widget's user cache (resolved from other rows). |
| `userAliasField` | string | — | Dot-notation path to the user display name / alias. Shown when the ID is not in the cache. |
| `locale` | string | browser default | BCP 47 locale tag for date formatting (e.g. `"it-IT"`). |
| `dateFormatOptions` | object | `{ day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }` | `Intl.DateTimeFormat` options object. |
| `display` | string | `undefined` | When set to `"icon"`, renders a **Lock icon** (15 px, grey) with a balloon tooltip showing the date (bold) and user name (indigo) on hover. The column height is fixed (no `autoHeight`). When omitted, renders date on line 1 and user name on line 2 in a stacked layout. |

**Example — default stacked mode:**

```json
{ "field": "versionInfo.updateVersionTime", "headerName": "Ultima Modifica", "type": "dateUser",
  "width": 160, "sortable": true, "locale": "it-IT",
  "userField": "versionInfo.updateVersionUserRef.userId",
  "userAliasField": "versionInfo.updateVersionUserRef.alias" }
```

**Example — icon mode (new):**

```json
{ "field": "lockInfos.USER.locked", "headerName": "Bloccato", "type": "dateUser",
  "width": 55, "sortable": false, "display": "icon", "locale": "it-IT",
  "userField": "lockInfos.USER.userUpdateRef.userId",
  "userAliasField": "lockInfos.USER.userUpdateRef.userName" }
```

---

### 10.9 publication

Renders one icon per publication channel. Each icon is always shown: blue (`#2563eb`) when the article is published to that channel, grey (`#d1d0d8`) when not. Hovering shows a balloon tooltip with the channel name, first publication date, and user alias.

**Additional properties:**

| Property | Type | Description |
|----------|------|-------------|
| `publications` | `{ id, icon, label }[]` | Ordered list of publication channels to display. `id`: matches the key in `publishInfos` from the API. `icon`: icon ID from the [`icons` registry](#4-icons-registry). `label`: shown in the tooltip header. |

**Example:**

```json
{ "field": "publishInfos", "headerName": "Pubblicato", "type": "publication", "width": 80,
  "publications": [
    { "id": "Wire", "icon": "rss",     "label": "Wire" },
    { "id": "Web",  "icon": "monitor", "label": "Web" }
  ] }
```

---

### 10.10 info *(new)*

Renders a row of icons that appear only when their associated conditions are true. All visible icons render in blue (`#2563eb`). A balloon tooltip with the icon's label appears on hover.

Use this type for at-a-glance indicators that replace a full `publication` column when you only need to confirm presence (not absence) of a publication event.

**Additional properties:**

| Property | Type | Description |
|----------|------|-------------|
| `icons` | `{ icon, label, condition }[]` | Ordered list of icon definitions. `icon`: icon ID from the [`icons` registry](#4-icons-registry). `label`: tooltip text (shown only when the icon is visible). `condition`: a [condition object](#8-condition--showwhen-syntax) — the icon is rendered only when the condition is true. When `condition` is omitted the icon is always shown. |

**Differences from `publication`:**

- `info` hides icons entirely when the condition is false (no grey placeholder). `publication` always shows all icons (grey when unpublished).
- `info` icons are driven by arbitrary conditions; `publication` is keyed on `publishInfos.<id>`.

**Example:**

```json
{ "field": "publishInfos", "headerName": "Info", "type": "info", "width": 70,
  "icons": [
    { "icon": "rss",     "label": "Wire", "condition": { "field": "publishInfos.Wire.liveFirstPublicationDate", "op": "exists" } },
    { "icon": "monitor", "label": "Web",  "condition": { "field": "publishInfos.Web.liveFirstPublicationDate",  "op": "exists" } }
  ] }
```

---

### 10.11 actions

Renders the action button(s) for the row, driven by the top-level [`actions`](#6-actions) array filtered through each action's `showWhen` condition.

No additional column-level properties are needed — all configuration is on the grid-level `actions` array.

**Example:**

```json
{ "field": "actions", "headerName": "", "type": "actions", "width": 90 }
```

---

## 11. Full annotated example — adn-v2.json

The following is `conf/widgets/neon-grid/adn-v2.json` reproduced with inline commentary explaining each feature used.

```jsonc
{
  // Widget toolbar title (Italian)
  "title": "Articoli",

  // Load demo data from this file when window.CONFIG.demo is true
  "demoData": "adn-search-results.json",

  // Re-fetch every 20 seconds; new rows get the isNew flag → NEW badge
  "pollIntervalMs": 20000,

  // Content types eligible as move-to targets in the workspace picker
  "workfolderTypes": [
    "article", "wirestory", "wirestory/extcontributions", "wirestory/afpwirestory",
    "article/take", "article/longform", "article/poll", "hero"
  ],

  // Full Italian locale override for all UI strings
  "locales": {
    "loading":         "Caricamento articoli…",
    "refresh":         "Aggiorna",
    "notPublished":    "Non pubblicato",
    "noWorkfolders":   "Nessuna cartella disponibile",
    "actions":         "Azioni",
    "selectWorkspace": "Seleziona cartella"
  },

  // Data field mappings from the Neon API payload
  "fields": [
    { "key": "headline",     "source": "title" },
    { "key": "summary",      "source": "summary" },
    { "key": "type",         "derived": "typeLabel" },
    { "key": "date",         "source": "updateTs" },
    { "key": "status",       "derived": "status" },
    { "key": "statusColor",  "derived": "statusColor" },
    { "key": "versionInfo",  "source": "versionInfo" },
    { "key": "lockInfos",    "source": "lockInfos" },
    { "key": "publishInfos", "source": "publishInfos" },
    // workFolder is deeply nested; dot-notation resolves it
    { "key": "workFolder",   "source": "metadataGroups.eom.sys_attributes_json.workFolder" }
  ],

  // Icon ID → Lucide component name. IDs are referenced by columns and actions below.
  "icons": {
    "file":    "FileText",
    "image":   "Image",
    "video":   "Video",
    "mic":     "Mic",
    "zap":     "Zap",
    "rss":     "Rss",     // Used for Wire channel
    "monitor": "Monitor", // Used for Web channel
    "copy":    "Copy",
    "move":    "ArrowRight",
    "send":    "Send"
  },

  // Maps content types (lower-cased) to icon IDs above
  "typeIcons": {
    "article":       "file",
    "article/flash": "zap",
    "gallery":       "image",
    "photo":         "image",
    "video":         "video",
    "audio":         "mic"
  },

  // Actions shown in the actions column; both use moveToWorkspace (workspace picker)
  "actions": [
    {
      "id": "copy-wire",
      "label": "Copia in Wire",
      "icon": "rss",
      "actionType": "moveToWorkspace",   // Opens the workspace sub-panel instead of direct callback
      "workspaceFilter": "Wire",          // Picker shows only Wire workfolders
      "showWhen": { "field": "workFolder", "op": "contains", "value": "/Web" }
      // Only show this action for articles currently in a Web workfolder
    },
    {
      "id": "copy-web",
      "label": "Copia in Web",
      "icon": "monitor",
      "actionType": "moveToWorkspace",
      "workspaceFilter": "Web",
      "showWhen": { "field": "workFolder", "op": "contains", "value": "/Wire" }
      // Only show this action for articles currently in a Wire workfolder
    }
  ],

  // Highlight flash articles with a yellow background
  "rowColorRules": [
    {
      "when": { "field": "type", "op": "eq", "value": "article/flash" },
      "background": "#fef9c3",
      "label": "flash"
    }
  ],

  "columns": [
    // Status dot — compact coloured dot with balloon tooltip; no text
    {
      "field": "status", "headerName": "Stato", "type": "status",
      "width": 20, "sortable": true, "filter": true,
      "display": "dot"          // Key prop: renders dot instead of text pill
    },

    // Title column (NEW in v2) — 2-line clamp, no summary row
    {
      "field": "headline", "headerName": "Titolo", "type": "title",
      "flex": 4, "minWidth": 200, "sortable": true, "filter": true
      // type:"title" wraps to 2 lines; type:"headline" would single-line clip + show summary
    },

    // Type icon — pill with icon + type label text
    {
      "field": "type", "headerName": "Tipo", "type": "typeIcon",
      "width": 100, "sortable": true, "filter": true,
      "iconOnly": false  // false = icon + label pill; true = icon only with tooltip
    },

    // Info column (NEW in v2) — icons appear only when condition is true (blue, no grey placeholder)
    {
      "field": "publishInfos", "headerName": "Info", "type": "info", "width": 70,
      "icons": [
        { "icon": "rss",     "label": "Wire", "condition": { "field": "publishInfos.Wire.liveFirstPublicationDate", "op": "exists" } },
        { "icon": "monitor", "label": "Web",  "condition": { "field": "publishInfos.Web.liveFirstPublicationDate",  "op": "exists" } }
        // Icons only render when the channel has a liveFirstPublicationDate
      ]
    },

    // dateUser — stacked date + user name, Italian locale
    {
      "field": "versionInfo.createFamilyTime", "headerName": "Creato", "type": "dateUser",
      "width": 160, "sortable": true,
      "locale": "it-IT",                          // BCP 47 locale for date formatting
      "userField": "versionInfo.createFamilyUserRef.userId",
      "userAliasField": "versionInfo.createFamilyUserRef.alias"
    },

    // dateUser icon mode (NEW in v2) — Lock icon with balloon tooltip, compact width
    {
      "field": "lockInfos.USER.locked", "headerName": "Bloccato", "type": "dateUser",
      "width": 55, "sortable": false,
      "display": "icon",                          // Key prop: renders Lock icon instead of stacked text
      "locale": "it-IT",
      "userField": "lockInfos.USER.userUpdateRef.userId",
      "userAliasField": "lockInfos.USER.userUpdateRef.userName"
    },

    // dateUser — last modified, stacked mode, Italian locale
    {
      "field": "versionInfo.updateVersionTime", "headerName": "Ultima Modifica", "type": "dateUser",
      "width": 160, "sortable": true,
      "locale": "it-IT",
      "userField": "versionInfo.updateVersionUserRef.userId",
      "userAliasField": "versionInfo.updateVersionUserRef.alias"
    },

    // Actions column — reads from top-level "actions" array; no extra column props needed
    { "field": "actions", "headerName": "", "type": "actions", "width": 90 }
  ]
}
```

---

## Appendix: Quick-reference type comparison

| Type | Shows summary? | Always shows icon? | Editable? | NEW badge? |
|------|:--------------:|:------------------:|:---------:|:----------:|
| `headline` | Yes (1-line ellipsis) | — | No | Yes |
| `title` | No | — | No | Yes |
| `status` | — | — | No | — |
| `date` | — | — | Optional | — |
| `badge` | — | — | No | — |
| `select` | — | — | Yes | — |
| `typeIcon` | Tooltip | Yes | No | — |
| `dateUser` | User name | No (icon mode: Lock) | No | — |
| `publication` | Tooltip | Yes (grey when unpub.) | No | — |
| `info` | Tooltip | Hidden when false | No | — |
| `actions` | — | — | — | — |
