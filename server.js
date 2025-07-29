const path = require("path");

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});

// Setup our static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// Multipart lets us parse incoming uploads
fastify.register(require('@fastify/multipart'));

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
const handlebars = require("handlebars");

// Register Handlebars helpers
handlebars.registerHelper('formatDate', function(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: handlebars,
  },
});



// Load application version from package.json
const packageJson = require("./package.json");
const appVersion = packageJson.version;

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "default") {
  seo.url = process.env.PROJECT_DOMAIN;
  seo.image = process.env.PROJECT_DOMAIN + seo.image;
}

fastify.get("/", function (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/pages/index.hbs", params);
});

// Services dashboard
fastify.get("/services", function (request, reply) {
  const integrations = {
    inbound: [
      { name: "Generic Import", endpoint: "POST /in/neon", description: "Import items from external sources to Neon CMS" },
      { name: "Guardian API", endpoint: "POST /in/neon/from/guardian", description: "Import articles from The Guardian API" },
      { name: "RSS Feeds", endpoint: "POST /in/neon/from/rss", description: "Import articles from RSS feeds (ANSA, TGcom24)" },
      { name: "Google Docs", endpoint: "GET /in/googledocs", description: "Import content from Google Docs" },
      { name: "Binary Upload", endpoint: "POST /in/binary", description: "Upload binary files to Neon" },
      { name: "Trello Integration", endpoint: "GET /in/trello", description: "Import Trello cards to Neon with web interface" }
    ],
    outbound: [
      { name: "Méthode CMS", endpoint: "POST /out/methode", description: "Export Neon content to Méthode CMS" },
      { name: "Méthode Images", endpoint: "POST /out/imagesToMethode", description: "Export images to Méthode CMS" },
      { name: "Sendgrid", endpoint: "POST /out/sendgrid", description: "Export content to Sendgrid email marketing" },
      { name: "Mailjet", endpoint: "POST /out/mailjet", description: "Export content to Mailjet email service" }
    ],
    utilities: [
      { name: "Content Cleanup", endpoint: "POST /utilities/cleanup", description: "Clean up content references" },
      { name: "OpenAI Processing", endpoint: "POST /ai/openai", description: "Process content with OpenAI" },
      { name: "Pexels Photos", endpoint: "GET /sources/pexels", description: "Source photos from Pexels API" },
      { name: "Neon Discovery", endpoint: "GET /utilities/services", description: "Discover Neon services" }
    ],
    widgets: [
      { name: "Test Widget", endpoint: "GET /widgets/test", description: "Test widget interface" },
      { name: "Document Drop", endpoint: "GET /widgets/drop", description: "Drop and upload documents" },
      { name: "Document Upload", endpoint: "POST /widgets/drop/upload", description: "Process uploaded documents" },
      { name: "Wires Widget", endpoint: "GET /widgets/wires", description: "Wire management interface" }
    ],
    webhooks: [
      { name: "Neon Webhook Handler", endpoint: "POST /in/neon/webhook", description: "Process incoming Neon CMS webhooks with multi-site routing" },
      { name: "Neon Webhook Test", endpoint: "POST /in/neon/webhook/test", description: "Test webhook handler with sample data" },
      { name: "Telegram Integration", endpoint: "N/A", description: "Automatic posting to Telegram channels for TheGlobe articles" }
    ],
    poc: [
      { name: "Mobile Client Dashboard", endpoint: "GET /mobileclient", description: "Mobile-optimized article management interface with cards view" },
      { name: "Mobile Rich Text Editor", endpoint: "GET /mobileclient/editor", description: "Quill.js-based editor for creating/editing articles with XML generation" },
      { name: "Save Article", endpoint: "POST /mobileclient/save", description: "Save article content and generate XML for Neon CMS integration" },
      { name: "Articles API - List", endpoint: "GET /mobileclient/api/articles", description: "RESTful API to retrieve list of articles with metadata" },
      { name: "Articles API - Single", endpoint: "GET /mobileclient/api/articles/:id", description: "RESTful API to retrieve specific article by UUID for editing" }
    ]
  };

  let params = { 
    seo: seo, 
    integrations: integrations,
    location: process.env.NEON_EXT_LOCATION || "Unknown",
    version: appVersion
  };

  return reply.view("/src/pages/services-dashboard.hbs", params);
});

// Example
fastify.get("/test", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return reply.status(200).send({
    message: "Neon Integrations Up and Running",
    version: appVersion,
    location: process.env.NEON_EXT_LOCATION || "Unknown",
  });
});

// Utilities
const utilitiesHandlers = require("./src/requestHandlers/utilities.js");
fastify.post("/utilities/cleanup", utilitiesHandlers.cleanupHandler);
fastify.post("/ai/openai", utilitiesHandlers.openAiHandler);
fastify.get("/sources/pexels", utilitiesHandlers.pexelsPhotosHandler);
fastify.get("/utilities/services", utilitiesHandlers.neonDiscoveryHandler);

/**
 *
 * Widgets
 *
 */
const widgetHandlers = require("./src/requestHandlers/widgets.js");
fastify.get("/widgets/test", widgetHandlers.testWidgetHandler);
fastify.get("/widgets/drop", widgetHandlers.dropWidgetHandler);
fastify.post("/widgets/drop/upload", widgetHandlers.asyncDropUploadWidgetHandler);
fastify.get("/widgets/wires", widgetHandlers.wiresWidgetHandler);

/**
 *
 * From the Neon to the World
 *
 */

// Méthode
const methodeHandlers = require("./src/requestHandlers/methode.js");
fastify.get("/out/methode", methodeHandlers.getMethodeHandler);
fastify.post("/out/methode", methodeHandlers.postMethodeHandler);
fastify.post("/out/imagesToMethode", methodeHandlers.postMethodeImageHandler);
fastify.post("/out/methode/test", methodeHandlers.postMethodeTest);

// Sendgrid
const neonExportHandlers = require("./src/requestHandlers/neon-export.js");
fastify.get("/out/sendgrid", neonExportHandlers.getSendgridHandler);
fastify.post("/out/sendgrid", neonExportHandlers.postSendgridHandler);

// Mailjet
fastify.get("/out/mailjet", neonExportHandlers.getMailjetHandler);
fastify.post("/out/mailjet", neonExportHandlers.postMailjetHandler);

// Neon Webhooks
const neonWebhookHandlers = require("./src/requestHandlers/neon-webhooks.js");
fastify.get("/in/neon/webhook", neonWebhookHandlers.getNeonWebhookHandler);
fastify.post("/in/neon/webhook", neonWebhookHandlers.postNeonWebhookHandler);
fastify.post("/in/neon/webhook/test", neonWebhookHandlers.postNeonWebhookTest);

/**
 *
 * From the World to Neon
 *
 */
const neonImportHandlers = require("./src/requestHandlers/neon-import.js");
fastify.post("/in/neon", neonImportHandlers.importHandler);
fastify.post("/in/neon/from/guardian", neonImportHandlers.importFromGuardianHandler);
fastify.post("/in/neon/from/rss", neonImportHandlers.importFromRssHandler);
fastify.post("/in/neon/from/guardian/test", neonImportHandlers.importTest);
fastify.get("/in/googledocs", neonImportHandlers.importFromGoogleDocsHandler);
fastify.post("/in/binary", neonImportHandlers.importBinaryHandler);

/**
 *
 * Trello to Neon
 *
 */

const trelloHandlers = require("./src/requestHandlers/trello.js");
fastify.get("/in/trello", trelloHandlers.mainPageHandler);
fastify.get("/in/trello/send-to-neon.html", trelloHandlers.sendToNeonPageHandler);
fastify.get("/in/trello/authorization.html", trelloHandlers.authorizationPageHandler);
fastify.get("/in/trello/neon/login.html", trelloHandlers.loginPageHandler);
fastify.post("/in/trello/neon", trelloHandlers.trelloToNeonHandler);

/**
 *
 * Mobile Client POC
 *
 */
const mobileClientHandlers = require("./src/requestHandlers/mobile-client.js");
fastify.get("/mobileclient", mobileClientHandlers.getMobileClientHandler);
fastify.get("/mobileclient/editor", mobileClientHandlers.getMobileClientEditorHandler);
fastify.post("/mobileclient/save", mobileClientHandlers.postMobileClientSaveHandler);
fastify.get("/mobileclient/api/articles", mobileClientHandlers.getMobileClientApiArticlesHandler);
fastify.get("/mobileclient/api/articles/:id", mobileClientHandlers.getMobileClientApiArticleHandler);

/**
 *
 * Run the server and report out to the logs
 *
 */
// Configure server host and port
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const projectDomain = process.env.PROJECT_DOMAIN || "http://localhost:" + port;

fastify.listen(
  { port: port, host: host },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    console.log(`🚀 Server is running on ${address}`);

    // Show additional access information
    if (host === "0.0.0.0") {
      console.log(`📱 Local access: http://localhost:${port}`);
      console.log(`🌐 Network access: ${projectDomain}`);
      console.log(`📋 Services dashboard: ${projectDomain}/services`);
      console.log(`📲 Mobile client: ${projectDomain}/mobileclient`);
    } else {
      console.log(`🏠 Available at: http://${host}:${port}`);
    }
  }
);
