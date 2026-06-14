const axios = require("axios");

const DAILYMOTION_APIKEY = process.env.DAILYMOTION_APIKEY;
const DAILYMOTION_APISECRET = process.env.DAILYMOTION_APISECRET;
const DAILYMOTION_URL = 'https://api.dailymotion.com';

// Cache for access token
let accessTokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get OAuth 2.0 access token for DailyMotion API
 * @returns {Promise<string|null>} Access token or null if credentials not configured
 */
async function getAccessToken() {
  // If no credentials, return null (API will work with limited access)
  if (!DAILYMOTION_APIKEY || !DAILYMOTION_APISECRET) {
    console.log('DailyMotion credentials not configured, using public access');
    return null;
  }

  // Check if we have a valid cached token
  if (accessTokenCache.token && accessTokenCache.expiresAt && Date.now() < accessTokenCache.expiresAt) {
    return accessTokenCache.token;
  }

  // Get new token
  try {
    const response = await axios.post('https://api.dailymotion.com/oauth/token', null, {
      params: {
        grant_type: 'client_credentials',
        client_id: DAILYMOTION_APIKEY,
        client_secret: DAILYMOTION_APISECRET
      }
    });

    const { access_token, expires_in } = response.data;

    // Cache the token (subtract 60 seconds for safety margin)
    accessTokenCache.token = access_token;
    accessTokenCache.expiresAt = Date.now() + (expires_in - 60) * 1000;

    console.log('DailyMotion access token obtained');
    return access_token;
  } catch (error) {
    console.error('Failed to get DailyMotion access token:', error.message);
    return null;
  }
}

/**
 * Search for DailyMotion videos
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results (default: 20)
 * @returns {Promise<Object>} DailyMotion API response with video results
 */
async function searchVideos(query, limit = 20) {
  console.log(`DailyMotion search videos. Query: "${query}"`);

  // Get access token (returns null if credentials not configured)
  const accessToken = await getAccessToken();

  const params = {
    fields: 'id,title,description,thumbnail_url,thumbnail_360_url,thumbnail_720_url,duration,created_time,views_total,owner.screenname,channel,url',
    limit: limit
  };

  // Add access token if available
  if (accessToken) {
    params.access_token = accessToken;
  }

  let endpoint;
  if (query) {
    params.search = query;
    endpoint = '/videos';
  } else {
    // If no query, get featured videos
    endpoint = '/videos';
    params.featured = true;
  }

  const url = `${DAILYMOTION_URL}${endpoint}`;
  console.log(`Fetching: ${url}`);

  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    url,
    params,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(config);

    // Transform response to standardize format
    const transformedItems = response.data.list?.map(item => ({
      ...item,
      videoUrl: item.url || `https://www.dailymotion.com/video/${item.id}`,
      embedUrl: `https://www.dailymotion.com/embed/video/${item.id}`,
      thumbnailUrl: item.thumbnail_720_url || item.thumbnail_360_url || item.thumbnail_url,
      author: item['owner.screenname'] || 'Unknown',
      viewCount: item.views_total
    })) || [];

    return {
      ...response.data,
      items: transformedItems
    };
  } catch (error) {
    console.error(`❌ ERROR: ${error.code}`);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get featured/popular videos
 * @param {number} limit - Maximum number of results (default: 20)
 * @returns {Promise<Object>} Featured videos response
 */
async function getFeaturedVideos(limit = 20) {
  console.log('DailyMotion get featured videos');

  // Get access token (returns null if credentials not configured)
  const accessToken = await getAccessToken();

  const params = {
    fields: 'id,title,description,thumbnail_url,thumbnail_360_url,thumbnail_720_url,duration,created_time,views_total,owner.screenname,channel,url',
    limit: limit,
    featured: true
  };

  // Add access token if available
  if (accessToken) {
    params.access_token = accessToken;
  }

  const url = `${DAILYMOTION_URL}/videos`;

  const config = {
    method: 'get',
    url,
    params,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(config);

    // Transform response to standardize format
    const transformedItems = response.data.list?.map(item => ({
      ...item,
      videoUrl: item.url || `https://www.dailymotion.com/video/${item.id}`,
      embedUrl: `https://www.dailymotion.com/embed/video/${item.id}`,
      thumbnailUrl: item.thumbnail_720_url || item.thumbnail_360_url || item.thumbnail_url,
      author: item['owner.screenname'] || 'Unknown',
      viewCount: item.views_total
    })) || [];

    return {
      ...response.data,
      items: transformedItems
    };
  } catch (error) {
    console.error(`❌ ERROR: ${error.code}`);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get video details by video ID
 * @param {string} videoId - Video ID
 * @returns {Promise<Object>} Video details response
 */
async function getVideoDetails(videoId) {
  // Get access token (returns null if credentials not configured)
  const accessToken = await getAccessToken();

  const url = `${DAILYMOTION_URL}/video/${videoId}`;

  const params = {
    fields: 'id,title,description,thumbnail_url,thumbnail_360_url,thumbnail_720_url,duration,created_time,views_total,owner.screenname,channel,url,tags'
  };

  // Add access token if available
  if (accessToken) {
    params.access_token = accessToken;
  }

  const config = {
    method: 'get',
    url,
    params,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(config);

    // Transform response
    return {
      ...response.data,
      videoUrl: response.data.url || `https://www.dailymotion.com/video/${response.data.id}`,
      embedUrl: `https://www.dailymotion.com/embed/video/${response.data.id}`,
      thumbnailUrl: response.data.thumbnail_720_url || response.data.thumbnail_360_url || response.data.thumbnail_url,
      author: response.data['owner.screenname'] || 'Unknown',
      viewCount: response.data.views_total
    };
  } catch (error) {
    console.error('Error fetching video details:', error.message);
    throw error;
  }
}

module.exports = {
  searchVideos,
  getFeaturedVideos,
  getVideoDetails
};
