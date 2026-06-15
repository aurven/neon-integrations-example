const neonToSendgrid = require("../sendgrid/sendgrid.js");
const mailjetService = require("../mailjet/mailjet.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

async function getSendgridHandler(request, reply) {
  return {"status":"success"};
}

async function postSendgridHandler(request, reply) {
  console.log("postSendgridHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  const { model, rootData } = request.body;
  
  console.log("Hook received:");
  console.log(JSON.stringify(request.body));

  if (!model && !rootData) {
    console.error("postSendgridHandler << ERROR: Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }
  
  const neonModel = (model && model.data) || rootData;
  
  // TODO - Transform NeonModel into the values accepted by Sendgrid

  return await neonToSendgrid.sendWeeklyGlobe()
    .finally(result => {
        const response = {
            message: "Processed",
            data: result,
        };
        console.log("postSendgridHandler << OUT:");
        console.log("Response Data:", response);
        return reply.status(200).send(response);
    });
}

async function getMailjetHandler(request, reply) {
  return {"status":"success"};
}

async function postMailjetHandler(request, reply) {
  console.log("postMailjetHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Mailjet request received:");
  console.log(JSON.stringify(safeRequest.body));

  if (!request.body) {
    console.error("postMailjetHandler << ERROR: Missing request body");
    return reply.status(400).send({ error: "Missing request body" });
  }

  try {
    // Check if this is a Neon model (newsletter) or direct Mailjet Messages format
    if (request.body.model || request.body.nodes || request.body.contentData) {
      // This is a Neon newsletter model - convert to newsletter
      const mode = request.query.mode === 'webpage' ? 'webpage' : 'generated';
      const result = await mailjetService.sendNewsletter(request.body, { mode });

      const storyId = request.body.contentData?.data?.id || request.body.model?.data?.id || request.body.model?.id;
      const timestamp = new Date().toISOString();

      const returnMessage = {
        action: "writeback",
        payload: { storyId, lastSend: timestamp },
      };

      console.log("postMailjetHandler << OUT:");
      console.log("Response Data:", returnMessage, "Mailjet Result:", result);

      return reply.status(200).send(returnMessage);
    } else if (request.body.Messages) {
      // This is direct Mailjet format
      const result = await mailjetService.sendSingleEmail(request.body);

      const response = {
        message: "Email sent successfully",
        data: result,
      };

      console.log("postMailjetHandler << OUT:");
      console.log("Response Data:", response);

      return reply.status(200).send(response);
    } else {
      console.error("postMailjetHandler << ERROR: Invalid request format - expected either 'model' (Neon) or 'Messages' (Mailjet)");
      return reply.status(400).send({
        error: "Invalid request format - expected either 'model' for newsletter or 'Messages' for direct email"
      });
    }
  } catch (error) {
    console.error("postMailjetHandler << ERROR: Error sending email:", error);
    const errorResponse = {
      error: "Failed to send email",
      details: error.message,
    };
    console.log("postMailjetHandler << ERROR:");
    console.log("Error Response:", errorResponse);
    return reply.status(500).send(errorResponse);
  }
}

module.exports = {
  getSendgridHandler,
  postSendgridHandler,
  getMailjetHandler,
  postMailjetHandler
};