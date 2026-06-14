const axios = require('axios');

/**
 * Bluesky AT Protocol Connector
 * Handles authentication, post publishing, and metrics retrieval
 * API Docs: https://docs.bsky.app/docs/api/
 */

const BLUESKY_API_URL = 'https://bsky.social/xrpc';

// In-memory session cache
let sessionCache = {
  did: null,
  accessJwt: null,
  refreshJwt: null,
  handle: null,
  expiresAt: null
};

/**
 * Authenticate with Bluesky and get session tokens
 * @returns {Promise<Object>} Session with DID and access token
 */
async function authenticate() {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;

  if (!handle || !appPassword) {
    throw new Error('Bluesky credentials not configured. Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in .env');
  }

  // Check if we have a valid cached session
  if (sessionCache.accessJwt && sessionCache.expiresAt && Date.now() < sessionCache.expiresAt) {
    console.log('[Bluesky] Using cached session');
    return sessionCache;
  }

  try {
    console.log(`[Bluesky] Authenticating as ${handle}...`);

    const response = await axios.post(`${BLUESKY_API_URL}/com.atproto.server.createSession`, {
      identifier: handle,
      password: appPassword
    });

    const session = response.data;

    // Cache session (expires in ~2 hours, we'll refresh at 1.5 hours)
    sessionCache = {
      did: session.did,
      accessJwt: session.accessJwt,
      refreshJwt: session.refreshJwt,
      handle: session.handle,
      expiresAt: Date.now() + (90 * 60 * 1000) // 1.5 hours
    };

    console.log(`[Bluesky] Authenticated successfully as ${session.handle} (${session.did})`);

    return sessionCache;
  } catch (error) {
    console.error('[Bluesky] Authentication failed:', error.response?.data || error.message);
    throw new Error(`Bluesky authentication failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Refresh session token
 * @returns {Promise<Object>} Refreshed session
 */
async function refreshSession() {
  if (!sessionCache.refreshJwt) {
    return await authenticate();
  }

  try {
    console.log('[Bluesky] Refreshing session...');

    const response = await axios.post(`${BLUESKY_API_URL}/com.atproto.server.refreshSession`, {}, {
      headers: {
        'Authorization': `Bearer ${sessionCache.refreshJwt}`
      }
    });

    const session = response.data;

    sessionCache = {
      ...sessionCache,
      accessJwt: session.accessJwt,
      refreshJwt: session.refreshJwt,
      expiresAt: Date.now() + (90 * 60 * 1000)
    };

    console.log('[Bluesky] Session refreshed successfully');

    return sessionCache;
  } catch (error) {
    console.error('[Bluesky] Session refresh failed, re-authenticating...');
    return await authenticate();
  }
}

/**
 * Get authenticated session (with auto-refresh)
 * @returns {Promise<Object>} Valid session
 */
async function getSession() {
  if (!sessionCache.accessJwt || Date.now() >= sessionCache.expiresAt) {
    return await authenticate();
  }
  return sessionCache;
}

/**
 * Publish a post to Bluesky
 * @param {string} text - Post text content
 * @param {Object} options - Optional parameters (imageBlob, facets, etc.)
 * @returns {Promise<Object>} Published post data with uri and url
 */
async function publishPost(text, options = {}) {
  try {
    const session = await getSession();

    const now = new Date().toISOString();

    // Build post record
    const record = {
      text: text,
      createdAt: now,
      $type: 'app.bsky.feed.post'
    };

    // Add facets (links, mentions, hashtags) if provided
    if (options.facets) {
      record.facets = options.facets;
    }

    // Add embedded images if provided
    if (options.images && options.images.length > 0) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: options.images
      };
    }

    console.log('[Bluesky] Publishing post:', { text: text.substring(0, 50) + '...' });

    const response = await axios.post(`${BLUESKY_API_URL}/com.atproto.repo.createRecord`, {
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: record
    }, {
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json'
      }
    });

    const postData = response.data;
    const postUri = postData.uri;

    // Extract post ID from URI (at://did:plc:xxx/app.bsky.feed.post/yyy)
    const postId = postUri.split('/').pop();

    // Build web URL
    const postUrl = `https://bsky.app/profile/${session.handle}/post/${postId}`;

    console.log(`[Bluesky] Post published successfully: ${postUrl}`);

    return {
      success: true,
      postUri: postUri,
      postUrl: postUrl,
      cid: postData.cid,
      publishedAt: now
    };
  } catch (error) {
    console.error('[Bluesky] Post publish failed:', error.response?.data || error.message);
    throw new Error(`Failed to publish post: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get post details and metrics from Bluesky
 * @param {string} postUri - Post URI (at://did:plc:xxx/app.bsky.feed.post/yyy)
 * @returns {Promise<Object>} Post data with metrics
 */
async function getPostMetrics(postUri) {
  try {
    const session = await getSession();

    console.log(`[Bluesky] Fetching metrics for post: ${postUri}`);

    // Use app.bsky.feed.getPosts to get post details including metrics
    const response = await axios.get(`${BLUESKY_API_URL}/app.bsky.feed.getPosts`, {
      params: {
        uris: postUri
      },
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`
      }
    });

    const posts = response.data.posts;

    if (!posts || posts.length === 0) {
      throw new Error('Post not found');
    }

    const post = posts[0];

    // Extract metrics
    const metrics = {
      likes: post.likeCount || 0,
      reposts: post.repostCount || 0,
      replies: post.replyCount || 0,
      quotes: post.quoteCount || 0
    };

    // Extract post ID for URL
    const postId = postUri.split('/').pop();
    const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`;

    console.log(`[Bluesky] Metrics fetched:`, metrics);

    return {
      success: true,
      postUri: postUri,
      postUrl: postUrl,
      author: {
        did: post.author.did,
        handle: post.author.handle,
        displayName: post.author.displayName
      },
      text: post.record.text,
      createdAt: post.record.createdAt,
      metrics: metrics
    };
  } catch (error) {
    console.error('[Bluesky] Failed to fetch post metrics:', error.response?.data || error.message);

    // Check if post was deleted or not found
    if (error.message === 'Post not found' || error.response?.status === 404) {
      return {
        success: false,
        error: 'Post not found or deleted',
        postUri: postUri
      };
    }

    throw new Error(`Failed to fetch metrics: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Parse rich text and extract facets (links, mentions, hashtags)
 * @param {string} text - Post text
 * @returns {Object} Parsed text with facets
 */
function parseRichText(text) {
  const facets = [];
  let byteOffset = 0;

  // Helper to convert string index to byte index (UTF-8)
  function getByteLength(str) {
    return Buffer.byteLength(str, 'utf8');
  }

  // Extract URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let urlMatch;
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const url = urlMatch[0];
    const startIndex = urlMatch.index;
    const endIndex = startIndex + url.length;

    facets.push({
      index: {
        byteStart: getByteLength(text.substring(0, startIndex)),
        byteEnd: getByteLength(text.substring(0, endIndex))
      },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        uri: url
      }]
    });
  }

  // Extract mentions (@handle)
  const mentionRegex = /@([a-zA-Z0-9.-]+)/g;
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(text)) !== null) {
    const mention = mentionMatch[0];
    const handle = mentionMatch[1];
    const startIndex = mentionMatch.index;
    const endIndex = startIndex + mention.length;

    facets.push({
      index: {
        byteStart: getByteLength(text.substring(0, startIndex)),
        byteEnd: getByteLength(text.substring(0, endIndex))
      },
      features: [{
        $type: 'app.bsky.richtext.facet#mention',
        did: `handle:${handle}` // Will be resolved by Bluesky
      }]
    });
  }

  // Extract hashtags (#tag)
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
  let hashtagMatch;
  while ((hashtagMatch = hashtagRegex.exec(text)) !== null) {
    const hashtag = hashtagMatch[0];
    const tag = hashtagMatch[1];
    const startIndex = hashtagMatch.index;
    const endIndex = startIndex + hashtag.length;

    facets.push({
      index: {
        byteStart: getByteLength(text.substring(0, startIndex)),
        byteEnd: getByteLength(text.substring(0, endIndex))
      },
      features: [{
        $type: 'app.bsky.richtext.facet#tag',
        tag: tag
      }]
    });
  }

  return {
    text: text,
    facets: facets.length > 0 ? facets : undefined
  };
}

/**
 * Clear session cache (for logout or testing)
 */
function clearSession() {
  sessionCache = {
    did: null,
    accessJwt: null,
    refreshJwt: null,
    handle: null,
    expiresAt: null
  };
  console.log('[Bluesky] Session cache cleared');
}

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
