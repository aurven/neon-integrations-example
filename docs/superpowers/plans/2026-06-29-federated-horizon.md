# Federated Horizon — Neon Live Update via client-notifier SSE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time content-change notifications to the Neon Grid Widget (and any future widget/panel) by consuming Neon's `client-notifier` SSE stream via a server-side proxy on this integration server.

**Architecture:** A new Fastify endpoint (`POST /api/neon/events/subscribe`) proxies the Neon `client-notifier/subscribe` stream, authenticating to Neon with server-held credentials. A vanilla JS class (`NeonNotifier`) and a React hook (`useNeonNotifier`) both connect to this proxy, parse SSE events, and fire callbacks. The Neon Grid Widget uses the React hook to trigger a data reload when a visible row's content changes.

**Tech Stack:** Node.js 20 / Fastify 4 / axios (streaming) / Fetch API (client) / React 18 / Vite

## Global Constraints

- Auth to integration server: `apikey` header (validated by `authenticate()` in `src/helpers/auth.js`)
- Auth to Neon BO: `neon-bo-access-key: ${NEON_BO_APIKEY}` header (same pattern as `neon-bo-api-v3.js`)
- Neon client-notifier URL: `${process.env.NEON_APP_URL}/client-notifier/subscribe`
- Embedded widget path prefix: `isEmbedded() ? '/neon/api/demo-integration' : ''` (same pattern as `src/react-widgets/src/api.js`)
- Demo mode: SSE disabled when `window.CONFIG.demo === true`
- No SharedWorker: this server's widgets are single-page, a simple module-level connection is sufficient
- Ignore: nodedbcache, broadcast, rooms — not applicable to this server
- React source builds via `cd src/react-widgets && npm run build` (Vite IIFE, output: `public/js/react/neon-grid-widget.js`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/requestHandlers/neon-events.js` | SSE proxy handler — validates auth, connects to Neon, pipes stream |
| Modify | `server.js` | Register `POST /api/neon/events/subscribe` route |
| Create | `public/js/neon-notifier.js` | Vanilla JS `NeonNotifier` class for HBS-based widgets/panels |
| Create | `src/react-widgets/src/useNeonNotifier.js` | React hook wrapping same SSE logic for Vite-built widgets |
| Modify | `src/react-widgets/src/NeonGridWidget.jsx` | Import hook, derive familyRefs, reload on event |

---

## Task 1: Server-side SSE Proxy Endpoint

**Files:**
- Create: `src/requestHandlers/neon-events.js`

**Interfaces:**
- Produces: `neonEventsSubscribeHandler(request, reply)` — exported, consumed by `server.js`
- Endpoint: `POST /api/neon/events/subscribe`
- Request body: `{ subscriptions: [{principals, events, familyRefs}], startingPoint? }`
- Response: `text/event-stream` piped from Neon

- [ ] **Step 1: Create `src/requestHandlers/neon-events.js`**

```js
'use strict';

const axios = require('axios');
const { authenticate } = require('../helpers/auth.js');

async function neonEventsSubscribeHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const neonAppUrl = process.env.NEON_APP_URL;
  const neonBoApiKey = process.env.NEON_BO_APIKEY;
  if (!neonAppUrl || !neonBoApiKey) {
    return reply.status(503).send({ error: 'Neon not configured: NEON_APP_URL or NEON_BO_APIKEY missing' });
  }

  const { subscriptions = [], startingPoint } = request.body || {};
  const requestBody = { subscriptions };
  if (startingPoint) requestBody.startingPoint = startingPoint;

  reply.hijack();
  const rawReply = reply.raw;

  let neonStream;
  try {
    const response = await axios.post(
      `${neonAppUrl}/client-notifier/subscribe`,
      requestBody,
      {
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'neon-bo-access-key': neonBoApiKey
        },
        responseType: 'stream',
        timeout: 0
      }
    );

    rawReply.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    neonStream = response.data;
    neonStream.pipe(rawReply);
    neonStream.on('end', () => rawReply.end());
    neonStream.on('error', (err) => {
      console.error('[neon-events] Neon stream error:', err.message);
      rawReply.end();
    });
    rawReply.on('close', () => neonStream.destroy());
  } catch (err) {
    console.error('[neon-events] Failed to connect to Neon client-notifier:', err.message);
    if (!rawReply.headersSent) {
      rawReply.writeHead(502, { 'Content-Type': 'application/json' });
    }
    rawReply.end(JSON.stringify({ error: 'Failed to connect to Neon events stream' }));
  }
}

module.exports = { neonEventsSubscribeHandler };
```

- [ ] **Step 2: Register route in `server.js`**

After line 258 (`fastify.post("/api/neon/create", widgetHandlers.neonCreateHandler);`), add:

```js
// Neon live events proxy (client-notifier SSE)
const neonEventsHandlers = require("./src/requestHandlers/neon-events.js");
fastify.post("/api/neon/events/subscribe", neonEventsHandlers.neonEventsSubscribeHandler);
```

- [ ] **Step 3: Smoke-test the proxy manually**

Start the server (`npm run dev`), then run:

```bash
curl -X POST http://localhost:3000/api/neon/events/subscribe \
  -H "apikey: $NEON_EXT_APIKEY" \
  -H "Content-Type: application/json" \
  -d '{"subscriptions":[{"principals":[".*"],"events":["changeStatus"],"familyRefs":[".*"]}]}' \
  --no-buffer
```

Expected: HTTP 200, `Content-Type: text/event-stream`, stream stays open (Ctrl+C to stop). If Neon is unreachable: HTTP 502 JSON error.

- [ ] **Step 4: Commit**

```bash
git add src/requestHandlers/neon-events.js server.js
git commit -m "feat(neon-events): add SSE proxy endpoint for client-notifier"
```

---

## Task 2: Vanilla JS NeonNotifier Module

**Files:**
- Create: `public/js/neon-notifier.js`

**Interfaces:**
- Produces: `window.NeonNotifier` — IIFE-exposed class
- Constructor: `new NeonNotifier({ subscriptions, onEvent, baseUrl?, apiKey? })`
- Methods: `.connect()` → returns `this`; `.disconnect()`
- Consumed by: HBS-based panels/widgets (script tag in template)

- [ ] **Step 1: Create `public/js/neon-notifier.js`**

```js
(function (global) {
  'use strict';

  var READ_TIMEOUT_MS = 90000;
  var RECONNECT_DELAY_MS = 2000;
  var REFRESH_INTERVAL_MS = 600000;

  function NeonNotifier(opts) {
    opts = opts || {};
    this._subscriptions = opts.subscriptions || [];
    this._onEvent = opts.onEvent || null;
    this._baseUrl = opts.baseUrl || '';
    this._apiKey = opts.apiKey || '';
    this._active = false;
    this._controller = null;
    this._buffer = '';
    this._lastEventId = undefined;
    this._readTimeoutId = null;
    this._refreshIntervalId = null;
    this._cancelled = false;
  }

  NeonNotifier.prototype.connect = function () {
    if (this._active) return this;
    this._cancelled = false;
    this._start();
    var self = this;
    this._refreshIntervalId = setInterval(function () { self._restart(); }, REFRESH_INTERVAL_MS);
    return this;
  };

  NeonNotifier.prototype.disconnect = function () {
    this._cancelled = true;
    this._active = false;
    clearInterval(this._refreshIntervalId);
    this._refreshIntervalId = null;
    this._clearReadTimeout();
    if (this._controller) { this._controller.abort('disconnect'); this._controller = null; }
  };

  NeonNotifier.prototype._start = async function () {
    if (this._active || this._cancelled) return;
    this._active = true;
    this._buffer = '';
    var self = this;
    try {
      self._controller = new AbortController();
      var response = await fetch(self._baseUrl + '/api/neon/events/subscribe', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          apikey: self._apiKey
        },
        body: JSON.stringify({ startingPoint: self._lastEventId, subscriptions: self._subscriptions }),
        signal: self._controller.signal
      });

      if (!response.ok) {
        console.error('[NeonNotifier] Subscribe failed: ' + response.status);
        self._active = false;
        if (!self._cancelled) setTimeout(function () { self._start(); }, RECONNECT_DELAY_MS);
        return;
      }

      var reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      self._resetReadTimeout();

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        self._resetReadTimeout();
        self._parseChunk(chunk.value);
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('[NeonNotifier] Stream error:', err);
        self._active = false;
        if (!self._cancelled) setTimeout(function () { self._start(); }, RECONNECT_DELAY_MS);
        return;
      }
    } finally {
      self._clearReadTimeout();
      self._active = false;
    }
  };

  NeonNotifier.prototype._restart = function () {
    if (this._controller) this._controller.abort('restart');
    this._buffer = '';
    var self = this;
    setTimeout(function () { self._start(); }, 0);
  };

  NeonNotifier.prototype._parseChunk = function (chunk) {
    this._buffer += chunk;
    var events = this._buffer.split('\n\n');
    this._buffer = events.pop() || '';
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event.trim()) continue;
      var lines = event.split('\n');
      var eventId, dataLine = '';
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (line.indexOf('id:') === 0) eventId = line.slice(3).trim();
        else if (line.indexOf('data:') === 0) dataLine += line.slice(5).trim();
      }
      if (eventId) this._lastEventId = eventId;
      if (dataLine) {
        try {
          var payload = JSON.parse(dataLine);
          var payloads = Array.isArray(payload) ? payload : [payload];
          for (var k = 0; k < payloads.length; k++) {
            if (payloads[k] && this._onEvent) this._onEvent(payloads[k]);
          }
        } catch (e) {
          console.error('[NeonNotifier] Failed to parse event:', e);
        }
      }
    }
  };

  NeonNotifier.prototype._resetReadTimeout = function () {
    var self = this;
    this._clearReadTimeout();
    this._readTimeoutId = setTimeout(function () {
      console.warn('[NeonNotifier] No data for 90s, restarting');
      if (self._controller) self._controller.abort('timeout');
    }, READ_TIMEOUT_MS);
  };

  NeonNotifier.prototype._clearReadTimeout = function () {
    if (this._readTimeoutId !== null) { clearTimeout(this._readTimeoutId); this._readTimeoutId = null; }
  };

  global.NeonNotifier = NeonNotifier;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Verify file is served**

Start server (`npm run dev`). Open: `http://localhost:3000/js/neon-notifier.js`

Expected: JS content loads (status 200 — served by `@fastify/static` from `public/`).

- [ ] **Step 3: Commit**

```bash
git add public/js/neon-notifier.js
git commit -m "feat(neon-events): add NeonNotifier vanilla JS module for widgets/panels"
```

---

## Task 3: React `useNeonNotifier` Hook

**Files:**
- Create: `src/react-widgets/src/useNeonNotifier.js`

**Interfaces:**
- Consumes: `POST /api/neon/events/subscribe` (via Task 1)
- Produces: `useNeonNotifier({ familyRefs, events, onEvent, enabled })` — React hook, no return value
- Dependency key for re-subscription: `JSON.stringify(familyRefs)` — reconnects when visible rows change

- [ ] **Step 1: Create `src/react-widgets/src/useNeonNotifier.js`**

```js
import { useEffect, useRef } from 'react';

const READ_TIMEOUT_MS = 90_000;
const RECONNECT_DELAY_MS = 2_000;
const REFRESH_INTERVAL_MS = 600_000;

function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

export function useNeonNotifier({ familyRefs, events, onEvent, enabled = true }) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const familyRefsKey = JSON.stringify(familyRefs ?? []);
  const eventsKey = JSON.stringify(events ?? []);

  useEffect(() => {
    if (!enabled || !familyRefs?.length) return;

    const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';
    const apiKey = window.CONFIG?.apiKey ?? '';
    const subscriptions = [{
      principals: ['.*'],
      events: events ?? ['.*'],
      familyRefs: familyRefs
    }];

    let active = false;
    let controller = null;
    let buffer = '';
    let lastEventId;
    let readTimeoutId = null;
    let refreshIntervalId = null;
    let cancelled = false;

    const clearReadTimeout = () => {
      if (readTimeoutId !== null) { clearTimeout(readTimeoutId); readTimeoutId = null; }
    };

    const resetReadTimeout = () => {
      clearReadTimeout();
      readTimeoutId = setTimeout(() => {
        if (!cancelled) controller?.abort('timeout');
      }, READ_TIMEOUT_MS);
    };

    const parseChunk = (chunk) => {
      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const raw of parts) {
        if (!raw.trim()) continue;
        let eventId, dataLine = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('id:')) eventId = line.slice(3).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (eventId) lastEventId = eventId;
        if (dataLine) {
          try {
            const payload = JSON.parse(dataLine);
            const payloads = Array.isArray(payload) ? payload : [payload];
            for (const p of payloads) {
              if (p?.details) onEventRef.current?.(p);
            }
          } catch {}
        }
      }
    };

    const start = async () => {
      if (active || cancelled) return;
      active = true;
      buffer = '';
      try {
        controller = new AbortController();
        const response = await fetch(`${BASE_URL}/api/neon/events/subscribe`, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            apikey: apiKey
          },
          body: JSON.stringify({ startingPoint: lastEventId, subscriptions }),
          signal: controller.signal
        });
        if (!response.ok) {
          active = false;
          if (!cancelled) setTimeout(start, RECONNECT_DELAY_MS);
          return;
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        resetReadTimeout();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetReadTimeout();
          parseChunk(value);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          active = false;
          if (!cancelled) setTimeout(start, RECONNECT_DELAY_MS);
          return;
        }
      } finally {
        clearReadTimeout();
        active = false;
      }
    };

    const restart = () => { controller?.abort('restart'); buffer = ''; setTimeout(start, 0); };

    start();
    refreshIntervalId = setInterval(restart, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearReadTimeout();
      clearInterval(refreshIntervalId);
      controller?.abort('unmount');
    };
  // familyRefsKey and eventsKey are the stable serializations that drive re-subscription
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyRefsKey, eventsKey, enabled]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/react-widgets/src/useNeonNotifier.js
git commit -m "feat(neon-events): add useNeonNotifier React hook"
```

---

## Task 4: NeonGridWidget Live-Update Integration + Build

**Files:**
- Modify: `src/react-widgets/src/NeonGridWidget.jsx`

**Interfaces:**
- Consumes: `useNeonNotifier` from `./useNeonNotifier.js`
- Consumes: `reload` from `usePollingSearchDelta` (already present at line 97)
- Row `id` field = familyRef (confirmed: `getRowId={params => params.data.id}` at line 240)

- [ ] **Step 1: Modify `NeonGridWidget.jsx`**

Add import after existing imports at line 7:
```js
import { useNeonNotifier } from './useNeonNotifier.js';
```

Add constant before component definition (line 33, before `export default function`):
```js
const NOTIFIER_EVENTS = [
  'lock', 'unlock', 'changeStatus', 'majorVersion', 'minorVersion',
  'noLockUpdate', 'changeAssignment', 'publishLiveUpdateState'
];
```

Inside `NeonGridWidget`, after the `const { reload } = usePollingSearchDelta(...)` block (after line 102), add:

```js
  const familyRefs = useMemo(() => rowData.map(r => r.id), [rowData]);

  useNeonNotifier({
    familyRefs,
    events: NOTIFIER_EVENTS,
    onEvent: useCallback(() => { reload(); }, [reload]),
    enabled: !window.CONFIG?.demo
  });
```

- [ ] **Step 2: Build the React bundle**

```bash
cd /Users/aureliano.ventrella/Repos/neon-integrations-example/src/react-widgets && npm run build
```

Expected output:
```
vite v5.x.x building for production...
✓ built in ...ms
public/js/react/neon-grid-widget.js   ...kB
```

- [ ] **Step 3: Verify build output includes NeonNotifier hook**

```bash
grep -c "useNeonNotifier\|neon-events\|NOTIFIER_EVENTS" \
  /Users/aureliano.ventrella/Repos/neon-integrations-example/public/js/react/neon-grid-widget.js
```

Expected: number > 0 (hook code is bundled).

- [ ] **Step 4: Commit**

```bash
cd /Users/aureliano.ventrella/Repos/neon-integrations-example
git add src/react-widgets/src/NeonGridWidget.jsx \
        src/react-widgets/src/useNeonNotifier.js \
        public/js/react/neon-grid-widget.js \
        public/js/react/neon-grid-widget.css
git commit -m "feat(neon-grid): wire live updates via useNeonNotifier hook"
```

---

## Verification

### End-to-End Test

1. Start server: `npm run dev`
2. Open widget: `http://localhost:3000/widgets/neon-grid?apikey=$NEON_EXT_APIKEY`
3. Open browser DevTools → Network tab → filter "subscribe"
4. Expected: SSE connection to `/api/neon/events/subscribe` appears, status 200, type `eventsource`
5. In Neon CMS, change the status of a story visible in the grid
6. Expected: grid rows reload automatically within ~1s (no manual refresh)

### Demo Mode Test

Open: `http://localhost:3000/widgets/neon-grid?demo=true&apikey=$NEON_EXT_APIKEY`

Expected: no SSE connection in Network tab (hook is disabled in demo mode).

### Vanilla Module Test (optional, for future panel use)

In any HBS panel template, add:
```html
<script src="/js/neon-notifier.js"></script>
<script>
  const notifier = new NeonNotifier({
    apiKey: window.CONFIG?.apiKey ?? '',
    subscriptions: [{ principals: ['.*'], events: ['changeStatus'], familyRefs: ['.*'] }],
    onEvent: (e) => console.log('[NeonNotifier] event:', e)
  });
  notifier.connect();
</script>
```

Expected: events logged to console on Neon content changes.
