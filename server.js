const path = require("path");
const fs = require('fs');

// Require the fastify framework and instantiate it

// HTTPS configuration
let httpsOptions = {};
const sslCertPath = path.join(__dirname, 'ssl', 'integrations.neon-examples.test+3.pem');
const sslKeyPath = path.join(__dirname, 'ssl', 'integrations.neon-examples.test+3-key.pem');

if (fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
  httpsOptions = {
    https: {
      cert: fs.readFileSync(sslCertPath),
      key: fs.readFileSync(sslKeyPath)
    }
  };
  console.log('🔒 HTTPS enabled with local SSL certificates');
} else {
  console.log('⚠️  SSL certificates not found, running in HTTP mode');
}

const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: true,
  ...httpsOptions
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

// Cookie support for session-based authentication
fastify.register(require("@fastify/cookie"), {
  secret: process.env.NEON_EXT_APIKEY,
  parseOptions: {}
});

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

// Add X-Robots-Tag: noindex header to all responses
fastify.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Robots-Tag', 'noindex');
  return payload;
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
      { name: "Neon Discovery", endpoint: "GET /utilities/services", description: "Discover Neon services" },
      { name: "Metrics Reports", endpoint: "GET /neon/api/core/metrics", description: "List available Neon BO analytics reports" },
      { name: "Metrics Data", endpoint: "GET /neon/api/core/metrics/*", description: "Get specific metrics data from Neon BO (supports path-style reportId)" }
    ],
    widgets: [
      { name: "Test Widget", endpoint: "GET /widgets/test", demoUrl: "/widgets/test", description: "Test widget interface" },
      { name: "Document Drop", endpoint: "GET /widgets/drop", demoUrl: "/widgets/drop", description: "Drop and upload documents" },
      { name: "Document Upload", endpoint: "POST /widgets/drop/upload", description: "Process uploaded documents" },
      { name: "Wires Widget", endpoint: "GET /widgets/wires", demoUrl: "/widgets/wires", description: "Wire management interface" },
      { name: "Breaking News", endpoint: "GET /widgets/breakingnews", demoUrl: "/widgets/breakingnews", description: "Breaking news publisher interface" },
      { name: "Breaking News Publish", endpoint: "POST /widgets/breakingnews/publish", description: "Publish breaking news to Neon" },
      { name: "SmartOcto Dashboard", endpoint: "GET /widgets/smartocto-dashboard", demoUrl: "/widgets/smartocto-dashboard", description: "SmartOcto analytics dashboard (demo)" },
      { name: "Neon Analytics", endpoint: "GET /widgets/neon-analytics", demoUrl: "/widgets/neon-analytics?demo=true", description: "Production metrics dashboard with interactive charts - supports demo mode (?demo=true)" },
      { name: "Welcome Widget", endpoint: "GET /widgets/welcome", demoUrl: "/widgets/welcome", description: "Onboarding widget for new users with quick tour and action cards" }
    ],
    panels: [
      { name: "Trello Panel", endpoint: "GET /panels/trello", demoUrl: "/panels/trello", description: "Trello card management panel for Neon CMS iframe embedding with PostMessage API" },
      { name: "Trello API Proxy", endpoint: "ALL /panels/trello/api/*", description: "Proxy for Trello API calls with authentication" },
      { name: "External Sources Panel", endpoint: "GET /panels/external-sources", demoUrl: "/panels/external-sources", description: "External assets panel for searching and inserting Pexels, YouTube, and DailyMotion videos into Neon CMS" },
      { name: "Pexels API Proxy", endpoint: "ALL /panels/external-sources/api/*", description: "Proxy for Pexels API calls with authentication" },
      { name: "YouTube API Proxy", endpoint: "ALL /panels/external-sources/api/youtube/*", description: "Proxy for YouTube Data API calls with authentication" },
      { name: "DailyMotion API Proxy", endpoint: "ALL /panels/external-sources/api/dailymotion/*", description: "Proxy for DailyMotion API calls with authentication" },
      { name: "Méthode Panel", endpoint: "GET /panels/methode", demoUrl: "/panels/methode", description: "Méthode object management panel with PDF preview, workflow status, and Swing integration" },
      { name: "Méthode API Proxy", endpoint: "ALL /panels/methode/api/*", description: "Proxy for Méthode Editorial API calls with authentication and object retrieval" },
      { name: "QuickChart Panel", endpoint: "GET /panels/quickchart", demoUrl: "/panels/quickchart", description: "QuickChart.io gallery panel for browsing and importing chart examples as PNG assets into Neon CMS" },
      { name: "Social Media Panel", endpoint: "GET /panels/social-media", demoUrl: "/panels/social-media", description: "Social media publishing panel with AI-powered content generation for Facebook, X, Instagram, Threads, and Bluesky" },
      { name: "Social Media API Proxy", endpoint: "ALL /panels/social-media/api/*", description: "Proxy for social media API calls (AI generation, Bluesky metrics) with authentication" }
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
    ],
    taxonomies: [
      { name: "List Taxonomies", endpoint: "GET /iab/taxonomies", description: "List all IAB taxonomies with versions and stats" },
      { name: "Get Taxonomy", endpoint: "GET /iab/:type", description: "Get full taxonomy data (content, audience, adproduct)" },
      { name: "Lookup Labels", endpoint: "POST /iab/lookup", description: "Lookup labels for taxonomy IDs (batch supported)" },
      { name: "Search Taxonomy", endpoint: "GET /iab/search", description: "Search categories by name or path" },
      { name: "Validate IDs", endpoint: "POST /iab/validate", description: "Validate if taxonomy IDs exist" },
      { name: "Get Children", endpoint: "GET /iab/:type/children", description: "Get child categories for a parent ID" },
      { name: "Get Statistics", endpoint: "GET /iab/:type/stats", description: "Get taxonomy statistics" },
      { name: "Refresh Cache", endpoint: "POST /iab/refresh", description: "Force refresh taxonomies from GitHub" }
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

// Neon Metrics API
const neonMetricsHandlers = require("./src/requestHandlers/neon-metrics.js");
fastify.get("/neon/api/core/metrics", neonMetricsHandlers.getMetricsReportsHandler);
fastify.get("/neon/api/core/metrics/*", neonMetricsHandlers.getMetricsDataHandler);

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
fastify.get("/widgets/breakingnews", widgetHandlers.breakingNewsWidgetHandler);
fastify.post("/widgets/breakingnews/publish", widgetHandlers.breakingNewsPublishHandler);
fastify.get("/widgets/smartocto-dashboard", widgetHandlers.smartOctoDashboardHandler);
fastify.get("/widgets/neon-analytics", widgetHandlers.neonAnalyticsDashboardHandler);
fastify.get("/widgets/welcome", widgetHandlers.welcomeWidgetHandler);

/**
 *
 * Panels
 *
 */
const panelHandlers = require("./src/requestHandlers/panels.js");
fastify.get("/panels/trello", panelHandlers.trelloPanelHandler);
fastify.get("/panels/external-sources", panelHandlers.externalSourcesPanelHandler);
fastify.get("/panels/methode", panelHandlers.methodePanelHandler);
fastify.get("/panels/quickchart", panelHandlers.quickchartPanelHandler);
fastify.get("/panels/article-pdf", panelHandlers.articlePdfPanelHandler);
fastify.get("/panels/article-pdf/generate", panelHandlers.generateArticlePdfHandler);
fastify.get("/panels/ga4-analytics", panelHandlers.ga4AnalyticsPanelHandler);
fastify.get("/panels/smartocto", panelHandlers.smartOctoPanelHandler);
fastify.post("/panels/upload-asset", panelHandlers.uploadAssetHandler);
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/trello/api/*',
    handler: panelHandlers.trelloApiProxyHandler
  });
});
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/external-sources/api/pexels/*',
    handler: panelHandlers.pexelsApiProxyHandler
  });
});
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/external-sources/api/youtube/*',
    handler: panelHandlers.youtubeApiProxyHandler
  });
});
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/external-sources/api/dailymotion/*',
    handler: panelHandlers.dailymotionApiProxyHandler
  });
});
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/methode/api/*',
    handler: panelHandlers.methodeApiProxyHandler
  });
});
fastify.get("/panels/social-media", panelHandlers.socialMediaPanelHandler);
fastify.register(async function (fastify) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/panels/social-media/api/*',
    handler: panelHandlers.socialMediaApiProxyHandler
  });
});

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
 * IAB Taxonomies API
 *
 */
const iabTaxonomiesHandlers = require("./src/requestHandlers/iab-taxonomies.js");
fastify.register(async function (fastify) {
  await iabTaxonomiesHandlers.registerRoutes(fastify, {
    apikey: process.env.NEON_EXT_APIKEY
  });
});

// Initialize IAB taxonomies cache on startup (non-blocking)
const { initializeAll } = require("./src/connectors/iab-taxonomies-connector");
setImmediate(async () => {
  try {
    console.log('[IAB Taxonomies] Initializing cache...');
    const results = await initializeAll();

    if (results.initialized.length > 0) {
      console.log(`[IAB Taxonomies] ✓ Downloaded and cached: ${results.initialized.join(', ')}`);
    }
    if (results.cached.length > 0) {
      console.log(`[IAB Taxonomies] ✓ Already cached: ${results.cached.join(', ')}`);
    }
    if (results.errors.length > 0) {
      console.error(`[IAB Taxonomies] ✗ Errors: ${results.errors.length}`);
      results.errors.forEach(err => {
        console.error(`  - ${err.type}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('[IAB Taxonomies] Failed to initialize:', error.message);
  }
});

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
    const protocol = httpsOptions.https ? 'https' : 'http';
    const defaultPort = httpsOptions.https ? 443 : 80;
    const portDisplay = port == defaultPort ? '' : `:${port}`;
    
    if (host === "0.0.0.0") {
      console.log(`📱 Local access: ${protocol}://localhost${portDisplay}`);
      console.log(`🌐 Network access: ${projectDomain}`);
      console.log(`📋 Services dashboard: ${projectDomain}/services`);
      console.log(`📲 Mobile client: ${projectDomain}/mobileclient`);
      
      if (httpsOptions.https) {
        console.log(`🔒 Custom domain: ${protocol}://integrations.neon-examples.test${portDisplay}`);
      }
    } else {
      console.log(`🏠 Available at: ${protocol}://${host}${portDisplay}`);
    }
  }
);
