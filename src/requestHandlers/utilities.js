const openaiPrompts = require("../ai/openai.js");
const cleaner = require('../content-cleaner.js');

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


module.exports = {
  cleanupHandler,
  openAiHandler
};