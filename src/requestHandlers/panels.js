const seo = require("../seo.json");
const axios = require("axios");
const neon = require("../helpers/neon-bo-api.js");
const imagesImporter = require("../images-importer.js");

function trelloPanelHandler(request, reply) {
  const apikey = request.query.apikey;
  const externalRef = request.query.externalRef;

  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { 
    seo: seo, 
    apiKey: process.env.NEON_EXT_APIKEY,
    neonAppUrl: process.env.NEON_APP_URL,
    trelloApiKey: process.env.TRELLO_APIKEY,
    trelloToken: process.env.TRELLO_TOKEN,
    trelloOrganizationId: process.env.TRELLO_ORGANIZATION_ID,
    externalRef: externalRef || null,
    isDraggable: !!process.env.TRELLO_PANEL_DRAGGABLE
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/trello-panel.hbs", params);
}

function externalSourcesPanelHandler(request, reply) {
  const apikey = request.query.apikey;

  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { 
    seo: seo, 
    apiKey: process.env.NEON_EXT_APIKEY,
    pexelsApiKey: process.env.PEXELS_APIKEY,
    integrationsApiKey: process.env.NEON_EXT_APIKEY
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/external-sources-panel.hbs", params);
}

async function trelloApiProxyHandler(request, reply) {
  const apikey = request.headers.apikey || request.query.apikey;

  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Extract endpoint from the full URL path
  const fullPath = request.url.split('?')[0]; // Remove query string
  const endpoint = fullPath.replace('/panels/trello/api/', '');
  const method = request.method.toLowerCase();
  
  try {
    const baseUrl = 'https://api.trello.com/1';
    const url = `${baseUrl}/${endpoint}`;
    
    // Set up OAuth Authorization header
    const authHeader = `OAuth oauth_consumer_key="${process.env.TRELLO_APIKEY}", oauth_token="${process.env.TRELLO_TOKEN}"`;
    
    const config = {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      params: request.query // Pass through any additional query parameters
    };

    let response;
    if (method === 'get') {
      response = await axios.get(url, config);
    } else if (method === 'post') {
      response = await axios.post(url, request.body, config);
    } else if (method === 'put') {
      response = await axios.put(url, request.body, config);
    } else if (method === 'delete') {
      response = await axios.delete(url, config);
    }

    return reply.send(response.data);
  } catch (error) {
    console.error('Trello API proxy error:', error.response?.data || error.message);
    return reply.status(error.response?.status || 500).send({
      error: 'Trello API error',
      details: error.response?.data || error.message
    });
  }
}

async function pexelsApiProxyHandler(request, reply) {
  const apikey = request.headers.apikey || request.query.apikey;

  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Extract endpoint from the full URL path
  const fullPath = request.url.split('?')[0]; // Remove query string
  const endpoint = fullPath.replace('/panels/external-sources/api/', '');
  const method = request.method.toLowerCase();
  
  try {
    const baseUrl = endpoint.includes('videos') ? 
      'https://api.pexels.com/videos' : 
      'https://api.pexels.com/v1';
    
    const url = `${baseUrl}/${endpoint}`;
    
    const config = {
      headers: {
        'Authorization': process.env.PEXELS_APIKEY,
        'Content-Type': 'application/json'
      },
      params: request.query // Pass through query parameters
    };

    let response;
    if (method === 'get') {
      response = await axios.get(url, config);
    } else if (method === 'post') {
      response = await axios.post(url, request.body, config);
    } else if (method === 'put') {
      response = await axios.put(url, request.body, config);
    } else if (method === 'delete') {
      response = await axios.delete(url, config);
    }

    return reply.send(response.data);
  } catch (error) {
    console.error('Pexels API proxy error:', error.response?.data || error.message);
    return reply.status(error.response?.status || 500).send({
      error: 'Pexels API error',
      details: error.response?.data || error.message
    });
  }
}

async function uploadAssetHandler(request, reply) {
  const apikey = request.headers.apikey || request.query.apikey;
  
  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  const { imageUrl, imageName, workspace } = request.body;
  
  if (!imageUrl) {
    return reply.status(400).send({ error: "imageUrl is required" });
  }
  
  try {
    console.log(`Starting Neon session for asset upload: ${imageUrl}`);
    
    // Login to Neon
    await neon.login();
    
    // Upload the image
    const uploadResult = await imagesImporter.uploadImage({
      imageName: imageName || `trello-asset-${Date.now()}`,
      imageUrl: imageUrl,
      workspace: workspace,
      story: {}
    });
    
    // Logout from Neon
    await neon.logout();
    
    console.log(`Asset uploaded successfully:`, uploadResult);
    
    return reply.send({
      success: true,
      result: uploadResult,
      message: 'Asset uploaded successfully to Neon'
    });
    
  } catch (error) {
    console.error('Asset upload error:', error.message);
    
    // Ensure logout even on error
    try {
      await neon.logout();
    } catch (logoutError) {
      console.error('Error during cleanup logout:', logoutError.message);
    }
    
    return reply.status(500).send({
      error: 'Asset upload failed',
      details: error.message
    });
  }
}

module.exports = {
  trelloPanelHandler,
  trelloApiProxyHandler,
  externalSourcesPanelHandler,
  pexelsApiProxyHandler,
  uploadAssetHandler
};