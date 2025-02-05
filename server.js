const path = require("path");
const neonToMethode = require('./src/helpers/neon-to-methode.js');
const gdocsToNeon = require('./src/helpers/gdocs-to-neon.js');

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});

// ADD FAVORITES ARRAY VARIABLE FROM TODO HERE
const favourites = [];

// Setup our static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

/**
 * Our home page route
 *
 * Returns src/pages/index.hbs with data built into it
 */
fastify.get("/", function (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // If someone clicked the option for a random color it'll be passed in the querystring
  if (request.query.randomize) {
    // We need to load our color data file, pick one at random, and add it to the params
    const colors = require("./src/colors.json");
    const allColors = Object.keys(colors);
    let currentColor = allColors[(allColors.length * Math.random()) << 0];

    // Add the color properties to the params object
    params = {
      color: colors[currentColor],
      colorError: null,
      seo: seo,
    };
  }

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/pages/index.hbs", params);
});

/**
 * Our POST route to handle and react to form submissions
 *
 * Accepts body data indicating the user choice
 */
fastify.post("/", function (request, reply) {
  // Build the params object to pass to the template
  let params = { seo: seo };

  // If the user submitted a color through the form it'll be passed here in the request body
  let color = request.body.color;

  // If it's not empty, let's try to find the color
  if (color) {
    // ADD CODE FROM TODO HERE TO SAVE SUBMITTED FAVORITES

    // Load our color data file
    const colors = require("./src/colors.json");

    // Take our form submission, remove whitespace, and convert to lowercase
    color = color.toLowerCase().replace(/\s/g, "");

    // Now we see if that color is a key in our colors object
    if (colors[color]) {
      // Found one!
      params = {
        color: colors[color],
        colorError: null,
        seo: seo,
      };
    } else {
      // No luck! Return the user value as the error property
      params = {
        colorError: request.body.color,
        seo: seo,
      };
    }
  }

  // The Handlebars template will use the parameter values to update the page with the chosen color
  return reply.view("/src/pages/index.hbs", params);
});

// Example
fastify.get('/test', async function handler (request, reply) {
  return { hello: 'world' }
});

// From Neon to the World
// Neon to Méthode
fastify.post('/out/methode', async function handler (request, reply) {
  const { model } = request.body;
  
  if (!model) {
      return reply.status(400).json({ error: 'Missing model in request body' });
  }
  
  const processResult = await neonToMethode.processNeonStory(model);
  
  return reply.status(200).json({ 
    message: 'Webhook processed',
    data: processResult
  });
});

// From the World to Neon
// Trello to Neon
fastify.get("/in/trello", function (request, reply) {
  // Build the params object to pass to the template
  let params = { seo: seo };

  // The Handlebars template will use the parameter values to update the page with the chosen color
  return reply.view("/src/pages/trello.hbs", params);
});

fastify.get("/in/trello/send-to-neon.html", function (request, reply) {
  // Build the params object to pass to the template
  let params = { seo: seo };

  // The Handlebars template will use the parameter values to update the page with the chosen color
  return reply.view("/src/pages/trello/send-to-neon.html", params);
});

// Google Docs to Neon WIP
fastify.get("/in/googledocs", function (request, reply) {
  const { processedDocument } = request.body;
  
  if (!processedDocument) {
      return reply.status(400).json({ error: 'Missing processedDocument in request body' });
  }
  
  gdocsToNeon.sendToNeon(processedDocument);
  
  return reply.status(200).json({ 
    message: 'Webhook processed',
    data: {
      familyRef: "neonId"
    }
  });
});


// Run the server and report out to the logs
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);
