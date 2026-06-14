# Social Publisher Panel — Design Spec

**Date:** 2026-06-09  
**Status:** Approved for implementation

---

## Context

The existing `social-media-panel` supports Bluesky only. Twitter/X, Facebook, Instagram, and Threads have UI stubs but no connectors, no publish logic, and no metrics. The webhook handler (`neon-webhooks.js`) has commented placeholder branches for these platforms.

Goal: replace the existing panel with a unified **Social Publisher** covering all 5 platforms — post preview (content review), publication, and metrics retrieval. Use a connector registry pattern so adding future platforms requires dropping in one file.

---

## Architecture

**Connector Registry Pattern.** A central registry module maps platform keys to connector implementations. The API handler resolves the correct connector at request time — no per-platform routing logic in the handler itself.

```
Neon Panel (HBS)
  ↕ PostMessage + REST /panels/social-publisher/api/{platform}/{action}
API Handler (panels.js)
  → connector-registry.js.getConnector(platform)
    → twitter-connector.js
    → facebook-connector.js
    → instagram-connector.js
    → threads-connector.js
    → bluesky-connector.js  (existing, unchanged)
  ↓ per-platform external API calls
Platform APIs (twitter.com, graph.facebook.com, graph.threads.net, bsky.social)

Neon Webhook (neon-webhooks.js)
  → same registry, same connectors
```

---

## Connector Interface

Every connector (`src/connectors/{platform}-connector.js`) exports:

```javascript
{
  platform: string,           // 'twitter' | 'facebook' | 'instagram' | 'threads' | 'bluesky'
  displayName: string,        // 'Twitter / X', 'Facebook', etc.
  maxLength: number,
  requiresImage: boolean,     // true for Instagram (Graph API enforces it)

  getStatus()
  // Reads env vars only — no network call.
  // Returns: { configured: boolean, handle?: string, pageId?: string, error?: string }

  publish(text, options)
  // options: { imageUrl?, hashtags?, articleUrl? }
  // Returns: { success: true, postId, postUrl, publishedAt }
  // Throws on failure — caught per-platform in webhook handler.

  getMetrics(postId)
  // Returns: { success: true, metrics: { likes, reposts?, replies?, comments?, shares?, saves?, impressions?, reach? } }
  // Missing fields simply absent — panel renders what's available.
}
```

`connector-registry.js` exports `getConnector(platform)` — throws `Error('Unknown platform: X')` for unregistered keys.

---

## Environment Variables

| Platform | Variables |
|---|---|
| Twitter/X | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` |
| Facebook | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` |
| Instagram | `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` (same token as FB) |
| Threads | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` (existing) |
| AI | `ANTHROPIC_API_KEY`, `OPENAI_APIKEY` (existing) |

---

## API Endpoints

Route base: `/panels/social-publisher/api/*`  
Auth: existing `authenticate()` helper — `apikey` header or cookie.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/{platform}/publish` | Publish draft. Body: `{ text, options: { imageUrl, hashtags, articleUrl } }` |
| `GET` | `/{platform}/metrics/{postId}` | Fetch live metrics for a published post |
| `POST` | `/generate-post` | AI content generation. Body: `{ platform, neonContext }`. Delegates to existing `social-media-helper.js` |
| `GET` | `/{platform}/status` | Check if connector is configured. Returns `getStatus()` output |

All endpoints return `{ success: true, ... }` or `{ success: false, error: string }`.

---

## Panel UI

**File:** `src/panels/social-publisher-panel.hbs` (replaces `social-media-panel.hbs`)  
**Route:** `GET /panels/social-publisher` (new); old `/panels/social-media` route removed.

### Layout: Tabs per platform

- Tab bar at top — one tab per platform
- Each tab badge shows state: `draft` / `✓ published` / `img req` (Instagram when no image selected) / `not configured`
- Single editing area below tab bar — only active platform shown
- Global actions bar at bottom (always visible): **Generate All**, **Save Drafts**

### Draft tab content

- Platform header (name, color, char limit)
- Textarea with real-time character counter
- Image selector: main / teaser / none (thumbnails from `neonContext.originalNode.linkedNodeRefs`)
- Warning banner when `requiresImage: true` and no image selected
- Hashtag input
- **Generate with AI** button (per-platform) + **Publish** button

### Published tab content

- Read-only post text preview (platform-color left border)
- Published timestamp + publisher name
- "↗ View post" link
- Metrics grid (platform-native labels):
  - Twitter: Likes, Reposts, Replies, Impressions
  - Facebook: Likes, Shares, Comments, Reach
  - Instagram: Likes, Comments, Saves, Reach
  - Threads: Likes, Reposts, Replies, Quotes
  - Bluesky: Likes, Reposts, Replies, Quotes
- Metrics refresh every 30s, paused when tab hidden

### PostMessage protocol (unchanged from existing panel)

- `panel-ready` → handshake to get `neonContext`
- `metadata-update` → save `socialMediaDraft` to Neon node metadata
- Writeback read from `neonContext.publishInfos[siteId].webhookData.socialMediaHook`

---

## Webhook Integration

`neon-webhooks.js` `handleSocialMediaPublish()` — replace direct Bluesky import with registry:

```javascript
const registry = require('../connectors/connector-registry');

// For each enabled platform in socialMediaDraft:
const connector = registry.getConnector(platform);
const result = await connector.publish(text, options);
socialMediaHook[platform] = { postId: result.postId, url: result.postUrl, publishedAt: result.publishedAt, publishedBy };
```

Per-platform try/catch — one failure does not stop other platforms.

---

## Files Changed

### New files
- `src/connectors/connector-registry.js` — registry + `getConnector()`
- `src/connectors/twitter-connector.js` — Twitter API v2 (OAuth 1.0a user context for posting)
- `src/connectors/facebook-connector.js` — Meta Graph API v21.0 page posting
- `src/connectors/instagram-connector.js` — Instagram Graph API (two-step: create container → publish)
- `src/connectors/threads-connector.js` — Threads API (same two-step pattern as Instagram)
- `src/panels/social-publisher-panel.hbs` — new unified panel (tabs layout)

### Modified files
- `src/requestHandlers/panels.js` — add `socialPublisherPanelHandler` + `socialPublisherApiProxyHandler`; keep old handlers until route switch confirmed
- `src/requestHandlers/neon-webhooks.js` — replace direct Bluesky import with registry in `handleSocialMediaPublish()`
- `server.js` — register `/panels/social-publisher` and `/panels/social-publisher/api/*` routes; retire old `/panels/social-media` routes
- `.env.example` — add new platform env var entries

### Retired (after cutover confirmed)
- `src/panels/social-media-panel.hbs`

---

## Platform API Notes

**Twitter/X:** Uses OAuth 1.0a (user context) for `POST /2/tweets`. Bearer token alone is read-only. Metrics via `GET /2/tweets/:id?tweet.fields=public_metrics`.

**Facebook:** Page access token posts to `POST /{page-id}/feed`. Insights via `GET /{post-id}/insights?metric=post_impressions,post_reactions_by_type_total,post_comments,post_shares`.

**Instagram:** Two-step publish — `POST /{account-id}/media` (create container with `image_url` + `caption`) → poll until `status=FINISHED` → `POST /{account-id}/media_publish`. Metrics via `GET /{media-id}/insights?metric=likes,comments,saved,reach`. Text-only posts not supported.

**Threads:** Same two-step as Instagram — `POST /{user-id}/threads` → `POST /{user-id}/threads_publish`. Metrics via `GET /{media-id}/insights?metric=likes,replies,reposts,quotes`.

---

## Verification

1. Start dev server: `npm run dev`
2. Open `http://localhost:3000/panels/social-publisher?apikey=<key>` — panel loads with 5 tabs
3. `GET /panels/social-publisher/api/{platform}/status` — returns `configured: true/false` per env vars present
4. Simulate Neon context via postMessage in browser console — drafts populate
5. Generate with AI — calls `/generate-post`, textarea fills
6. Publish to a test account — tab badge switches to `✓ published`, metrics grid appears
7. Wait 30s — metrics refresh (check network tab for polling call)
8. Trigger Neon webhook with `socialMediaDraft` in metadata — verify writeback written to `publishInfos.webhookData.socialMediaHook`
