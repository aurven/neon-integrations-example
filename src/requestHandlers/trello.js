const seo = require("../seo.json");
const trelloToNeon = require("../trello/import-card-to-neon.js");
const { safeLogRequest } = require("../helpers/utils.js");

function mainPageHandler(request, reply) {
  let params = { seo: seo, iconHost: process.env.PROJECT_DOMAIN };

  return reply.view("/src/trello/trello.hbs", params);
};

function sendToNeonPageHandler(request, reply) {
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  return reply.view("/src/trello/send-to-neon.hbs", params);
};

function authorizationPageHandler(request, reply) {
  let params = { seo: seo };

  return reply.view("/src/trello/authorization.hbs", params);
};

function loginPageHandler(request, reply) {
  let params = { seo: seo };

  return reply.view("/src/trello/neon-login.hbs", params);
};

async function trelloToNeonHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };

  console.log("trelloToNeonHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("trelloToNeonHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  const body = typeof request.body !== 'object' ? JSON.parse(request.body) : request.body;
  
  console.log("Request received:");
  console.log(JSON.stringify(safeRequest.body));
  
  return await trelloToNeon.importCard(body)
    .then(result => {
        const message = {
            message: "Processed",
            data: result,
        }
        console.log("trelloToNeonHandler << OUT:");
        console.log("Response Data:", message);
        return reply.status(200).send(message);
    });
};

module.exports = {
  mainPageHandler,
  sendToNeonPageHandler,
  authorizationPageHandler,
  loginPageHandler,
  trelloToNeonHandler
}