const path = require("path");
const mammoth = require("mammoth");
const neon = require("./src/helpers/neon-bo-api.js");
const neonToMethode = require("./src/neon-to-methode.js");
const neonToSendgrid = require("./src/sendgrid/sendgrid.js");
const gdocsToNeon = require("./src/gdocs-to-neon.js");
const storiesPopulator = require("./src/stories-populator.js");
const imagesImporter = require("./src/images-importer.js");
const guardianConnector = require("./src/connectors/guardian-connector.js");
const ansaConnector = require("./src/connectors/ansa-connector.js");
const openaiPrompts = require("./src/ai/openai.js");
const trelloToNeon = require("./src/trello/import-card-to-neon.js");
const cleaner = require('./src/content-cleaner.js');

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
fastify.post("/utilities/cleanup", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { familyRefs } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!familyRefs || familyRefs.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }
  
  await cleaner.cleanupRefs(familyRefs);

  return reply.status(200).send({
    message: "Items processed successfully"
  });
});

// Widgets

const widgetHandlers = require("./src/requestHandlers/widgets.js")
fastify.get("/widgets/test", widgetHandlers.testWidgetHandler);
fastify.get("/widgets/drop", widgetHandlers.dropWidgetHandler);
fastify.post("/widgets/drop/upload", widgetHandlers.asyncDropUploadWidgetHandler);
fastify.get("/widgets/wires", widgetHandlers.wiresWidgetHandler);

// From Neon to the World
// Neon to Méthode
fastify.get("/out/methode", async function handler(request, reply) {
  return {"status":"success"};
});

fastify.post("/out/methode", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(request.body);

  if (!model && !rootData) {
    console.error("Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData;

  const processResult = await neonToMethode.processNeonStory(neonModel);

  return reply.status(200).send({
    message: "Webhook processed",
    data: processResult,
  });
});

// From the World to Neon
// External Source to Neon
fastify.post("/in/neon", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { site, workspace, items } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.populateNeonInstance(items, {
    site,
    workspace,
  });

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
});

// External Source to Neon
fastify.post("/in/neon/from/guardian", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  const pageSize = options.pageSize || null;
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;
  const section = options.section;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const targetSection = options.targetSection;
  const originalLanguage = options.originalLanguage;
  const targetTranslation = options.targetTranslation;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!section || section.length === 0) {
    return reply.status(400).send({ error: "No target section provided" });
  }

  const items = await guardianConnector.getItems({
      pageSize,
      section,
      fromDate,
      toDate,
    },
    false
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.populateNeonInstance(items, {
    site: targetSite,
    workspace: targetWorkspace,
    section: targetSection,
    language: originalLanguage,
    translate: targetTranslation
  });

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
});

fastify.post("/in/neon/from/ansa", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  const rssUrl = options.rssUrl || null;
  const maxItems = options.maxItems || null;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const targetSection = options.targetSection;
  const targetTranslation = options.targetTranslation;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!rssUrl || rssUrl.length === 0) {
    return reply.status(400).send({ error: "No rssUrl provided" });
  }

  const items = await ansaConnector.getItems({
      rssUrl,
      maxItems
    }
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = storiesPopulator.populateNeonInstance(items, {
    site: targetSite,
    workspace: targetWorkspace,
    section: targetSection,
    language: 'it',
    translate: targetTranslation
  });
  
  console.log(processResult);

  return reply.status(200).send({
    message: "Import Process Started Successfully",
  });
});

fastify.post("/in/neon/from/guardian/test", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  const pageSize = options.pageSize || null;
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;
  const section = options.section;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const originalLanguage = options.originalLanguage;
  const targetTranslation = options.targetTranslation;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!section || section.length === 0) {
    return reply.status(400).send({ error: "No target section provided" });
  }

  const items = await guardianConnector.getItems({
      pageSize,
      section,
      fromDate,
      toDate,
    },
    false
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.testStoryTranslations(items, {
    site: targetSite,
    workspace: targetWorkspace,
    language: originalLanguage,
    translate: targetTranslation
  });

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
});

/**
 *
 * Trello to Neon
 *
 */

fastify.get("/in/trello", function (request, reply) {
  let params = { seo: seo };

  return reply.view("/src/trello/trello.hbs", params);
});

fastify.get("/in/trello/send-to-neon.html", function (request, reply) {
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  return reply.view("/src/trello/send-to-neon.hbs", params);
});

fastify.get("/in/trello/authorization.html", function (request, reply) {
  let params = { seo: seo };

  return reply.view("/src/trello/authorization.hbs", params);
});

fastify.get("/in/trello/neon/login.html", function (request, reply) {
  let params = { seo: seo };

  return reply.view("/src/trello/neon-login.hbs", params);
});

fastify.post("/in/trello/neon", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  const body = JSON.parse(request.body);
  
  console.log("Request received:");
  console.log(body);
  
  return await trelloToNeon.importCard(body)
    .then(result => {
        const message = {
            message: "Processed",
            data: result,
        }
        console.log(message);
        return reply.status(200).send(message);
    });

  
});

/**
 *
 * Google Docs to Neon WIP
 *
 */
fastify.get("/in/googledocs", function (request, reply) {
  const { processedDocument } = request.body;

  if (!processedDocument) {
    return reply
      .status(400)
      .send({ error: "Missing processedDocument in request body" });
  }

  gdocsToNeon.sendToNeon(processedDocument);

  return reply.status(200).send({
    message: "Webhook processed",
    data: {
      familyRef: "neonId",
    },
  });
});

fastify.post("/in/binary", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  console.log("Request received:");
  console.log(request.body);
  
  const { urls } = request.body;

  if (!urls || urls.length == 0) {
    console.error("Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }

  const processResult = await imagesImporter.uploadImage({
    imageName: '',
    imageUrl: urls,
    workspace: ''
  });

  return reply.status(200).send({
    message: "Processed",
    data: processResult,
  });
});

fastify.post("/ai/openai", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  console.log("Request received:");
  console.log(request.body);
  

  return await openaiPrompts.test()
    .finally(result => {
        return reply.status(200).send({
            message: "Processed",
            data: result,
        });
    });

  
});

// Sendgrid
fastify.get("/out/sendgrid", async function handler(request, reply) {
  return {"status":"success"};
});

fastify.post("/out/sendgrid", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  
  const { model, rootData } = request.body;
  
  console.log("Hook received:");
  console.log(request.body);

  if (!model && !rootData) {
    console.error("Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData;
  
  // TODO - Transform NeonModel into the values accepted by Sendgrid

  return await neonToSendgrid.sendWeeklyGlobe()
    .finally(result => {
        return reply.status(200).send({
            message: "Processed",
            data: result,
        });
    });

  
});


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
