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
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

fastify.get("/", function (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/pages/index.hbs", params);
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
    message: "Neon Integrations Up and Running"
  });
});

// Utilities
const utilitiesHandlers = require("./src/requestHandlers/utilities.js");
fastify.post("/utilities/cleanup", utilitiesHandlers.cleanupHandler);
fastify.post("/ai/openai", utilitiesHandlers.openAiHandler);

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

/**
 *
 * From the World to Neon
 *
 */
const neonImportHandlers = require("./src/requestHandlers/neon-import.js");
fastify.post("/in/neon", neonImportHandlers.importHandler);
fastify.post("/in/neon/from/guardian", neonImportHandlers.importFromGuardianHandler);
fastify.post("/in/neon/from/ansa", neonImportHandlers.importFromAnsaHandler);
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
 * Run the server and report out to the logs
 *
 */
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);
