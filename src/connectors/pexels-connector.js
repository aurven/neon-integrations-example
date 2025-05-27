const axios = require("axios");

const PEXELS_APIKEY = process.env.PEXELS_APIKEY;
const PEXELS_URL = 'https://api.pexels.com';

async function getPhotos(query) {
  console.log('Pexels get Photos. Query: "' + query + '"');
  const url = `${PEXELS_URL}/v1/${query ? 'search?query=' + query + '&' : 'curated?'}per_page=20`;
  console.log(url);

  const config = {
      method: 'get',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      url,
      headers: {
          'Content-Type': 'application/json',
          'Authorization': PEXELS_APIKEY
      }
  };

  return await axios.request(config)
      .then((response) => {
          console.log(JSON.stringify(response.data));
          return response.data;
      })
      .catch((error) => {
          console.error(`❌ ERROR: ${error.code}`);
          console.error(JSON.stringify(error.response.data));
      });
}

async function getVideos(query) {
  
  const url = `${PEXELS_URL}/videos/${query ? 'search?query=' + query + '&' : 'popular?'}per_page=20`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: PEXELS_APIKEY,
      "Content-Type": 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Pexels API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  
  return data;
}

module.exports = {
  getPhotos,
  getVideos
}