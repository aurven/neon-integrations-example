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

function buildOAuthHeader(method, baseUrl, queryParams = {}) {
  const oauthParams = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  // Include query params in signature (OAuth 1.0a §3.4.1)
  const allParams = { ...queryParams, ...oauthParams };
  const paramString = Object.keys(allParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');
  const sigBase = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;
  const sigKey = `${encodeURIComponent(process.env.TWITTER_API_SECRET)}&${encodeURIComponent(process.env.TWITTER_ACCESS_SECRET)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');
  return 'OAuth ' + Object.keys(oauthParams)
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

async function publish(text, options = {}) {
  const url = `${TWITTER_API_BASE}/tweets`;
  try {
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
  } catch (error) {
    throw new Error(`Failed to publish to Twitter: ${error.response?.data?.detail || error.message}`);
  }
}

async function getMetrics(postId) {
  const baseUrl = `${TWITTER_API_BASE}/tweets/${postId}`;
  const queryParams = { 'tweet.fields': 'public_metrics' };
  try {
    const response = await axios.get(baseUrl, {
      params: queryParams,
      headers: { Authorization: buildOAuthHeader('GET', baseUrl, queryParams) }
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
  } catch (error) {
    throw new Error(`Failed to get Twitter metrics: ${error.response?.data?.detail || error.message}`);
  }
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
