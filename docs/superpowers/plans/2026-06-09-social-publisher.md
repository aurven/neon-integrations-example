# Social Publisher Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bluesky-only social media panel with a unified 5-platform Social Publisher (Twitter/X, Facebook, Instagram, Threads, Bluesky) supporting content review, publication, and live metrics — all behind a connector registry pattern.

**Architecture:** A `connector-registry.js` module maps platform keys to connector objects that each implement a standard interface (`getStatus`, `publish`, `getMetrics`). A new API handler resolves the correct connector at request time via URL segment — no per-platform routing logic in the handler. The new tabbed HBS panel replaces the old one; the webhook handler is updated to call the registry instead of importing Bluesky directly.

**Tech Stack:** Node.js 20.x, Fastify, Handlebars, Axios, Twitter API v2 (OAuth 1.0a), Meta Graph API v21.0, Threads Graph API v1.0, Bluesky AT Protocol, Node built-in `crypto` + `node:test`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/connectors/twitter-connector.js` | Twitter API v2 auth, publish, metrics |
| Create | `src/connectors/facebook-connector.js` | Meta Graph API page posting + insights |
| Create | `src/connectors/instagram-connector.js` | Instagram Graph API two-step publish + insights |
| Create | `src/connectors/threads-connector.js` | Threads Graph API two-step publish + insights |
| Modify | `src/connectors/bluesky-connector.js` | Add standard interface wrapper exports |
| Create | `src/connectors/connector-registry.js` | Registry: maps platform → connector |
| Modify | `src/requestHandlers/panels.js` | Add `socialPublisherPanelHandler` + `socialPublisherApiProxyHandler` |
| Create | `src/panels/social-publisher-panel.hbs` | New unified tabbed panel UI |
| Modify | `server.js` | Register new routes, retire old routes |
| Modify | `src/requestHandlers/neon-webhooks.js` | Replace direct Bluesky import with registry |
| Modify | `.env.example` | Add new platform env var entries |
| Create | `test/connectors/twitter-connector.test.js` | Unit tests for Twitter getStatus |
| Create | `test/connectors/facebook-connector.test.js` | Unit tests for Facebook getStatus |
| Create | `test/connectors/instagram-connector.test.js` | Unit tests for Instagram getStatus |
| Create | `test/connectors/threads-connector.test.js` | Unit tests for Threads getStatus |
| Create | `test/connectors/connector-registry.test.js` | Unit tests for registry lookup |

---

## Task 1: Twitter Connector

**Files:**
- Create: `src/connectors/twitter-connector.js`
- Create: `test/connectors/twitter-connector.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/connectors/twitter-connector.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Temporarily clear all twitter env vars to test unconfigured state
const TWITTER_VARS = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
const saved = {};
TWITTER_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/twitter-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when all env vars present', () => {
  TWITTER_VARS.forEach(v => { process.env[v] = 'test-value'; });
  const status = connector.getStatus();
  assert.equal(status.configured, true);
  TWITTER_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'twitter');
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
  assert.equal(typeof connector.maxLength, 'number');
  assert.equal(typeof connector.requiresImage, 'boolean');
});
```

- [ ] **Step 2: Run test — expect failure (file not found)**

```bash
node --test test/connectors/twitter-connector.test.js
```

Expected: `Error: Cannot find module '../../src/connectors/twitter-connector'`

- [ ] **Step 3: Create the Twitter connector**

```javascript
// src/connectors/twitter-connector.js
'use strict';
const axios = require('axios');
const crypto = require('crypto');

const TWITTER_API_BASE = 'https://api.twitter.com/2';
const REQUIRED_VARS = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];

function getStatus() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true };
}

function buildOAuthHeader(method, url) {
  const oauthParams = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const paramString = Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');
  const sigBase = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const sigKey = `${encodeURIComponent(process.env.TWITTER_API_SECRET)}&${encodeURIComponent(process.env.TWITTER_ACCESS_SECRET)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');
  return 'OAuth ' + Object.keys(oauthParams)
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

async function publish(text, options = {}) {
  const url = `${TWITTER_API_BASE}/tweets`;
  const response = await axios.post(url, { text }, {
    headers: { Authorization: buildOAuthHeader('POST', url), 'Content-Type': 'application/json' }
  });
  const postId = response.data.data.id;
  return {
    success: true,
    postId,
    postUrl: `https://twitter.com/i/web/status/${postId}`,
    publishedAt: new Date().toISOString()
  };
}

async function getMetrics(postId) {
  const url = `${TWITTER_API_BASE}/tweets/${postId}`;
  const response = await axios.get(url, {
    params: { 'tweet.fields': 'public_metrics' },
    headers: { Authorization: buildOAuthHeader('GET', url) }
  });
  const m = response.data.data.public_metrics;
  return {
    success: true,
    metrics: {
      likes: m.like_count,
      reposts: m.retweet_count,
      replies: m.reply_count,
      quotes: m.quote_count,
      impressions: m.impression_count || 0
    }
  };
}

module.exports = {
  platform: 'twitter',
  displayName: 'Twitter / X',
  maxLength: 280,
  requiresImage: false,
  getStatus,
  publish,
  getMetrics
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test test/connectors/twitter-connector.test.js
```

Expected: `✓ getStatus returns not configured when env vars missing`, `✓ getStatus returns configured when all env vars present`, `✓ connector has required interface`

- [ ] **Step 5: Commit**

```bash
git add src/connectors/twitter-connector.js test/connectors/twitter-connector.test.js
git commit -m "feat: add Twitter/X connector with standard interface"
```

---

## Task 2: Facebook Connector

**Files:**
- Create: `src/connectors/facebook-connector.js`
- Create: `test/connectors/facebook-connector.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/connectors/facebook-connector.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const FB_VARS = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'];
const saved = {};
FB_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/facebook-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured with pageId when env vars present', () => {
  process.env.FACEBOOK_PAGE_ID = 'test-page-id';
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'test-token';
  const status = connector.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.pageId, 'test-page-id');
  FB_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'facebook');
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
  assert.equal(typeof connector.getStatus, 'function');
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
node --test test/connectors/facebook-connector.test.js
```

Expected: `Error: Cannot find module '../../src/connectors/facebook-connector'`

- [ ] **Step 3: Create the Facebook connector**

```javascript
// src/connectors/facebook-connector.js
'use strict';
const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const REQUIRED_VARS = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'];

function getStatus() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true, pageId: process.env.FACEBOOK_PAGE_ID };
}

async function publish(text, options = {}) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const body = { message: text, access_token: token };
  if (options.articleUrl) body.link = options.articleUrl;

  const response = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, body);
  const postId = response.data.id;
  const [pid, oid] = postId.split('_');
  return {
    success: true,
    postId,
    postUrl: `https://www.facebook.com/${pid}/posts/${oid}`,
    publishedAt: new Date().toISOString()
  };
}

async function getMetrics(postId) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const response = await axios.get(`${GRAPH_BASE}/${postId}/insights`, {
    params: {
      metric: 'post_reactions_by_type_total,post_comments,post_shares,post_impressions_unique',
      access_token: token
    }
  });
  const byName = {};
  (response.data.data || []).forEach(m => { byName[m.name] = m.values?.[0]?.value ?? 0; });
  const reactions = byName['post_reactions_by_type_total'] || {};
  return {
    success: true,
    metrics: {
      likes: (reactions.LIKE || 0) + (reactions.LOVE || 0),
      comments: byName['post_comments'] || 0,
      shares: byName['post_shares'] || 0,
      reach: byName['post_impressions_unique'] || 0
    }
  };
}

module.exports = {
  platform: 'facebook',
  displayName: 'Facebook',
  maxLength: 63206,
  requiresImage: false,
  getStatus,
  publish,
  getMetrics
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test test/connectors/facebook-connector.test.js
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/facebook-connector.js test/connectors/facebook-connector.test.js
git commit -m "feat: add Facebook connector with standard interface"
```

---

## Task 3: Instagram Connector

**Files:**
- Create: `src/connectors/instagram-connector.js`
- Create: `test/connectors/instagram-connector.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/connectors/instagram-connector.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const IG_VARS = ['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'];
const saved = {};
IG_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/instagram-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when env vars present', () => {
  process.env.INSTAGRAM_ACCOUNT_ID = 'test-account';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  const status = connector.getStatus();
  assert.equal(status.configured, true);
  IG_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
});

test('requiresImage is true', () => {
  assert.equal(connector.requiresImage, true);
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'instagram');
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
node --test test/connectors/instagram-connector.test.js
```

Expected: `Error: Cannot find module '../../src/connectors/instagram-connector'`

- [ ] **Step 3: Create the Instagram connector**

```javascript
// src/connectors/instagram-connector.js
'use strict';
const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const REQUIRED_VARS = ['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'];

function getStatus() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true };
}

async function waitForContainer(containerId, token, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await axios.get(`${GRAPH_BASE}/${containerId}`, {
      params: { fields: 'status_code', access_token: token }
    });
    if (res.data.status_code === 'FINISHED') return;
    if (res.data.status_code === 'ERROR') throw new Error('Instagram container processing failed');
  }
  throw new Error('Instagram container timed out after 30 seconds');
}

async function publish(text, options = {}) {
  if (!options.imageUrl) throw new Error('Instagram requires an imageUrl in options');
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  // Step 1: Create media container
  const containerRes = await axios.post(`${GRAPH_BASE}/${accountId}/media`, null, {
    params: { image_url: options.imageUrl, caption: text, access_token: token }
  });
  const containerId = containerRes.data.id;

  // Step 2: Wait for container to be ready
  await waitForContainer(containerId, token);

  // Step 3: Publish container
  const publishRes = await axios.post(`${GRAPH_BASE}/${accountId}/media_publish`, null, {
    params: { creation_id: containerId, access_token: token }
  });
  const postId = publishRes.data.id;
  return {
    success: true,
    postId,
    postUrl: `https://www.instagram.com/p/${postId}/`,
    publishedAt: new Date().toISOString()
  };
}

async function getMetrics(postId) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const res = await axios.get(`${GRAPH_BASE}/${postId}/insights`, {
    params: { metric: 'likes,comments,saved,reach', access_token: token }
  });
  const byName = {};
  (res.data.data || []).forEach(m => { byName[m.name] = m.values?.[0]?.value ?? m.value ?? 0; });
  return {
    success: true,
    metrics: {
      likes: byName.likes || 0,
      comments: byName.comments || 0,
      saves: byName.saved || 0,
      reach: byName.reach || 0
    }
  };
}

module.exports = {
  platform: 'instagram',
  displayName: 'Instagram',
  maxLength: 2200,
  requiresImage: true,
  getStatus,
  publish,
  getMetrics
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test test/connectors/instagram-connector.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/instagram-connector.js test/connectors/instagram-connector.test.js
git commit -m "feat: add Instagram connector (two-step Graph API publish)"
```

---

## Task 4: Threads Connector

**Files:**
- Create: `src/connectors/threads-connector.js`
- Create: `test/connectors/threads-connector.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/connectors/threads-connector.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const TH_VARS = ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'];
const saved = {};
TH_VARS.forEach(v => { saved[v] = process.env[v]; delete process.env[v]; });

const connector = require('../../src/connectors/threads-connector');

test('getStatus returns not configured when env vars missing', () => {
  const status = connector.getStatus();
  assert.equal(status.configured, false);
  assert.ok(status.error.includes('Missing'));
});

test('getStatus returns configured when env vars present', () => {
  process.env.THREADS_USER_ID = 'test-user';
  process.env.THREADS_ACCESS_TOKEN = 'test-token';
  const status = connector.getStatus();
  assert.equal(status.configured, true);
  TH_VARS.forEach(v => { process.env[v] = saved[v]; if (!saved[v]) delete process.env[v]; });
});

test('connector has required interface', () => {
  assert.equal(connector.platform, 'threads');
  assert.equal(connector.requiresImage, false);
  assert.equal(typeof connector.publish, 'function');
  assert.equal(typeof connector.getMetrics, 'function');
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
node --test test/connectors/threads-connector.test.js
```

Expected: `Error: Cannot find module '../../src/connectors/threads-connector'`

- [ ] **Step 3: Create the Threads connector**

```javascript
// src/connectors/threads-connector.js
'use strict';
const axios = require('axios');

const THREADS_BASE = 'https://graph.threads.net/v1.0';
const REQUIRED_VARS = ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'];

function getStatus() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true };
}

async function publish(text, options = {}) {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;

  // Step 1: Create container
  const containerParams = {
    media_type: options.imageUrl ? 'IMAGE' : 'TEXT',
    text,
    access_token: token
  };
  if (options.imageUrl) containerParams.image_url = options.imageUrl;

  const containerRes = await axios.post(`${THREADS_BASE}/${userId}/threads`, null, {
    params: containerParams
  });
  const containerId = containerRes.data.id;

  // Step 2: Publish
  const publishRes = await axios.post(`${THREADS_BASE}/${userId}/threads_publish`, null, {
    params: { creation_id: containerId, access_token: token }
  });
  const postId = publishRes.data.id;
  return {
    success: true,
    postId,
    postUrl: `https://www.threads.net/t/${postId}`,
    publishedAt: new Date().toISOString()
  };
}

async function getMetrics(postId) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const res = await axios.get(`${THREADS_BASE}/${postId}/insights`, {
    params: { metric: 'likes,replies,reposts,quotes', access_token: token }
  });
  const byName = {};
  (res.data.data || []).forEach(m => { byName[m.name] = m.values?.[0]?.value ?? m.value ?? 0; });
  return {
    success: true,
    metrics: {
      likes: byName.likes || 0,
      replies: byName.replies || 0,
      reposts: byName.reposts || 0,
      quotes: byName.quotes || 0
    }
  };
}

module.exports = {
  platform: 'threads',
  displayName: 'Threads',
  maxLength: 500,
  requiresImage: false,
  getStatus,
  publish,
  getMetrics
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test test/connectors/threads-connector.test.js
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/threads-connector.js test/connectors/threads-connector.test.js
git commit -m "feat: add Threads connector (two-step Threads Graph API publish)"
```

---

## Task 5: Add Standard Interface to Bluesky Connector

**Files:**
- Modify: `src/connectors/bluesky-connector.js`

The existing Bluesky connector exports `publishPost`, `getPostMetrics`, `parseRichText`, etc. — not the standard interface. Add wrapper functions and update `module.exports` without changing existing exports (the old panel still uses the original names).

- [ ] **Step 1: Append standard interface to end of `src/connectors/bluesky-connector.js`**

Find the `module.exports = {` block (line 350) and replace it:

```javascript
// Standard connector interface wrappers
function getStatus() {
  const missing = ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'].filter(v => !process.env[v]);
  if (missing.length > 0) return { configured: false, error: `Missing: ${missing.join(', ')}` };
  return { configured: true, handle: process.env.BLUESKY_HANDLE };
}

async function publish(text, options = {}) {
  const richText = parseRichText(text);
  const result = await publishPost(richText.text, { facets: richText.facets, ...options });
  return { success: result.success, postId: result.postUri, postUrl: result.postUrl, publishedAt: result.publishedAt };
}

async function getMetrics(postId) {
  return await getPostMetrics(postId);
}

module.exports = {
  // existing exports (keep for backward compatibility)
  authenticate,
  refreshSession,
  getSession,
  publishPost,
  getPostMetrics,
  parseRichText,
  clearSession,
  // standard interface
  platform: 'bluesky',
  displayName: 'Bluesky',
  maxLength: 300,
  requiresImage: false,
  getStatus,
  publish,
  getMetrics
};
```

- [ ] **Step 2: Verify existing panel still works**

```bash
curl -s "http://localhost:3000/panels/social-media?apikey=12345678-1234-1234-1234-123456789abc" | grep -c "social-media"
```

Expected: returns `> 0` (panel HTML loads).

- [ ] **Step 3: Commit**

```bash
git add src/connectors/bluesky-connector.js
git commit -m "feat: add standard interface to Bluesky connector (backward-compatible)"
```

---

## Task 6: Connector Registry

**Files:**
- Create: `src/connectors/connector-registry.js`
- Create: `test/connectors/connector-registry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/connectors/connector-registry.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../src/connectors/connector-registry');

test('getConnector returns all expected platforms', () => {
  for (const platform of ['twitter', 'facebook', 'instagram', 'threads', 'bluesky']) {
    const connector = registry.getConnector(platform);
    assert.equal(connector.platform, platform, `connector.platform mismatch for ${platform}`);
    assert.equal(typeof connector.getStatus, 'function', `getStatus missing for ${platform}`);
    assert.equal(typeof connector.publish, 'function', `publish missing for ${platform}`);
    assert.equal(typeof connector.getMetrics, 'function', `getMetrics missing for ${platform}`);
  }
});

test('getConnector throws for unknown platform', () => {
  assert.throws(
    () => registry.getConnector('myspace'),
    { message: 'Unknown platform: myspace' }
  );
});

test('getAllConnectors returns 5 entries', () => {
  const all = registry.getAllConnectors();
  assert.equal(all.length, 5);
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
node --test test/connectors/connector-registry.test.js
```

Expected: `Error: Cannot find module '../../src/connectors/connector-registry'`

- [ ] **Step 3: Create the registry**

```javascript
// src/connectors/connector-registry.js
'use strict';

const connectors = {
  twitter:   require('./twitter-connector'),
  facebook:  require('./facebook-connector'),
  instagram: require('./instagram-connector'),
  threads:   require('./threads-connector'),
  bluesky:   require('./bluesky-connector'),
};

function getConnector(platform) {
  const connector = connectors[platform];
  if (!connector) throw new Error(`Unknown platform: ${platform}`);
  return connector;
}

function getAllConnectors() {
  return Object.values(connectors);
}

module.exports = { getConnector, getAllConnectors };
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test test/connectors/connector-registry.test.js
```

Expected: all 3 tests pass.

- [ ] **Step 5: Add test script to package.json**

In `package.json`, add/update `"scripts"`:

```json
"test": "node --test test/connectors/twitter-connector.test.js test/connectors/facebook-connector.test.js test/connectors/instagram-connector.test.js test/connectors/threads-connector.test.js test/connectors/connector-registry.test.js"
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests pass. `# tests 16, passed 16`

- [ ] **Step 7: Commit**

```bash
git add src/connectors/connector-registry.js test/connectors/connector-registry.test.js package.json
git commit -m "feat: add connector registry + wire all 5 platform connectors"
```

---

## Task 7: New API Handler

**Files:**
- Modify: `src/requestHandlers/panels.js` (append two new functions before `module.exports`)

- [ ] **Step 1: Add `socialPublisherPanelHandler` to `panels.js`**

Before the `module.exports = {` line (line 838), append:

```javascript
function socialPublisherPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  return reply.view('/src/panels/social-publisher-panel.hbs', {
    seo: seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL || 'http://localhost:3000'
  });
}

async function socialPublisherApiProxyHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const registry = require('../connectors/connector-registry');
    const endpoint = request.url.replace('/panels/social-publisher/api/', '');

    // POST /generate-post — delegates to existing AI helper
    if (endpoint === 'generate-post' && request.method === 'POST') {
      const { generatePostContent, buildArticleUrl, extractArticleData } = require('../helpers/social-media-helper');
      const { platform, neonContext } = request.body;
      if (!platform || !neonContext) {
        return reply.status(400).send({ error: 'Missing platform or neonContext' });
      }
      const articleData = extractArticleData(neonContext);
      const articleUrl = buildArticleUrl(neonContext) || 'https://example.com/article';
      const result = await generatePostContent(platform, articleData, articleUrl);
      return reply.send(result);
    }

    // GET /{platform}/status
    const statusMatch = endpoint.match(/^([^/]+)\/status$/);
    if (statusMatch && request.method === 'GET') {
      const connector = registry.getConnector(statusMatch[1]);
      return reply.send(connector.getStatus());
    }

    // POST /{platform}/publish
    const publishMatch = endpoint.match(/^([^/]+)\/publish$/);
    if (publishMatch && request.method === 'POST') {
      const connector = registry.getConnector(publishMatch[1]);
      const { text, options } = request.body;
      if (!text) return reply.status(400).send({ error: 'Missing text' });
      const result = await connector.publish(text, options || {});
      return reply.send(result);
    }

    // GET /{platform}/metrics/{postId}
    const metricsMatch = endpoint.match(/^([^/]+)\/metrics\/(.+)$/);
    if (metricsMatch && request.method === 'GET') {
      const connector = registry.getConnector(metricsMatch[1]);
      const postId = decodeURIComponent(metricsMatch[2]);
      const result = await connector.getMetrics(postId);
      return reply.send(result);
    }

    return reply.status(404).send({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('[Social Publisher API] Error:', error);
    return reply.status(500).send({ error: 'API request failed', details: error.message });
  }
}
```

- [ ] **Step 2: Export the two new handlers**

Find the `module.exports = {` block at the bottom of `panels.js` and add:

```javascript
  socialPublisherPanelHandler,
  socialPublisherApiProxyHandler,
```

- [ ] **Step 3: Commit**

```bash
git add src/requestHandlers/panels.js
git commit -m "feat: add socialPublisher panel and API proxy handlers"
```

---

## Task 8: Register New Routes in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add new route registrations in `server.js`**

Find the block that registers the social-media routes (lines ~299–305) and add AFTER it:

```javascript
// Social Publisher (replaces Social Media panel)
fastify.get("/panels/social-publisher", panelHandlers.socialPublisherPanelHandler);
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/social-publisher/api/*',
    handler: panelHandlers.socialPublisherApiProxyHandler
  });
});
```

- [ ] **Step 2: Verify server starts without error**

```bash
npm run dev
```

Expected: server starts, no errors in console. Check output includes Fastify ready message.

- [ ] **Step 3: Smoke-test status endpoints (server must be running)**

```bash
curl -s -H "apikey: 12345678-1234-1234-1234-123456789abc" \
  "http://localhost:3000/panels/social-publisher/api/twitter/status"
```

Expected: `{"configured":false,"error":"Missing: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET"}` (or `configured: true` if env vars are set).

```bash
curl -s -H "apikey: 12345678-1234-1234-1234-123456789abc" \
  "http://localhost:3000/panels/social-publisher/api/bluesky/status"
```

Expected: `{"configured":true,"handle":"your-handle.bsky.social"}` (or `configured: false` if not set).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: register /panels/social-publisher routes"
```

---

## Task 9: Social Publisher Panel HBS

**Files:**
- Create: `src/panels/social-publisher-panel.hbs`

- [ ] **Step 1: Create the panel file**

```html
<!-- src/panels/social-publisher-panel.hbs -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Social Publisher</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d0d;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.panel-header{padding:10px 16px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:#111}
.panel-title{font-weight:600;font-size:14px}
.hdr-actions{display:flex;gap:8px}
.btn{padding:5px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit}
.btn-ghost{background:#222;color:#ccc}.btn-ghost:hover{background:#2a2a2a}
.tabs{display:flex;border-bottom:1px solid #222;flex-shrink:0;overflow-x:auto;background:#111}
.tab{display:flex;align-items:center;gap:5px;padding:9px 14px;cursor:pointer;border-bottom:2px solid transparent;color:#555;font-size:12px;white-space:nowrap;user-select:none}
.tab:hover{color:#aaa;background:#161616}
.tab.active{color:#fff;border-bottom-color:var(--tab-color,#6c63ff)}
.badge{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;text-transform:uppercase}
.badge-draft{background:#ffd166;color:#000}
.badge-pub{background:#4caf50;color:#fff}
.badge-warn{background:#ff6b35;color:#fff}
.badge-off{background:#2a2a2a;color:#555}
.tab-body{flex:1;overflow-y:auto;padding:14px}
.plat-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.plat-name{font-size:14px;font-weight:600}
.char-cnt{font-size:12px;color:#555}
.char-cnt.warn{color:#ffd166}.char-cnt.err{color:#ef5350}
textarea{width:100%;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;line-height:1.5;padding:10px;resize:vertical;min-height:90px;font-family:inherit}
textarea:focus{outline:none;border-color:#555}
.img-row{display:flex;gap:8px;align-items:flex-end;margin:8px 0}
.img-col{display:flex;flex-direction:column;align-items:center;gap:3px}
.img-thumb{width:60px;height:60px;border:2px solid #333;border-radius:6px;cursor:pointer;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#1a1a1a}
.img-thumb:hover{border-color:#555}
.img-thumb.sel{border-color:#6c63ff}
.img-thumb img{width:100%;height:100%;object-fit:cover}
.img-thumb .noimg{color:#444;font-size:18px}
.img-lbl{font-size:10px;color:#555}
.hashtag-inp{width:100%;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:12px;padding:7px 10px;margin:6px 0;font-family:inherit}
.hashtag-inp:focus{outline:none;border-color:#555}
.warn-banner{background:#2a1400;border:1px solid #ff6b3550;border-radius:6px;padding:7px 12px;font-size:12px;color:#ff6b35;margin-bottom:8px}
.draft-actions{display:flex;gap:8px;align-items:center;margin-top:6px}
.btn-gen{background:#1a1a2a;border:1px solid #6c63ff50;color:#6c63ff}.btn-gen:hover{border-color:#6c63ff;background:#1e1e35}
.btn-pub{color:#fff;margin-left:auto}.btn-pub:hover{opacity:.9}.btn-pub:disabled{opacity:.35;cursor:not-allowed}
.pub-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.pub-meta{font-size:11px;color:#555;margin-top:3px}
.view-link{font-size:11px;color:#6c63ff;text-decoration:none;border:1px solid #6c63ff40;border-radius:4px;padding:3px 9px}
.view-link:hover{background:#6c63ff15}
.post-preview{border-left:3px solid var(--tab-color,#6c63ff);background:#1a1a1a;border-radius:0 6px 6px 0;padding:9px 13px;font-size:13px;line-height:1.5;color:#ccc;margin-bottom:12px;word-break:break-word}
.metrics-lbl{font-size:10px;color:#555;letter-spacing:1px;text-transform:uppercase;margin-bottom:7px}
.metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.metric-card{background:#1a1a1a;border-radius:6px;padding:10px;text-align:center}
.metric-emoji{font-size:18px}
.metric-val{font-size:18px;font-weight:700;margin-top:3px;color:#fff}
.metric-name{font-size:10px;color:#555;margin-top:2px}
.post-id{font-size:10px;color:#333;word-break:break-all;margin-top:8px}
.actions-bar{padding:10px 16px;border-top:1px solid #222;display:flex;gap:8px;flex-shrink:0;background:#111}
.uncfg-notice{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;text-align:center;color:#555;font-size:13px}
</style>
</head>
<body>
<div class="panel-header">
  <span class="panel-title">Social Publisher</span>
  <div class="hdr-actions">
    <button class="btn btn-ghost" onclick="handleGenerateAll()">✨ Generate All</button>
    <button class="btn btn-ghost" onclick="handleSaveAll()">💾 Save Drafts</button>
  </div>
</div>
<div class="tabs" id="tabs"></div>
<div class="tab-body" id="tab-body"></div>

<script>
'use strict';

const PLATFORMS = {
  twitter:   { displayName:'Twitter / X', icon:'𝕏',  color:'#1d9bf0', maxLength:280,   requiresImage:false,
               metrics:[{k:'likes',e:'❤️',l:'Likes'},{k:'reposts',e:'🔁',l:'Reposts'},{k:'replies',e:'💬',l:'Replies'},{k:'impressions',e:'👁',l:'Impressions'}] },
  facebook:  { displayName:'Facebook',    icon:'f',   color:'#1877f2', maxLength:63206, requiresImage:false,
               metrics:[{k:'likes',e:'❤️',l:'Likes'},{k:'shares',e:'🔁',l:'Shares'},{k:'comments',e:'💬',l:'Comments'},{k:'reach',e:'👁',l:'Reach'}] },
  instagram: { displayName:'Instagram',   icon:'📷',  color:'#e1306c', maxLength:2200,  requiresImage:true,
               metrics:[{k:'likes',e:'❤️',l:'Likes'},{k:'comments',e:'💬',l:'Comments'},{k:'saves',e:'🔖',l:'Saves'},{k:'reach',e:'👁',l:'Reach'}] },
  threads:   { displayName:'Threads',     icon:'◎',   color:'#e0e0e0', maxLength:500,   requiresImage:false,
               metrics:[{k:'likes',e:'❤️',l:'Likes'},{k:'reposts',e:'🔁',l:'Reposts'},{k:'replies',e:'💬',l:'Replies'},{k:'quotes',e:'📝',l:'Quotes'}] },
  bluesky:   { displayName:'Bluesky',     icon:'🦋',  color:'#0085ff', maxLength:300,   requiresImage:false,
               metrics:[{k:'likes',e:'❤️',l:'Likes'},{k:'reposts',e:'🔁',l:'Reposts'},{k:'replies',e:'💬',l:'Replies'},{k:'quotes',e:'📝',l:'Quotes'}] }
};

const state = {
  apiKey: '{{apiKey}}',
  neonAppUrl: '{{neonAppUrl}}',
  neonContext: null,
  active: 'twitter',
  status: {},
  drafts: Object.fromEntries(Object.keys(PLATFORMS).map(p => [p, { enabled:true, text:'', hashtags:[], selectedImage:'none' }])),
  writebacks: {},
  images: { main:null, teaser:null },
  metricsIntervals: {},
  generating: {},
  publishing: {}
};

// --- API ---
async function api(endpoint, method='GET', body=null) {
  const opts = { method, headers:{ 'Content-Type':'application/json', apikey:state.apiKey } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/panels/social-publisher/api/${endpoint}`, opts);
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || res.statusText); }
  return res.json();
}

// --- PostMessage ---
window.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.key === 'getInfo') { state.neonContext = e.data.info; loadFromContext(); render(); }
});

function loadFromContext() {
  if (!state.neonContext) return;
  const node = state.neonContext.originalNode || {};
  const saved = node.metadata?.socialMediaDraft || {};
  Object.keys(PLATFORMS).forEach(p => { if (saved[p]) Object.assign(state.drafts[p], saved[p]); });
  Object.values(state.neonContext.publishInfos || {}).forEach(site => {
    Object.assign(state.writebacks, site?.webhookData?.socialMediaHook || {});
  });
  const refs = node.linkedNodeRefs || {};
  state.images.main   = refs.system?.mainPicture?.[0]?.ref || null;
  state.images.teaser = refs.hyperlink?.image?.[0]?.ref || null;
}

function imgUrl(type) {
  const ref = state.images[type];
  return ref?.startsWith('http') ? ref : null;
}

// --- Status ---
async function loadStatuses() {
  await Promise.all(Object.keys(PLATFORMS).map(async p => {
    try { state.status[p] = await api(`${p}/status`); }
    catch (e) { state.status[p] = { configured:false, error:e.message }; }
  }));
  render();
}

// --- Render ---
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtMetric(v) { if (v==null) return '—'; return v>=1000 ? (v/1000).toFixed(1)+'k' : String(v); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : ''; }

function badge(p) {
  if (state.writebacks[p]) return `<span class="badge badge-pub">✓ live</span>`;
  if (state.status[p] && !state.status[p].configured) return `<span class="badge badge-off">no config</span>`;
  if (PLATFORMS[p].requiresImage && state.drafts[p].selectedImage==='none') return `<span class="badge badge-warn">img req</span>`;
  if (state.drafts[p].text) return `<span class="badge badge-draft">draft</span>`;
  return '';
}

function render() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = Object.entries(PLATFORMS).map(([p,cfg]) =>
    `<div class="tab${state.active===p?' active':''}" style="--tab-color:${cfg.color}" onclick="switchTab('${p}')">
       <span>${cfg.icon}</span><span>${cfg.displayName}</span>${badge(p)}</div>`
  ).join('');
  renderBody();
}

function renderBody() {
  const p = state.active, cfg = PLATFORMS[p];
  const el = document.getElementById('tab-body');
  el.style.setProperty('--tab-color', cfg.color);
  if (state.writebacks[p]) { renderPublished(el, p, cfg); startMetricsPoll(p); }
  else renderDraft(el, p, cfg);
}

function renderDraft(el, p, cfg) {
  const d = state.drafts[p];
  const configured = !state.status[p] || state.status[p].configured;
  const charCls = (cfg.maxLength - d.text.length) < 20 ? 'err' : (cfg.maxLength - d.text.length) < 50 ? 'warn' : '';
  const needsImg = cfg.requiresImage && d.selectedImage==='none';
  const pubDisabled = !configured || needsImg || !!state.publishing[p];

  const imgOptions = ['main','teaser','none'].map(t => {
    const url = t!=='none' ? imgUrl(t) : null;
    return `<div class="img-col">
      <div class="img-thumb${d.selectedImage===t?' sel':''}" onclick="selImg('${p}','${t}')">
        ${url ? `<img src="${esc(url)}" alt="${t}">` : `<span class="noimg">${t==='none'?'✕':'?'}</span>`}
      </div><div class="img-lbl">${t}</div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="plat-hdr">
      <span class="plat-name" style="color:${cfg.color}">${cfg.icon} ${cfg.displayName}</span>
      <span class="char-cnt ${charCls}">${d.text.length} / ${cfg.maxLength}</span>
    </div>
    ${needsImg ? '<div class="warn-banner">⚠ Instagram requires an image to publish.</div>' : ''}
    ${!configured ? '<div class="warn-banner">⚠ Connector not configured. Add env vars and restart.</div>' : ''}
    <textarea oninput="onText('${p}',this.value)" placeholder="Write your ${esc(cfg.displayName)} post...">${esc(d.text)}</textarea>
    <div class="img-row"><span style="font-size:11px;color:#555;margin-right:2px;align-self:center">Image:</span>${imgOptions}</div>
    <input class="hashtag-inp" placeholder="Hashtags (comma-separated, no #)"
      value="${esc(d.hashtags.join(', '))}" oninput="onTags('${p}',this.value)">
    <div class="draft-actions">
      <button class="btn btn-gen" onclick="handleGenerate('${p}')" ${state.generating[p]?'disabled':''}>
        ${state.generating[p]?'Generating…':'✨ Generate'}</button>
      <button class="btn btn-pub" style="background:${cfg.color}" onclick="handlePublish('${p}')" ${pubDisabled?'disabled':''}>
        ${state.publishing[p]?'Publishing…':'Publish →'}</button>
    </div>`;
}

function renderPublished(el, p, cfg) {
  const wb = state.writebacks[p];
  const metricsCards = cfg.metrics.map(m =>
    `<div class="metric-card">
       <div class="metric-emoji">${m.e}</div>
       <div class="metric-val" id="m-${p}-${m.k}">${fmtMetric(wb.metrics?.[m.k])}</div>
       <div class="metric-name">${m.l}</div></div>`
  ).join('');

  el.innerHTML = `
    <div class="pub-hdr">
      <div>
        <div style="font-size:14px;font-weight:600;color:${cfg.color}">${cfg.icon} ${cfg.displayName}</div>
        <div class="pub-meta">Published ${fmtDate(wb.publishedAt)} · ${esc(wb.publishedBy||'system')}</div>
      </div>
      <a class="view-link" href="${esc(wb.url)}" target="_blank">↗ View post</a>
    </div>
    <div class="post-preview">${esc(wb.text||'')}</div>
    <div class="metrics-lbl">METRICS <span style="font-size:9px;color:#444">· every 30s</span></div>
    <div class="metrics-grid">${metricsCards}</div>
    <div class="post-id">Post ID: ${esc(wb.postId)}</div>`;
}

function updateMetricCards(p, metrics) {
  const cfg = PLATFORMS[p];
  cfg.metrics.forEach(m => {
    const el = document.getElementById(`m-${p}-${m.k}`);
    if (el) el.textContent = fmtMetric(metrics[m.k]);
  });
}

// --- Actions ---
function switchTab(p) { state.active = p; render(); }
function selImg(p, t) { state.drafts[p].selectedImage = t; renderBody(); }

function onText(p, v) {
  state.drafts[p].text = v;
  const cfg = PLATFORMS[p];
  const rem = cfg.maxLength - v.length;
  const cls = rem < 20 ? 'err' : rem < 50 ? 'warn' : '';
  const el = document.querySelector('.char-cnt');
  if (el) { el.className = `char-cnt ${cls}`; el.textContent = `${v.length} / ${cfg.maxLength}`; }
  // Update tab badge
  const tabs = document.getElementById('tabs');
  if (tabs) {
    const tabEl = tabs.querySelector(`.tab:nth-child(${Object.keys(PLATFORMS).indexOf(p)+1})`);
    if (tabEl) { const b = tabEl.querySelector('.badge'); if (b) b.outerHTML = badge(p); else if (badge(p)) tabEl.insertAdjacentHTML('beforeend', badge(p)); }
  }
}

function onTags(p, v) {
  state.drafts[p].hashtags = v.split(',').map(t => t.trim().replace(/^#/,'')).filter(Boolean);
}

async function handleGenerate(p) {
  if (!state.neonContext) return;
  state.generating[p] = true; renderBody();
  try {
    const result = await api('generate-post', 'POST', { platform:p, neonContext:state.neonContext });
    if (result.text) {
      state.drafts[p].text = result.text;
      if (result.hashtags?.length) state.drafts[p].hashtags = result.hashtags;
    }
  } catch(e) { console.error('Generate failed:', e); }
  finally { state.generating[p] = false; renderBody(); }
}

async function handleGenerateAll() {
  for (const p of Object.keys(PLATFORMS)) {
    if (!state.writebacks[p]) await handleGenerate(p);
  }
}

async function handlePublish(p) {
  const d = state.drafts[p];
  state.publishing[p] = true; renderBody();
  try {
    const tags = d.hashtags.map(t => `#${t}`).join(' ');
    const text = tags ? `${d.text}\n\n${tags}` : d.text;
    const imageUrl = d.selectedImage !== 'none' ? imgUrl(d.selectedImage) : null;
    const articleUrl = buildArticleUrl();
    const result = await api(`${p}/publish`, 'POST', { text, options:{ imageUrl, articleUrl } });
    if (result.success) { state.writebacks[p] = { ...result, text }; render(); }
  } catch(e) { alert(`Publish to ${PLATFORMS[p].displayName} failed: ${e.message}`); }
  finally { state.publishing[p] = false; }
}

function handleSaveAll() {
  if (window.self === window.top) return;
  // Resolve and persist imageUrl so the Neon webhook can publish images without re-resolving
  const draftsWithImageUrl = {};
  Object.keys(PLATFORMS).forEach(p => {
    const d = state.drafts[p];
    draftsWithImageUrl[p] = { ...d, imageUrl: d.selectedImage !== 'none' ? imgUrl(d.selectedImage) : null };
  });
  window.parent.postMessage({ type:'metadata-update', info:{ socialMediaDraft:draftsWithImageUrl } }, state.neonAppUrl||'*');
}

// --- Metrics polling ---
function startMetricsPoll(p) {
  if (state.metricsIntervals[p]) return;
  const postId = state.writebacks[p]?.postId;
  if (!postId) return;
  const poll = async () => {
    if (document.hidden) return;
    try {
      const res = await api(`${p}/metrics/${encodeURIComponent(postId)}`);
      if (res.success && state.writebacks[p]) {
        state.writebacks[p].metrics = res.metrics;
        if (state.active === p) updateMetricCards(p, res.metrics);
      }
    } catch(_) {}
  };
  poll();
  state.metricsIntervals[p] = setInterval(poll, 30000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    Object.keys(PLATFORMS).forEach(p => { if (state.metricsIntervals[p] && state.writebacks[p]) startMetricsPoll(p); });
  }
});

// --- Helpers ---
function buildArticleUrl() {
  const ch = state.neonContext?.channel || {};
  const base = ch.frontofficeUrls?.[0] || ch.frontofficeUrl || '';
  const node = state.neonContext?.originalNode || {};
  const slug = node.slug || node.name || node.uuid || '';
  return base && slug ? `${base}/${slug}` : null;
}

// --- Init ---
async function init() {
  render();
  if (window.self !== window.top) {
    window.parent.postMessage({ type:'panel-ready', info:{ op:'getInfo' } }, '*');
  }
  await loadStatuses();
}
init();
</script>
</body>
</html>
```

- [ ] **Step 2: Open panel in browser to verify it loads**

With server running (`npm run dev`):

```
http://localhost:3000/panels/social-publisher?apikey=12345678-1234-1234-1234-123456789abc
```

Expected: panel loads with 5 tabs (Twitter/X, Facebook, Instagram, Threads, Bluesky). Each tab shows `no config` badge unless env vars are set. Clicking tabs switches content area.

- [ ] **Step 3: Commit**

```bash
git add src/panels/social-publisher-panel.hbs
git commit -m "feat: add Social Publisher panel with tabbed UI for all 5 platforms"
```

---

## Task 10: Update Webhook to Use Registry

**Files:**
- Modify: `src/requestHandlers/neon-webhooks.js`

- [ ] **Step 1: Replace the `handleSocialMediaPublish` function body**

Find `async function handleSocialMediaPublish(neonModel)` (line 428). Replace the entire function body:

```javascript
async function handleSocialMediaPublish(neonModel) {
  console.log('[Social Publisher Webhook] Processing social media publish request');
  const registry = require('../connectors/connector-registry');

  try {
    const modelData = neonModel.data || neonModel;
    const socialMediaDraft = (modelData.metadata || {}).socialMediaDraft;

    if (!socialMediaDraft) {
      console.log('[Social Publisher Webhook] No socialMediaDraft in metadata — skipping');
      return { status: 'skipped', message: 'No social media draft data' };
    }

    const publishedBy = neonModel.user || neonModel.publisher || 'system@neon.com';
    const socialMediaHook = {};

    for (const [platform, draft] of Object.entries(socialMediaDraft)) {
      if (!draft.enabled) {
        console.log(`[Social Publisher Webhook] ${platform} disabled — skipping`);
        continue;
      }
      try {
        const connector = registry.getConnector(platform);
        const tags = (draft.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
        const text = tags ? `${draft.text || ''}\n\n${tags}` : (draft.text || '');
        const imageUrl = draft.imageUrl || null;

        console.log(`[Social Publisher Webhook] Publishing to ${platform}...`);
        const result = await connector.publish(text, { imageUrl });

        if (result.success) {
          socialMediaHook[platform] = {
            postId: result.postId,
            url: result.postUrl,
            publishedAt: result.publishedAt,
            publishedBy
          };
          console.log(`[Social Publisher Webhook] ✓ ${platform}: ${result.postUrl}`);
        }
      } catch (err) {
        console.error(`[Social Publisher Webhook] ✗ ${platform}:`, err.message);
        // Continue with other platforms
      }
    }

    if (Object.keys(socialMediaHook).length > 0) {
      return { status: 'success', action: 'Social media posts published', writeback: { socialMediaHook } };
    }
    return { status: 'warning', message: 'No platforms were successfully published' };

  } catch (error) {
    console.error('[Social Publisher Webhook] Error:', error);
    return { status: 'error', message: 'Failed to publish to social media', error: error.message };
  }
}
```

- [ ] **Step 2: Verify webhook still exports correctly**

```bash
node -e "const w = require('./src/requestHandlers/neon-webhooks'); console.log(typeof w.handleSocialMediaPublish)"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add src/requestHandlers/neon-webhooks.js
git commit -m "refactor: webhook uses connector registry instead of direct Bluesky import"
```

---

## Task 11: Env Vars, Cleanup, and Cutover

**Files:**
- Modify: `.env.example`
- Modify: `server.js` (retire old routes)

- [ ] **Step 1: Add new platform vars to `.env.example`**

Find the `# Bluesky Social Media Integration` section in `.env.example` and replace it with:

```bash
# Social Publisher — Platform Credentials
# All platforms use the connector registry (src/connectors/connector-registry.js)

# Bluesky (AT Protocol)
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=your-bluesky-app-password-here

# Twitter / X (API v2 — requires OAuth 1.0a: create app at developer.twitter.com)
TWITTER_API_KEY=your_twitter_api_key_25chars
TWITTER_API_SECRET=your_twitter_api_secret_50chars
TWITTER_ACCESS_TOKEN=your_twitter_access_token_50chars
TWITTER_ACCESS_SECRET=your_twitter_access_token_secret_45chars

# Facebook (Meta Graph API v21.0 — requires Facebook Page + Page Access Token)
FACEBOOK_PAGE_ID=your_facebook_page_id
FACEBOOK_PAGE_ACCESS_TOKEN=your_facebook_page_access_token

# Instagram (Instagram Graph API — requires Instagram Professional account linked to Facebook Page)
# Uses same access token as Facebook if accounts are linked
INSTAGRAM_ACCOUNT_ID=your_instagram_account_id
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token

# Threads (Threads Graph API v1.0 — requires Threads account)
THREADS_USER_ID=your_threads_user_id
THREADS_ACCESS_TOKEN=your_threads_access_token
```

- [ ] **Step 2: Retire old social-media routes in `server.js`**

Find and remove (or comment out) these lines in `server.js`:

```javascript
// REMOVE:
fastify.get("/panels/social-media", panelHandlers.socialMediaPanelHandler);
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/social-media/api/*',
    handler: panelHandlers.socialMediaApiProxyHandler
  });
});
```

Also update the endpoint documentation block (around line 145–146) to reference the new panel:

```javascript
{ name: "Social Publisher Panel", endpoint: "GET /panels/social-publisher", demoUrl: "/panels/social-publisher", description: "Unified social publishing panel for Twitter/X, Facebook, Instagram, Threads, Bluesky — with AI content generation, publication, and live metrics." },
{ name: "Social Publisher API", endpoint: "ALL /panels/social-publisher/api/*", description: "Connector registry API: /{platform}/status, /{platform}/publish, /{platform}/metrics/{id}, /generate-post" },
```

- [ ] **Step 3: Restart server and verify old route is gone**

```bash
npm run dev
```

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/panels/social-media?apikey=12345678-1234-1234-1234-123456789abc"
```

Expected: `404`

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/panels/social-publisher?apikey=12345678-1234-1234-1234-123456789abc"
```

Expected: `200`

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example server.js
git commit -m "chore: retire old social-media routes, add new platform env vars to .env.example"
```

---

## End-to-End Verification

After all tasks complete, perform these checks:

**1. Panel loads with correct tabs**
```
http://localhost:3000/panels/social-publisher?apikey=<key>
```
— 5 tabs visible, connector status badges appear after ~1s.

**2. Status endpoint works for all platforms**
```bash
for p in twitter facebook instagram threads bluesky; do
  echo "$p:"; curl -s -H "apikey: <key>" "http://localhost:3000/panels/social-publisher/api/$p/status"; echo;
done
```

**3. AI generation works**
```bash
curl -s -X POST -H "apikey: <key>" -H "Content-Type: application/json" \
  -d '{"platform":"twitter","neonContext":{"originalNode":{"title":"Test Article"},"channel":{}}}' \
  "http://localhost:3000/panels/social-publisher/api/generate-post"
```
Expected: `{"text":"...","hashtags":[...],"characterCount":...,"aiProvider":"claude"}`

**4. Webhook integration (simulate)**
```bash
curl -s -X POST -H "apikey: <key>" -H "Content-Type: application/json" \
  -d '{"metadata":{"socialMediaDraft":{"bluesky":{"enabled":true,"text":"Test post","hashtags":["test"]}}}}' \
  "http://localhost:3000/in/neon-webhook"
```
Expected (if Bluesky configured): `{"status":"success","action":"Social media posts published",...}`

**5. Panel in Neon CMS** — open the panel inside Neon, verify PostMessage handshake works (drafts load from node metadata, save drafts writes back).
