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

  try {
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
  } catch (error) {
    if (error.message.includes('Instagram')) throw error;
    throw new Error(`Failed to publish to Instagram: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function getMetrics(postId) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  try {
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
  } catch (error) {
    throw new Error(`Failed to get Instagram metrics: ${error.response?.data?.error?.message || error.message}`);
  }
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
