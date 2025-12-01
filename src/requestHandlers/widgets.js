const mammoth = require("mammoth");
const seo = require("../seo.json");
const openai = require("../ai/openai.js");
const storiesPopulator = require("../stories-populator.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

function testWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/test.hbs", params);
}

function dropWidgetHandler (request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  // Check for theme query parameter
  const theme = request.query.theme;
  const templatePath = theme === 'light' ? "/src/widgets/drop-a-doc-light.hbs" : "/src/widgets/drop-a-doc.hbs";

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view(templatePath, params);
}

async function asyncDropUploadWidgetHandler(request, reply) {
  const supportedDocs = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const supportedAudios = [
    'audio/mpeg',
    'audio/ogg'
  ];
  
  console.log("asyncDropUploadWidgetHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };
  
  const data = await request.file({
      limits: {
        fileSize: 10 * 1024 * 1024,  // 10mb limit
      }
    });
  
  //await data.toBuffer();
  console.log('asyncDropUploadWidgetHandler - File received!');
  
  const isDocument = data && data.mimetype && supportedDocs.includes(data.mimetype);
  const isAudio = data && data.mimetype && supportedAudios.includes(data.mimetype);
  
  async function stream2buffer(stream) {

      return new Promise((resolve, reject) => {

          const _buf = [];

          stream.on("data", (chunk) => _buf.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(_buf)));
          stream.on("error", (err) => reject(err));

      });
    }

  const dataBuffer = await stream2buffer(data.file);
  const fileName = data.filename;
  
  if (isDocument) {
    const parsedDoc = await mammoth.convertToHtml({buffer: dataBuffer})
      .then(function(result){
          const html = result.value; // The generated HTML
          const messages = result.messages; // Any messages, such as warnings during conversion
          return result;
      })
      .catch(function(error) {
          console.error(error);
      });

    const resultMessage = fileName + ' successfully imported!';
    console.log(resultMessage);
    console.log(parsedDoc);

    const docResponse = {
      message: resultMessage,
      document: parsedDoc
    };

    console.log("asyncDropUploadWidgetHandler << OUT:");
    console.log("Response Data:", docResponse);

    return reply.status(200).send(docResponse);
  }
  
  if (isAudio) {
    const transcription = await openai.transcribeAudio(dataBuffer, fileName);
    
    const { structure, metadata } = await openai.generateInterviewStructure(transcription);
    
    const neonPopulatorOptions = {
        "site": "TheGlobe",
        "workspace": "/Convergent/Sport",
        "directPublish": false,
        "siteAsChannel": false,
    };
    
    const processResult = await storiesPopulator.populateNeonInstance([
        {
            "id": fileName,
            "itemUrl": null,
            "overhead": "Interview",
            "headline": structure.headline,
            "summary": structure.summary,
            "byline": "Eidosmedia AI Suite",
            "figureURL": null,
            "localFigurePath": null,
            "figureCaption": null,
            "figureCredit": null,
            "mainContentHtml": structure.html,
            "metadata": metadata
        }
    ], neonPopulatorOptions);
    
    const resultMessage = fileName + ' successfully imported!';
    
    const responseBody = {
      message: resultMessage,
      transcription: transcription,
      structure: structure,
      neon: processResult
    };
    
    console.log('asyncDropUploadWidgetHandler - Done!', responseBody);

    console.log("asyncDropUploadWidgetHandler << OUT:");
    console.log("Response Data:", responseBody);

    return reply.status(200).send(responseBody);
  }
  
  const errorResponse = {
    message: 'Unsupported MIME type',
    supportedTypes: {
      documentTypes: supportedDocs,
      audioTypes: supportedAudios
    }
  };

  console.log("asyncDropUploadWidgetHandler << ERROR:");
  console.log("Error Response:", errorResponse);

  return reply.status(400).send(errorResponse);
}

function wiresWidgetHandler (request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, apiKey: auth.apikey, neonAppUrl: process.env.NEON_APP_URL };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/wires-list.hbs", params);
}

function breakingNewsWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  // Check for theme query parameter
  const theme = request.query.theme;
  const templatePath = theme === 'light' ? "/src/widgets/breakingnews-light.hbs" : "/src/widgets/breakingnews.hbs";

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view(templatePath, params);
}

function smartOctoDashboardHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/smartocto-dashboard.hbs", params);
}

function neonAnalyticsDashboardHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/neon-analytics-dashboard.hbs", params);
}

async function breakingNewsPublishHandler(request, reply) {
  console.log("breakingNewsPublishHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Body:", JSON.stringify(safeRequest.body));
  
  const { headline, summary, body } = request.body;
  
  if (!headline) {
    const errorResponse = {
      message: 'Headline is required'
    };
    console.log("breakingNewsPublishHandler << ERROR:");
    console.log("Error Response:", errorResponse);
    return reply.status(400).send(errorResponse);
  }
  
  try {
    const timestamp = Date.now();
    const id = `breakingnews_${timestamp}.xml`;
    
    const neonPopulatorOptions = {
      "site": "TheGlobe",
      "section": "/News",
      "workspace": "/Convergent/News",
      "directPublish": true,
      "siteAsChannel": false
    };
    
    const processResult = await storiesPopulator.populateNeonInstance([
      {
        "id": id,
        "itemUrl": null,
        "overhead": "Breaking News",
        "headline": headline,
        "summary": summary || "",
        "byline": "The Newsroom",
        "figureURL": null,
        "localFigurePath": null,
        "figureCaption": null,
        "figureCredit": null,
        "mainContentHtml": body ? `<p>${body}</p>` : null,
        "metadata": null,
        "type": "article/breakingnews"
      }
    ], neonPopulatorOptions);
    
    const responseBody = {
      message: 'Breaking news published successfully!',
      neon: processResult
    };
    
    console.log('breakingNewsPublishHandler - Success!', responseBody);
    console.log("breakingNewsPublishHandler << OUT:");
    console.log("Response Data:", responseBody);

    return reply.status(200).send(responseBody);
    
  } catch (error) {
    console.error('breakingNewsPublishHandler - Error:', error);
    
    const errorResponse = {
      message: `Failed to publish breaking news: ${error.message}`,
      error: error.toString()
    };
    
    console.log("breakingNewsPublishHandler << ERROR:");
    console.log("Error Response:", errorResponse);

    return reply.status(500).send(errorResponse);
  }
}

function welcomeWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "Welcome to Neon - Get Started",
      description: "Quick tour and onboarding for new Neon users"
    }
  };
  return reply.view("/src/widgets/welcome-widget.hbs", params);
}

module.exports = {
  testWidgetHandler,
  dropWidgetHandler,
  asyncDropUploadWidgetHandler,
  wiresWidgetHandler,
  breakingNewsWidgetHandler,
  breakingNewsPublishHandler,
  smartOctoDashboardHandler,
  neonAnalyticsDashboardHandler,
  welcomeWidgetHandler
};