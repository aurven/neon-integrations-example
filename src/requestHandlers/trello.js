const seo = require("../seo.json");
const trelloToNeon = require("../trello/import-card-to-neon.js");

function mainPageHandler(request, reply) {
  let params = { seo: seo };

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

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  const body = JSON.parse(request.body);
  
  console.log("Request received:");
  console.log(body);
  
  return await trelloToNeon.importCard(body)
    .then(result => {
        const message = {
            message: "Processed",
            data: result,
        }
        console.log(message);
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