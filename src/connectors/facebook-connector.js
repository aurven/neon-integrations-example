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

  try {
    const response = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, body);
    const postId = response.data.id;
    const [pid, oid] = postId.split('_');
    return {
      success: true,
      postId,
      postUrl: `https://www.facebook.com/${pid}/posts/${oid}`,
      publishedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to publish to Facebook: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function getMetrics(postId) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  try {
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
  } catch (error) {
    throw new Error(`Failed to get Facebook metrics: ${error.response?.data?.error?.message || error.message}`);
  }
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
