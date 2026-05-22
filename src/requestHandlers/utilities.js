const openaiPrompts = require("../ai/openai.js");
const pexels = require('../connectors/pexels-connector.js');
const cleaner = require('../content-cleaner.js');
const neon = require('../helpers/neon-bo-api-v3.js');
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

async function cleanupHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("cleanupHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { familyRefs } = request.body;

  console.log("cleanupHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!familyRefs || familyRefs.length === 0) {
    console.error("cleanupHandler << ERROR: No items provided");
    return reply.status(400).send({ error: "No items provided" });
  }
  
  await cleaner.cleanupRefs(familyRefs);

  const result = { message: "Items processed successfully" };
  console.log("cleanupHandler << OUT:");
  console.log("Response Data:", result);

  return reply.status(200).send(result);
}

async function openAiHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("openAiHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  console.log("openAiHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));
  
  console.log("Request received:");
  console.log(JSON.stringify(safeRequest.body));
  

  return await openaiPrompts.test()
    .finally(result => {
        const response = {
            message: "Processed",
            data: result,
        };
        console.log("openAiHandler << OUT:");
        console.log("Response Data:", response);
        return reply.status(200).send(response);
    });  
}

async function pexelsPhotosHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("pexelsPhotosHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  console.log("pexelsPhotosHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Query:", request.query);
  
  console.log("Request received:");
  
  console.log(request.query.query);
  const { query } = request.query;

  return await pexels.getPhotos(query)
    .then(result => {
        console.log("pexelsPhotosHandler << OUT:");
        console.log("Response Data:", result);
        return reply.status(200).send(result);
        /* return reply.status(200).send({
            message: "Processed",
            data: result,
        }); */
    });  
}

async function neonDiscoveryHandler (request, reply) {
  console.log("neonDiscoveryHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Query:", request.query);

  return await neon.discoveryServices()
    .then(data => {
        console.log("neonDiscoveryHandler << OUT:");
        console.log('Passing data: ', data);
        return reply.view("/src/pages/discovery.hbs", { data });
    });
}


module.exports = {
  cleanupHandler,
  openAiHandler,
  pexelsPhotosHandler,
  neonDiscoveryHandler
};