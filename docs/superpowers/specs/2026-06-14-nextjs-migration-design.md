# Next.js Migration — Design Spec & Phase 1 Summary

**Date:** 2026-06-14
**Status:** Phase 1 complete (this doc)
**Repo:** neon-integrations-example
**Branch:** `develop` (off `main`)

## Context

`neon-integrations-example` is a Fastify + Handlebars integration hub bridging Neon CMS with external systems (17 request handlers, 13 connectors, 18 helpers, ~25 panels/widgets). Goal: migrate to Next.js (App Router + TypeScript) for two reasons:

1. Modernize the stack (idiomatic latest Next.js, React UI, end-to-end types).
2. Restructure into vertical-slice modules so individual integrations can later be extracted as standalone examples — showcasing DX for building Neon integrations.

All work happens in `web/` on the `develop` branch. The existing Fastify app (`main`/`render`) remains untouched and deployable throughout the migration.

## Target Architecture

```
web/
  proxy.ts                    # apikey auth + iframe-proxy rewrite (Next 16 "proxy" convention)
  app/
    api/
      in/<source>/route.ts     # was /in/* (rss, guardian, trello...)
      out/<target>/route.ts    # was /out/* (methode, mailjet, sendgrid)
      webhooks/neon/route.ts    # was /neon-webhooks
      utilities/<name>/route.ts
      widgets/<name>/<endpoint>/route.ts
    (panels)/<name>/page.tsx    # was src/panels/*.hbs
    (widgets)/<name>/page.tsx   # was src/widgets/*.hbs + react-widgets/

  lib/
    core/        # auth, utils, sites-helpers, (neon-bo-api, neon-content-parser — Phase 2)
    connectors/  # rss, guardian, trello, twitter, bluesky, ... (Phase 2+)
    integrations/<name>/service.ts  # business logic, framework-agnostic

  components/
    ui/                  # shared design system (neon-design-system.css, tailwind theme)
    integrations/<name>/
```

Each integration = `lib/integrations/<name>` (logic, framework-agnostic) + `app/api/.../route.ts` (thin adapter) + optional `app/(widgets|panels)/<name>/page.tsx` (UI). Only cross-cutting dependency is `lib/core` — this is the seam for future monorepo extraction (each integration's lib/api/UI trio can later be lifted into its own package/app).

### Routing & auth

- `web/proxy.ts` replaces `src/helpers/auth.js` (`authenticate()`) — checks `apikey` header/query/cookie against `NEON_EXT_APIKEY` (admin) and `NEON_EXT_APIKEY_LIMITED` (limited) for all `/api/*`, via `lib/core/auth.ts` (`checkApiKey`) and `lib/core/middleware-logic.ts` (`resolveApiKeyAuth`, cookie options).
- Iframe-proxy rewrite: `/neon/api/demo-integration/*` → `/api/*`, matching the existing convention from `src/react-widgets/src/api.js` (`isEmbedded()` / `BASE_URL`). Implemented via `rewriteIframeProxyPath()` + `NextResponse.rewrite()` in `proxy.ts`, covered by `web/__tests__/proxy.test.ts` and `web/__tests__/health.test.ts`.
- Old prefixes map 1:1: `/in /out /utilities /widgets` → `/api/in /api/out /api/utilities /api/widgets` (routes themselves are Phase 2+ work; the auth/rewrite layer is in place and verified end-to-end via `/api/health`).

### UI migration

- Interactive widgets/panels → `app/(widgets|panels)/<name>/page.tsx`, `"use client"`, fetch via `lib/integrations/<name>/client.ts`. Replaces `src/react-widgets/` Vite build entirely — Next bundles natively.
- Read-only/static panels → Server Components, calling `lib/integrations/<name>/service.ts` directly server-side (no API roundtrip).
- Tailwind v4 + design tokens carried over (see Task 4 below): `web/app/globals.css` (`@theme` block: gray-50, breakpoints, primary/methode color scales) + `web/app/neon-design-system.css` (ported design tokens as `:root` custom properties, Google Fonts import hoisted to top of `globals.css`). Documented cascade-layer interaction: the unlayered `:root` tokens in `neon-design-system.css` intentionally override Tailwind's `@layer theme` defaults (e.g. Geist fonts) regardless of import order.

### Background/long-running work

`src/delayed-importer.js` and RSS polling (`poll_test.sh`/`poll-config.example.json`) don't fit the request/response model. They stay as standalone Node scripts depending on `lib/core`/`lib/connectors` directly, run via cron/PM2, outside Next's routing. Not touched in Phase 1.

### Fastify vs Next.js tradeoffs

**Pros:** unified file-based routing for API+UI; RSC removes roundtrips for static panels; TS end-to-end (catches payload-shape bugs like the Mailjet `sys.baseType`/`type` filter added on `render`); single `next dev` replaces nodemon+tailwind-watch; idiomatic "latest Next" for the DX-showcase goal.

**Cons:** heavy libs (mammoth, pdfkit, cheerio, xmldom, axios-cookiejar-support) will need `export const runtime = 'nodejs'` per route; multipart uploads need a `formData()`-based adapter vs `@fastify/multipart`; background jobs need the architectural split above; ~25 `.hbs` panels/widgets need rewriting (one-time cost, done incrementally per integration in later phases).

### Testing

Vitest is the test runner for `web/` (added Task 1). `web/lib/core/__tests__/` holds unit tests for ported core modules; `web/__tests__/` holds integration-style tests for routes + `proxy()`. As of Phase 1 completion: 6 test files, 77 tests, all passing.

## Phase 1 — What Was Built

| # | Task | Outcome |
|---|------|---------|
| 1 | Scaffold Next.js app under `web/` (App Router, TS, Tailwind, Vitest) | Done — `npx create-next-app@latest`, `turbopack.root` configured |
| 2 | Port `lib/core` to TypeScript | Done, **scope narrowed**: `auth.ts`, `utils.ts`, `sites-helpers.ts` ported (633 lines, 52 tests incl. Task 6). `neon-bo-api.js`/`v2`/`v3` and `neon-content-parser.js` (~1750 lines) deferred to Phase 2 — not required for Phase 1's verification criteria (middleware, smoke test, basic tests) |
| 3 | Middleware: apikey auth + iframe-proxy rewrite | Done — `web/proxy.ts` (renamed from `middleware.ts` per Next 16 convention), pure logic extracted to `lib/core/middleware-logic.ts`, 19 tests |
| 4 | Tailwind/design-system carryover | Done — `globals.css` `@theme` block + `neon-design-system.css`, cascade-layer override documented |
| 5 | Smoke test: `/api/health` route + `/health-check` page through proxy | Done — verified 401 (no key) / 200 + cookie (with key) / iframe-proxy rewrite (all 3 curl checks pass), 6 tests |
| 6 | lib/core test coverage completion | Done, **scope adjusted**: original wording (`connector-registry.test.js`, `metadata-xpath-utils.test.js`) targeted modules not ported in Phase 1; instead added `sites-helpers.test.ts` (13 tests) covering the one ported core module that lacked coverage |

**Verification (all passing):**
- `npm run dev` (Next dev server) starts cleanly, no deprecation warnings.
- `curl -H "apikey: $NEON_EXT_APIKEY" localhost:3000/api/health` → 200 `{"status":"ok"}` + sets httpOnly `apikey` cookie; without header → 401 `{"error":"Unauthorized"}`.
- `curl -H "apikey: ..." localhost:3000/neon/api/demo-integration/api/health` → 200, `x-middleware-rewrite: /api/health`.
- Existing Fastify app (`main`/`render`) untouched.
- `cd web && npx vitest run` → 77/77 pass, lint clean, build clean.

## Deferred to Phase 2+

- Port `src/helpers/neon-bo-api.js` (+ v2/v3) and `src/helpers/neon-content-parser.js` into `lib/core`.
- Port `src/connectors/*` (rss, guardian, trello, twitter, bluesky, ...) into `lib/connectors`.
- Pick a pilot integration and migrate its `service.ts` + `route.ts` + `page.tsx` trio end-to-end (first real `/api/in|out|utilities|widgets/*` route).
- Port `test/connectors/connector-registry.test.js` and `test/metadata-xpath-utils.test.js` once their source modules are ported.
- Remaining integrations rolled incrementally, each with its own plan/PR.
