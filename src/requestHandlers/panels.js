const seo = require("../seo.json");
const axios = require("axios");
const neon = require("../helpers/neon-bo-api.js");
const neonV2 = require("../helpers/neon-bo-api-v2.js");
const imagesImporter = require("../images-importer.js");
const { MethodeClient } = require("../helpers/methode-bo-api.js");
const { createStoryPreviewWithSetup } = require("../helpers/edapi-utils.js");
const { authenticate } = require("../helpers/auth.js");
const { parseNeonArticleContent } = require("../helpers/neon-content-parser.js");
const { generateArticlePDF } = require("../helpers/pdf-generator.js");

function trelloPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const externalRef = request.query.externalRef;

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey,
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
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey,
    pexelsApiKey: process.env.PEXELS_APIKEY,
    integrationsApiKey: auth.apikey
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/external-sources-panel.hbs", params);
}

async function trelloApiProxyHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
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
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
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
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
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
      workspace: workspace || '/Convergent/News',
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

function methodePanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const methodeId = request.query.methodeId;

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL,
    swingAppUrl: process.env.SWING_APP_URL,
    swingHost: process.env.SWING_HOST,
    methodeId: methodeId || null
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/methode-panel.hbs", params);
}

function quickchartPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/quickchart-panel.hbs", params);
}

async function methodeApiProxyHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Extract endpoint from the full URL path
  const fullPath = request.url.split('?')[0];
  const endpoint = fullPath.replace('/panels/methode/api/', '');
  const method = request.method.toLowerCase();
  
  try {
    // Create a temporary Méthode client for this request
    const methodeClient = new MethodeClient();
    
    // Login with credentials from environment
    await methodeClient.login({
      username: process.env.EDAPI_USERNAME,
      password: process.env.EDAPI_PASSWORD
    });

    let result;
    
    // Handle different endpoint patterns
    if (endpoint.startsWith('object/')) {
      const objectId = endpoint.split('/')[1];
      if (!objectId) {
        return reply.status(400).send({ error: "Object ID is required" });
      }

      // Get the Méthode object
      const methodeObject = await methodeClient.getObject(objectId);

      if (!methodeObject) {
        return reply.status(404).send({ error: "Object not found" });
      }

      // Transform the raw Méthode object into our panel format
      const transformedObject = {
        id: methodeObject.id || objectId,
        title: methodeObject.systemAttributes?.props?.title || 'Untitled',
        workflowStatus: methodeObject.statusInfo?.name || 'unknown',
        workflowStatusColor: methodeObject.statusInfo?.identifier || '#000000',
        pdfUrl: methodeObject.pdfUrl || null,
        publicationInfo: {
          products: methodeObject.products || [],
          editions: methodeObject.editions || [],
          pages: methodeObject.pages || []
        }
      };

      result = { result: transformedObject };
    } else if (endpoint === 'preview/create' && method === 'post') {
      const { loid, options } = request.body;

      if (!loid) {
        return reply.status(400).send({ error: "LOID is required" });
      }

      console.log(`Creating story preview for LOID: ${loid} with options:`, options);

      // Use the edapi-utils function to create story preview with setup
      const previewResult = await createStoryPreviewWithSetup(loid, options);

      console.log('Preview creation result:', previewResult);

      result = {
        success: true,
        data: previewResult,
        message: 'Story preview creation initiated'
      };
    } else if (endpoint.startsWith('content/') && method === 'get') {
      // Handle binary content requests like content/lowres/{loid}
      const pathParts = endpoint.split('/');
      if (pathParts.length >= 3) {
        const format = pathParts[1]; // e.g., 'lowres'
        const loid = pathParts[2]; // the LOID
        const maxSize = request.query.maxSize || 4;

        if (!loid) {
          return reply.status(400).send({ error: "LOID is required" });
        }

        console.log(`Fetching ${format} content for LOID: ${loid} with maxSize: ${maxSize}`);

        try {
          // Get the binary content using the new API method
          const binaryData = await methodeClient.getBinaryContent(loid, format, maxSize);

          // Set appropriate headers for binary content
          reply.header('Content-Type', 'image/png'); // Assuming PNG format, adjust as needed
          reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

          // Cleanup the client before sending response
          await methodeClient.cleanup();

          return reply.send(Buffer.from(binaryData));
        } catch (error) {
          console.error(`Binary content retrieval failed for ${format}/${loid}:`, error.message);
          return reply.status(error.response?.status || 500).send({
            error: 'Binary content retrieval failed',
            details: error.message
          });
        }
      } else {
        return reply.status(400).send({ error: "Invalid content endpoint format" });
      }
    } else {
      // Handle other endpoints as needed
      return reply.status(400).send({ error: "Unknown endpoint" });
    }

    // Cleanup the client
    await methodeClient.cleanup();

    return reply.send(result);
  } catch (error) {
    console.error('Méthode API proxy error:', error.response?.data || error.message);
    return reply.status(error.response?.status || 500).send({
      error: 'Méthode API error',
      details: error.response?.data || error.message
    });
  }
}

function articlePdfPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const objectId = request.query.objectId;

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL,
    objectId: objectId || null
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/article-pdf-panel.hbs", params);
}

async function generateArticlePdfHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const objectId = request.query.objectId;
  const demoMode = request.query.demo === 'true';

  if (!objectId && !demoMode) {
    return reply.status(400).send({ error: "objectId query parameter is required (or use demo=true)" });
  }

  try {
    let articleObject;

    if (demoMode) {
      // Demo mode: load from local example file
      console.log('Demo mode enabled - loading from local example file');
      const fs = require('fs');
      const path = require('path');
      const exampleFilePath = path.join(__dirname, '../../examples/out-methode.json');

      try {
        const fileContent = fs.readFileSync(exampleFilePath, 'utf8');
        articleObject = JSON.parse(fileContent);
        console.log('Demo article loaded from:', exampleFilePath);
      } catch (fileError) {
        console.error('Error loading demo file:', fileError.message);
        return reply.status(500).send({
          error: 'Failed to load demo file',
          details: fileError.message
        });
      }
    } else {
      // Normal mode: fetch from Neon API using v2
      console.log(`Generating PDF for object: ${objectId}`);

      // Login to Neon (v2)
      await neonV2.login();

      // Fetch article data from Neon
      console.log(`Fetching article data for: ${objectId}`);
      articleObject = await neonV2.getNode(objectId);

      if (!articleObject) {
        await neonV2.logout();
        return reply.status(404).send({ error: "Article not found" });
      }

      // Logout from Neon
      await neonV2.logout();
    }

    // Parse article content
    console.log('Parsing article content...');
    const parsedArticle = parseNeonArticleContent(articleObject);

    console.log('Parsed article:', {
      title: parsedArticle.title,
      author: parsedArticle.author,
      siteName: parsedArticle.siteName,
      hasCoverImage: !!parsedArticle.coverImage,
      paragraphCount: parsedArticle.bodyParagraphs.length
    });

    // Generate PDF
    console.log('Generating PDF document...');
    const pdfDoc = await generateArticlePDF(parsedArticle);

    // Set response headers
    reply.type('application/pdf');
    const filename = demoMode ? 'demo-article-report.pdf' : `article-${objectId}-report.pdf`;
    reply.header('Content-Disposition', `inline; filename="${filename}"`);
    reply.header('Cache-Control', 'no-cache');

    // Stream PDF to response
    console.log('Streaming PDF to client...');

    // Pipe the PDF document to the response
    pdfDoc.pipe(reply.raw);

    // Finalize the PDF document (this triggers the 'end' event on the stream)
    pdfDoc.end();

    return reply;

  } catch (error) {
    console.error('Error generating PDF:', error);

    // Ensure logout even on error (only if not in demo mode)
    if (!demoMode) {
      try {
        await neonV2.logout();
      } catch (logoutError) {
        console.error('Error during cleanup logout:', logoutError.message);
      }
    }

    return reply.status(500).send({
      error: 'PDF generation failed',
      details: error.message
    });
  }
}

function ga4AnalyticsPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = {
    seo: seo,
    apiKey: auth.apikey
  };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/panels/ga4-analytics-panel.hbs", params);
}

module.exports = {
  trelloPanelHandler,
  trelloApiProxyHandler,
  externalSourcesPanelHandler,
  pexelsApiProxyHandler,
  uploadAssetHandler,
  methodePanelHandler,
  methodeApiProxyHandler,
  quickchartPanelHandler,
  articlePdfPanelHandler,
  generateArticlePdfHandler,
  ga4AnalyticsPanelHandler
};