const path = require("path");
const neonToMethode = require("./src/neon-to-methode.js");
const gdocsToNeon = require("./src/gdocs-to-neon.js");
const storiesPopulator = require("./src/stories-populator.js");
const guardianConnector = require("./src/connectors/guardian-connector.js");

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
  return { hello: "world" };
});

// From Neon to the World
// Neon to Méthode
fastify.post("/out/methode", async function handler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!model) {
    return reply.status(400).send({ error: "Missing model in request body" });
  }

  const processResult = await neonToMethode.processNeonStory(model);

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
  let params = { seo: seo };

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
