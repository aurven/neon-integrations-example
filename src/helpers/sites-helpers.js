const frontoffice = require('../frontoffice.json');
const https = require('https');
const axios = require('axios');

const NEON_FO_APIKEY = process.env.NEON_FO_APIKEY;

function getFrontOfficeUrl(siteName, environment = 'live' ) {
  const url = frontoffice[siteName]?.urls?.[environment];

  return url;
}

async function getNodeById({ siteName, targetId, environment }) {
  const frontOfficeUrl = getFrontOfficeUrl(siteName, environment);

  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${frontOfficeUrl}/api/nodes/${targetId}`,
    headers: {
      "Content-Type": 'application/json',
      "neon-fo-access-key": NEON_FO_APIKEY,
    },
  };
  
  const insecureInstance = axios.create({
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false
    })
  });

  return await insecureInstance
    .request(config)
    .then((response) => {
      console.log(JSON.stringify(response.data));
      return response.data;
    })
    .catch((error) => {
      console.error(`❌ ERROR: ${error.code}`);
      console.error(JSON.stringify(error.response.data));
    });
}

async function getResource({ siteName, url, environment }) {
  const frontOfficeUrl = getFrontOfficeUrl(siteName, environment);

  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${frontOfficeUrl}${url}`,
    responseType: 'stream',
    headers: {
      "neon-fo-access-key": NEON_FO_APIKEY,
      Accept: 'image/*'
    },
  };
  
  const insecureInstance = axios.create({
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false
    })
  });

  return await insecureInstance
    .request(config)
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      console.error(`❌ ERROR: ${error.code}`);
      console.error(JSON.stringify(error.response.data));
    });
}

async function getResourceById({ siteName, targetId, environment = 'live' }) {
  const node = await getNodeById({ siteName, targetId, environment });
  const { resourceUrl } = node;
  return {
    node,
    data: await getResource({ siteName, url: resourceUrl, environment })
  };
}

module.exports = {
  getNodeById,
  getResource,
  getResourceById
};
