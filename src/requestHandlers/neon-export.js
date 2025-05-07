const neonToSendgrid = require("../sendgrid/sendgrid.js");

async function getSendgridHandler(request, reply) {
  return {"status":"success"};
}

async function postSendgridHandler(request, reply) {
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
}

module.exports = {
  getSendgridHandler,
  postSendgridHandler
};