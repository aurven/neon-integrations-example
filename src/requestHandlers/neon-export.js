const neonToSendgrid = require("../sendgrid/sendgrid.js");
const mailjetService = require("../mailjet/mailjet.js");

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

async function getMailjetHandler(request, reply) {
  return {"status":"success"};
}

async function postMailjetHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  // if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Mailjet request received:");
  console.log(request.body);

  if (!request.body) {
    console.error("Missing request body");
    return reply.status(400).send({ error: "Missing request body" });
  }

  try {
    let result;
    
    // Check if this is a Neon model (newsletter) or direct Mailjet Messages format
    if (request.body.model || request.body.nodes || request.body.contentData) {
      // This is a Neon model - convert to newsletter
      result = await mailjetService.sendNewsletter(request.body);
    } else if (request.body.Messages) {
      // This is direct Mailjet format
      result = await mailjetService.sendSingleEmail(request.body);
    } else {
      console.error("Invalid request format - expected either 'model' (Neon) or 'Messages' (Mailjet)");
      return reply.status(400).send({ 
        error: "Invalid request format - expected either 'model' for newsletter or 'Messages' for direct email" 
      });
    }
    
    return reply.status(200).send({
      message: "Email sent successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return reply.status(500).send({
      error: "Failed to send email",
      details: error.message,
    });
  }
}

module.exports = {
  getSendgridHandler,
  postSendgridHandler,
  getMailjetHandler,
  postMailjetHandler
};