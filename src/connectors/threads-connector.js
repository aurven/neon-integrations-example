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

  try {
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
  } catch (error) {
    throw new Error(`Failed to publish to Threads: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function getMetrics(postId) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  try {
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
  } catch (error) {
    throw new Error(`Failed to get Threads metrics: ${error.response?.data?.error?.message || error.message}`);
  }
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
