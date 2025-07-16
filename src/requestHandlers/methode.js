const neonToMethode = require("../neon-to-methode.js");

async function getMethodeHandler(request, reply) {
  return {"status":"success"};
}

async function postMethodeHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  console.log("postMethodeHandler << IN:");
  console.log("Request Headers:", request.headers);
  console.log("Request Body:", request.body);

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
  
  const neonModel = (model && model.data) || rootData || model;

  const processResult = await neonToMethode.processNeonStoryV2(neonModel);

  console.log("postMethodeHandler << OUT:");
  console.log("Response Data:", processResult);

  return reply.status(200).send({
    message: "Webhook processed",
    data: processResult,
  });
}

async function postMethodeImageHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  console.log("postMethodeImageHandler << IN:");
  console.log("Request Headers:", request.headers);
  console.log("Request Body:", request.body);

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(request.body);

  if (!model && !rootData) {
    console.error("postMethodeImageHandler << ERROR: Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData || model;

  const processResult = await neonToMethode.processNeonImages(neonModel);

  console.log("postMethodeImageHandler << OUT:");
  console.log("Response Data:", processResult);

  return reply.status(200).send({
    message: "Webhook processed",
    data: processResult,
  });
}

async function postMethodeTest(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  console.log("postMethodeTest << IN:");
  console.log("Request Headers:", request.headers);
  console.log("Request Body:", request.body);

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(request.body);

  if (!model && !rootData) {
    console.error("postMethodeTest << ERROR: Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData || model;

  const processResult = await neonToMethode.processNeonStoryV2(neonModel);

  console.log("postMethodeTest << OUT:");
  console.log("Response Data:", processResult);

  return reply.status(200).send({
    message: "Webhook processed",
    data: processResult,
  });
}

module.exports = {
  getMethodeHandler,
  postMethodeHandler,
  postMethodeTest,
  postMethodeImageHandler
};