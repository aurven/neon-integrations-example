const neonToMethode = require("../neon-to-methode.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

async function getMethodeHandler(request, reply) {
  return {"status":"success"};
}

async function postMethodeHandler(request, reply) {
  const { model, rootData } = request.body;

  console.log("postMethodeHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  // console.log("Hook received:");
  // console.log(JSON.stringify(safeRequest.body));

  if (!model && !rootData) {
    console.error("Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData || model;

  const processResult = await neonToMethode.processNeonStoryV2(neonModel);
  
  console.log("Response Data:", processResult);
  
  const timestamp = new Date().toISOString(); 

  const payload = processResult?.target ? { ...processResult?.target, lastSend: timestamp } : {};

  const returnMessage = {
    action: "writeback",
    payload,
    //processResult,
  }

  console.log("Returned Message Data:", returnMessage);
  
  console.log("postMethodeHandler << OUT:");
  return reply.status(200).send(returnMessage);
}

async function postMethodeImageHandler(request, reply) {
  const { model, rootData } = request.body;

  console.log("postMethodeImageHandler << IN:");
  const safeRequest2 = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest2.headers));
  console.log("Request Body:", JSON.stringify(safeRequest2.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  // console.log("Hook received:");
  // console.log(JSON.stringify(safeRequest2.body));

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
  const { model, rootData } = request.body;

  console.log("postMethodeTest << IN:");
  const safeRequest3 = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest3.headers));
  console.log("Request Body:", JSON.stringify(safeRequest3.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  // console.log("Hook received:");
  // console.log(JSON.stringify(safeRequest3.body));

  if (!model && !rootData) {
    console.error("postMethodeTest << ERROR: Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData || model;

  const processResult = await neonToMethode.processNeonStoryV2(neonModel);

  console.log("Response Data:", processResult);
  
  const payload = processResult?.target ? { ...processResult?.target } : {};
    
  console.log("postMethodeTest << OUT:");
  return reply.status(200).send({
    action: "writeback",
    payload,
    processResult,
  });
}

module.exports = {
  getMethodeHandler,
  postMethodeHandler,
  postMethodeTest,
  postMethodeImageHandler
};