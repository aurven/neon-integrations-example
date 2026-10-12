# Taxonomy Builder: bulk category and tag families (Design)

**Date:** 2026-10-12
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:**
- `docs/superpowers/specs/2026-10-12-site-builder-design.md`: same outline rules, preview/create flow, report and widget patterns
- `docs/superpowers/specs/2026-09-30-multi-neon-env-design.md`: per-request env

## Goal

Editors paste two outlines, one for category families and their category trees, one for tag families and their tags. The hub creates them in the request's Neon environment and merges with what already exists, so running it again is safe. A React widget, "Taxonomy Builder", drives the flow through a side-effect-free preview endpoint and a create endpoint.

## Non-goals

- Updating, renaming, moving or deleting existing categories or tags. Matching items are only reused.
- Category or tag metadata beyond what the reference payloads carry. Descriptions are always `""`.
- Creating a category tree in one call through `CategoryCreator.children`. Each node is created separately, to match the Neon UI payloads and allow per-item merge and reporting.
- Publishing or replication. Admin and mastership endpoints are excluded.

## 1. Input

The request body, from the widget or a direct API call:

```json
{ "categories": "<outline>", "tags": "<outline>", "defaultLanguage": "en-uk" }
```

- `categories` and `tags` must be strings; either may be empty, but not both.
- `defaultLanguage` is an optional non-empty string. It defaults to `"en-uk"` and applies only to category families that will be created.

### Outline rules

These are the same rules as the Site Builder.

- **What's shared:** only the indentation and tree logic is extracted, to `src/helpers/outline/parse-indented.js`. It turns text into `{ line, text, depth, parentIndex }` entries plus indentation errors. The noun used in the first-line error is a parameter: the Site Builder keeps `first section cannot be indented`, and the taxonomy uses `first line cannot be indented`.
- **What each builder keeps:** naming (Site Builder: slugs; taxonomy: raw trimmed text), name validation and duplicate checks.

- `\r` is stripped and blank lines are ignored. A tab counts as 2 spaces.
- **Indentation:**
  - A line wider than the previous line is its child (depth + 1).
  - A line as wide as the previous line is a sibling.
  - A narrower line must line up with an open level exactly, or it is an error: `line N: indentation does not match any parent level`.
  - The first line cannot be indented: `line N: first line cannot be indented`.
- **Names:** used exactly as typed after trimming; there are no slugs. Any non-empty text is valid.
- **Duplicate siblings:** siblings whose names match ignoring case are an error: `line N: duplicate "<name>" under <parent name or "top level">`.

### Categories outline

- Depth 1 lines are **category families** (`type: "root"`).
- Lines at depth 2 and deeper are categories (`type: "item"`), to any depth.

### Tags outline

- Depth 1 lines are **tag families**. Depth 2 lines are **tags**.
- A line at depth 3 or deeper is an error: `tags line N: tags cannot be nested under a tag`.

### Limits

At most 500 items in total, counting families, categories and tags across both outlines. Above that: `outline has N items; the limit is 500`.

### Error prefixes

Errors are prefixed with their outline, for example `categories line 3: …` and `tags line 2: …`.

## 2. Reading existing taxonomy (merge)

Before any write, existing items are read for every family named in the outlines. These are the core service endpoints, called through BO with the existing `NeonClient` methods.

- **Category families:** `getCategoryFamilies()` → `GET /core/categories/families` → `Category[]`.
  - An outline family matches an existing one whose `name` matches ignoring case and whose `deleted` is not `true`.
- **Category subtree** (only for existing families with children in the outline): `getCategory({ categoryRef: <family ref>, depth: <outline depth of that family> })` → `GET /core/categories` → `Category` with `children: Category[]`.
  - Each outline child is matched by name, ignoring case, among the non-deleted `children` of its matched parent.
  - A child under an unmatched parent is new.
- **Tag families:** `getTagFamilies()` → `GET /core/tags/families` → `TagTerm[]` (`id`, `name`, `deleted`). Matched like category families.
- **Tags** (only for existing tag families with tags in the outline): `getTagsInFamily(familyId)` → `GET /core/tags?tagFamilyId=` → `TagTerm[]`.

### Defensive shape handling

These are the shapes in neon-core-openapi. To be confirmed on a live environment during rollout.

- A list is accepted as an array, or as an object whose `result` or `items` is an array.
- A category ref is `categoryRef`, else `id`.
- A name is `name`, else the last segment of `categoryInfo.names`.
- Children are `children`, else `items`. Missing children mean none.

### Read failures

Any read failure, or a list that is not one of the shapes above, gives an error: `could not read existing <category families | categories of "<name>" | tag families | tags of "<name>"> in env <id>: <message>`.

- Preview reports it.
- Create returns 400 and writes nothing.

## 3. Creating

All payloads match the Neon UI reference payloads exactly. Items are created one at a time, in outline order, parents before children. Category families are processed first, then tag families.

| Item | Call | Body | New id from response |
|---|---|---|---|
| Category family | `POST /core/categories/create` | `{ categoryName, categoryMeta: { description: "", type: "root", defaultLanguage } }` | `categoryRef` |
| Category | `POST /core/categories/create` | `{ categoryName, categoryMeta: { description: "", type: "item" }, parentRef, rootRef }` | `categoryRef` |
| Tag family | `POST /core/tags/families/{encodeURIComponent(name)}` | `{ familyName: name }` | `id` |
| Tag | `POST /core/tags/{familyId}/{encodeURIComponent(name)}` | `{ tagName: name, familyName: familyId }` | `id` |

For categories:
- `parentRef` is the matched or created parent's ref (the family's ref for depth 2).
- `rootRef` is the family's ref.

### Client methods

New `NeonClient` methods are added next to the existing ones:
- `createCategoryRaw(body)`
- `createTagFamilyRaw(name)`, which builds the body itself
- `createTagRaw(familyId, tagName)`, which builds the body itself

The existing `createTagFamily` and `createTagByFamilyId`, which send no body, are left unchanged.

### Item status

- `exists`: matched during reading. Its id is reused and no call is made.
- `created`: the call succeeded and returned an id.
- `failed`:
  - the call threw. The error is the message with the HTTP status when present, as in the Site Builder `errorMessage`.
  - or the call succeeded without an id. The error is `created but no id returned`.
- `skipped`: the parent is `failed` or `skipped`. The error is `parent "<parent name>" was not created`.

### Report

```js
{ env, counts: { created, exists, failed, skipped },
  categories: [{ path, name, depth, kind: 'family' | 'category', status, ref?, error? }],
  tags: [{ path, name, depth, kind: 'family' | 'tag', status, id?, error? }] }
```

- `path` is the name chain joined by ` / `, for example `GruppoBello / Livello 1`.
- The arrays follow outline order.

## 4. Endpoints

Both endpoints are registered in `server.js` and run inside the request env context.

- **Access:** unauthenticated requests get 401. A non-admin role gets 403 `taxonomy creation requires an admin key`. There is no request env: 400 `No Neon environment selected for this request`.
- **Bad body:** 400 `body must be { categories: string, tags: string, defaultLanguage?: string }`. This also covers both outlines being empty.
- **`POST /api/neon/taxonomy-builder/preview`:** returns 200 `{ env, categories: [{ path, name, depth, kind, status: 'new' | 'exists' }], tags: […same…], toCreate: <count of new>, errors }`. It never writes.
- **`POST /api/neon/taxonomy-builder/create`:**
  - Parse errors or read errors: 400 `{ errors }`, nothing written.
  - Otherwise it runs the creation and returns the report: 200, except 502 when at least one create was attempted and every attempted create failed.
  - When nothing needs creating (everything `exists`), it returns 200 with an all-`exists` report.
- **Demo mode (`?demo=true`):** no Neon calls on either endpoint. Every item is `new` in preview. Create returns everything `created` with ids `demo-<n>`.

## 5. Widget: Taxonomy Builder

The widget is built with React and Vite (IIFE) and uses the Neon design tokens, following the existing React widget setup (`neon-react-widget` skill, `site-builder` as reference).

- **Route:** `GET /widgets/taxonomy-builder` with `window.CONFIG = { apiKey, demo, neonEnv }`.
- **Inputs:**
  - two textareas, "Categories" and "Tags", with Tab inserting 2 spaces and placeholders showing the reference example (`GruppoBello` / `  Livello 1`; `Nuova Famiglia` / `  Nuovo Tag`);
  - a "Default language" text field, defaulting to `en-uk`.
- **Preview:** debounced by 400 ms, with a request-sequence guard. It shows two trees with `new` and `exists` badges, a "N items to create" count, and the errors.
- **Create button:** disabled while there are errors, while the preview is loading or a create is in flight, or when there is nothing to create. It asks for confirmation (`Create N items in <env label>?`).
- **Result:** per-item status badges and counts. Unexpected responses (anything without `counts`) show an error instead of a broken view. After a create, the preview refreshes without clearing the report.
- **Services dashboard:** a widget entry, plus the two endpoints.

## 6. Testing (`node:test`, no network)

- **Shared outline parser:**
  - `parse-indented.js` is extracted from `site-builder/plan.js` without changing behaviour;
  - all existing Site Builder tests stay green, with their messages unchanged;
  - its own unit tests cover the indentation cases.
- **Taxonomy plan:**
  - both outlines, the depth limit for tags, duplicates ignoring case, the 500 limit, error prefixes;
  - payload builders equal to the four reference payloads field for field.
- **Merge and create service,** with a fake client:
  - matching ignoring case, and deleted items ignored;
  - an existing family with new children (`parentRef` and `rootRef` taken from the existing refs);
  - the defensive shapes (`result` wrapper, `categoryInfo.names`, `items`);
  - a read failure blocks the run;
  - failure cascade and skipping;
  - a created item with no id counts as `failed`;
  - counts;
  - the 502 rule.
- **Routes:** 401 and 403, a bad body, a 400 with no writes, a preview with no writes, demo mode.
- **Client:** the three raw methods' URLs, encoding and bodies.
- **Widget:** the bundle builds.

## 7. Rollout

1. Pick an environment that loads, with an admin key. The sandbox needs its BO user API key first.
2. Run the preview with an outline naming one existing family and one new one. Confirm `exists` and `new` are correct, which confirms the read shapes in §2.
3. Create a small taxonomy: one category family with two levels, and one tag family with two tags. Check it in Neon, then run it again and confirm everything is `exists`.
