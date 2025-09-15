const neonToMethode = require("../neon-to-methode.js");
const { safeLogRequest } = require("../helpers/utils.js");

async function getMethodeHandler(request, reply) {
  return {"status":"success"};
}

async function postMethodeHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  console.log("postMethodeHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(JSON.stringify(safeRequest.body));

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
  const safeRequest2 = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest2.headers));
  console.log("Request Body:", JSON.stringify(safeRequest2.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(JSON.stringify(safeRequest2.body));

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
  const safeRequest3 = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest3.headers));
  console.log("Request Body:", JSON.stringify(safeRequest3.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Hook received:");
  console.log(JSON.stringify(safeRequest3.body));

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