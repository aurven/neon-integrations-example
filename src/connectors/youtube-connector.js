const axios = require("axios");

const YOUTUBE_APIKEY = process.env.YOUTUBE_APIKEY;
const YOUTUBE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Search for YouTube videos
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results (default: 20)
 * @returns {Promise<Object>} YouTube API response with video results
 */
async function searchVideos(query, maxResults = 20) {
  console.log(`YouTube search videos. Query: "${query}"`);

  const params = {
    part: 'snippet',
    type: 'video',
    maxResults: maxResults,
    key: YOUTUBE_APIKEY
  };

  if (query) {
    params.q = query;
  } else {
    // If no query, get popular videos
    params.chart = 'mostPopular';
  }

  const url = `${YOUTUBE_URL}/search`;
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

    // Transform the response to include video details
    const videoIds = response.data.items.map(item => item.id.videoId || item.id).join(',');

    // Get additional video details (statistics, contentDetails)
    const detailsResponse = await getVideoDetails(videoIds);

    // Merge search results with video details
    const enrichedItems = response.data.items.map(item => {
      const videoId = item.id.videoId || item.id;
      const details = detailsResponse.items.find(d => d.id === videoId);

      return {
        ...item,
        id: videoId,
        statistics: details?.statistics,
        contentDetails: details?.contentDetails,
        // Add direct video URL
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        // Add thumbnail URL (highest quality available)
        thumbnailUrl: item.snippet.thumbnails.high?.url ||
                      item.snippet.thumbnails.medium?.url ||
                      item.snippet.thumbnails.default?.url
      };
    });

    return {
      ...response.data,
      items: enrichedItems
    };
  } catch (error) {
    console.error(`❌ ERROR: ${error.code}`);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get video details by video IDs
 * @param {string} videoIds - Comma-separated video IDs
 * @returns {Promise<Object>} Video details response
 */
async function getVideoDetails(videoIds) {
  const url = `${YOUTUBE_URL}/videos`;

  const config = {
    method: 'get',
    url,
    params: {
      part: 'snippet,contentDetails,statistics',
      id: videoIds,
      key: YOUTUBE_APIKEY
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    console.error('Error fetching video details:', error.message);
    return { items: [] };
  }
}

/**
 * Get popular/trending videos
 * @param {number} maxResults - Maximum number of results (default: 20)
 * @returns {Promise<Object>} Popular videos response
 */
async function getPopularVideos(maxResults = 20) {
  console.log('YouTube get popular videos');

  const url = `${YOUTUBE_URL}/videos`;

  const config = {
    method: 'get',
    url,
    params: {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      maxResults: maxResults,
      key: YOUTUBE_APIKEY
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(config);

    // Add URLs to each item
    const enrichedItems = response.data.items.map(item => ({
      ...item,
      videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
      embedUrl: `https://www.youtube.com/embed/${item.id}`,
      thumbnailUrl: item.snippet.thumbnails.high?.url ||
                    item.snippet.thumbnails.medium?.url ||
                    item.snippet.thumbnails.default?.url
    }));

    return {
      ...response.data,
      items: enrichedItems
    };
  } catch (error) {
    console.error(`❌ ERROR: ${error.code}`);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  searchVideos,
  getPopularVideos,
  getVideoDetails
};
