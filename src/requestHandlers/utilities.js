const openaiPrompts = require("../ai/openai.js");
const pexels = require('../connectors/pexels-connector.js');
const cleaner = require('../content-cleaner.js');
const neon = require('../helpers/neon-bo-api.js');

async function cleanupHandler(request, reply) {
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
}

async function openAiHandler(request, reply) {
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
}

async function pexelsPhotosHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  console.log("Request received:");
  
  console.log(request.query.query);
  const { query } = request.query;

  return await pexels.getPhotos(query)
    .then(result => {
        return reply.status(200).send(result);
        /* return reply.status(200).send({
            message: "Processed",
            data: result,
        }); */
    });  
}

async function neonDiscoveryHandler (request, reply) {
  return await neon.discoveryServices()
    .then(data => {
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