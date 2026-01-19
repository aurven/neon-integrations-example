const https = require('https');
const axios = require('axios');

const NEON_FO_APIKEY = process.env.NEON_FO_APIKEY;

function getFrontOfficeUrl(siteName, environment = 'live') {
  console.log(`[getFrontOfficeUrl] siteName: ${siteName}, environment: ${environment}`);
  // Build env var name: NEON_FO_THEGLOBE_LIVE_URL, NEON_FO_THEGLOBE_PREVIEW_URL, etc.
  const envVarName = `NEON_FO_${siteName.toUpperCase()}_${environment.toUpperCase()}_URL`;
  const url = process.env[envVarName];
  console.log(`[getFrontOfficeUrl] returning: ${url}`);
  return url;
}

async function getNodeById({ siteName, targetId, environment }) {
  console.log(`[getNodeById] siteName: ${siteName}, targetId: ${targetId}, environment: ${environment}, NEON_FO_APIKEY: ${NEON_FO_APIKEY}`);
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
  console.log(`[getResource] siteName: ${siteName}, url: ${url}, environment: ${environment}, NEON_FO_APIKEY: ${NEON_FO_APIKEY}`);
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
