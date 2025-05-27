const storiesPopulator = require("../stories-populator.js");
const imagesImporter = require("../images-importer.js");
const guardianConnector = require("../connectors/guardian-connector.js");
const rssConnector = require("../connectors/rss-connector.js");
const gdocsToNeon = require("../gdocs-to-neon.js");

// External Source to Neon
async function importHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { site, workspace, items } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.populateNeonInstance(items, {
    site,
    workspace,
  });

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
};

// External Source to Neon
async function importFromGuardianHandler(request, reply) {
  console.log('Called importFromGuardianHandler');
  
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;
  
  console.log('Options:');
  console.log(options);

  const pageSize = options.pageSize || null;
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;
  const section = options.section;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const targetSection = options.targetSection;
  const originalLanguage = options.originalLanguage;
  const targetTranslation = options.targetTranslation;
  const siteAsChannel = options.siteAsChannel === 'true' || options.siteAsChannel === true;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!section || section.length === 0) {
    return reply.status(400).send({ error: "No target section provided" });
  }

  const items = await guardianConnector.getItems({
      pageSize,
      section,
      fromDate,
      toDate,
    },
    false
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }
  
  const populatorOptions = {
    site: targetSite,
    workspace: targetWorkspace,
    section: targetSection,
    language: originalLanguage,
    translate: targetTranslation,
    siteAsChannel: siteAsChannel,
  };
  
  console.log('Populating instance with these options:');
  console.log(populatorOptions);
  

  const processResult = await storiesPopulator.populateNeonInstance(items, populatorOptions);

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
};

async function importFromRssHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  const rssUrl = options.rssUrl || null;
  const maxItems = options.maxItems || null;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const targetSection = options.targetSection;
  const targetTranslation = options.targetTranslation;
  const siteAsChannel = options.siteAsChannel;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!rssUrl || rssUrl.length === 0) {
    return reply.status(400).send({ error: "No rssUrl provided" });
  }

  const items = await rssConnector.getItems({
      rssUrl,
      maxItems
    }
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }
  
  const validItems = items.filter(item => item.headline && item.mainContent);

  const processResult = storiesPopulator.populateNeonInstance(validItems, {
    site: targetSite,
    workspace: targetWorkspace,
    section: targetSection,
    language: 'it',
    translate: targetTranslation,
    siteAsChannel
  });
  
  console.log(processResult);

  return reply.status(200).send({
    message: "Import Process Started Successfully",
    items
  });
};

function importFromGoogleDocsHandler(request, reply) {
  const { processedDocument } = request.body;

  if (!processedDocument) {
    return reply
      .status(400)
      .send({ error: "Missing processedDocument in request body" });
  }

  gdocsToNeon.sendToNeon(processedDocument);

  return reply.status(200).send({
    message: "Webhook processed",
    data: {
      familyRef: "neonId",
    },
  });
}

async function importBinaryHandler(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const { model, rootData } = request.body;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("Received call, but no API key was passed.");
    return reply.status(401).send({ error: "Unauthorized" });
  }
  
  console.log("Request received:");
  console.log(request.body);
  
  const { urls } = request.body;

  if (!urls || urls.length == 0) {
    console.error("Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }

  const processResult = await imagesImporter.uploadImage({
    imageName: '',
    imageUrl: urls,
    workspace: ''
  });

  return reply.status(200).send({
    message: "Processed",
    data: processResult,
  });
}

async function importTest(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  const pageSize = options.pageSize || null;
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;
  const section = options.section;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const originalLanguage = options.originalLanguage;
  const targetTranslation = options.targetTranslation;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!section || section.length === 0) {
    return reply.status(400).send({ error: "No target section provided" });
  }

  const items = await guardianConnector.getItems({
      pageSize,
      section,
      fromDate,
      toDate,
    },
    false
  );
  
  if (!items || items.length === 0) {
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.testStoryTranslations(items, {
    site: targetSite,
    workspace: targetWorkspace,
    language: originalLanguage,
    translate: targetTranslation
  });

  return reply.status(200).send({
    message: "Items processed successfully",
    data: processResult,
  });
};

module.exports = {
  importHandler,
  importFromGuardianHandler,
  importFromRssHandler,
  importFromGoogleDocsHandler,
  importBinaryHandler,
  importTest
};