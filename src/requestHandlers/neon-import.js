const storiesPopulator = require("../stories-populator.js");
const imagesImporter = require("../images-importer.js");
const guardianConnector = require("../connectors/guardian-connector.js");
const rssConnector = require("../connectors/rss-connector.js");
const gdocsToNeon = require("../gdocs-to-neon.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

// External Source to Neon
async function importHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("importHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { site, workspace, items } = request.body;

  console.log("importHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!items || items.length === 0) {
    console.error("importHandler << ERROR: No items provided");
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.populateNeonInstance(items, {
    site,
    workspace,
  });

  const response = {
    message: "Items processed successfully",
    data: processResult,
  };

  console.log("importHandler << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
};

// External Source to Neon
async function importFromGuardianHandler(request, reply) {
  console.log('Called importFromGuardianHandler');

  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("importFromGuardianHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const options = request.body;

  console.log("importFromGuardianHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

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

  if (!section || section.length === 0) {
    console.error("importFromGuardianHandler << ERROR: No target section provided");
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
    console.error("importFromGuardianHandler << ERROR: No items provided");
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

  const response = {
    message: "Items processed successfully",
    data: processResult,
  };

  console.log("importFromGuardianHandler << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
};

async function importFromRssHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("importFromRssHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const options = request.body;

  console.log("importFromRssHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  const rssUrl = options.rssUrl || null;
  const maxItems = options.maxItems || null;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const targetSection = options.targetSection;
  const targetTranslation = options.targetTranslation;
  const siteAsChannel = options.siteAsChannel;

  if (!rssUrl || rssUrl.length === 0) {
    console.error("importFromRssHandler << ERROR: No rssUrl provided");
    return reply.status(400).send({ error: "No rssUrl provided" });
  }

  const items = await rssConnector.getItems({
      rssUrl,
      maxItems
    }
  );
  
  if (!items || items.length === 0) {
    console.error("importFromRssHandler << ERROR: No items provided");
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

  const response = {
    message: "Import Process Started Successfully",
    items
  };

  console.log("importFromRssHandler << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
};

function importFromGoogleDocsHandler(request, reply) {
  const { processedDocument } = request.body;

  console.log("importFromGoogleDocsHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!processedDocument) {
    console.error("importFromGoogleDocsHandler << ERROR: Missing processedDocument in request body");
    return reply
      .status(400)
      .send({ error: "Missing processedDocument in request body" });
  }

  gdocsToNeon.sendToNeon(processedDocument);

  const response = {
    message: "Webhook processed",
    data: {
      familyRef: "neonId",
    },
  };

  console.log("importFromGoogleDocsHandler << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
}

async function importBinaryHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("importBinaryHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { model, rootData } = request.body;

  console.log("importBinaryHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));
  
  console.log("Request received:");
  console.log(JSON.stringify(safeRequest.body));
  
  const { urls } = request.body;

  if (!urls || urls.length == 0) {
    console.error("importBinaryHandler << ERROR: Missing model in request body");
    return reply.status(400).send({ error: "Missing model in request body" });
  }

  const processResult = await imagesImporter.uploadImage({
    imageName: '',
    imageUrl: urls,
    workspace: ''
  });

  const response = {
    message: "Processed",
    data: processResult,
  };

  console.log("importBinaryHandler << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
}

async function importTest(request, reply) {
  const { apikey } = request.headers?.apikey
    ? request.headers
    : { apikey: null };
  const options = request.body;

  console.log("importTest << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  const pageSize = options.pageSize || null;
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;
  const section = options.section;
  const targetSite = options.targetSite;
  const targetWorkspace = options.targetWorkspace;
  const originalLanguage = options.originalLanguage;
  const targetTranslation = options.targetTranslation;

  if (!apikey || apikey != process.env.NEON_EXT_APIKEY) {
    console.log("importTest << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!section || section.length === 0) {
    console.error("importTest << ERROR: No target section provided");
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
    console.error("importTest << ERROR: No items provided");
    return reply.status(400).send({ error: "No items provided" });
  }

  const processResult = await storiesPopulator.testStoryTranslations(items, {
    site: targetSite,
    workspace: targetWorkspace,
    language: originalLanguage,
    translate: targetTranslation
  });

  const response = {
    message: "Items processed successfully",
    data: processResult,
  };

  console.log("importTest << OUT:");
  console.log("Response Data:", response);

  return reply.status(200).send(response);
};

module.exports = {
  importHandler,
  importFromGuardianHandler,
  importFromRssHandler,
  importFromGoogleDocsHandler,
  importBinaryHandler,
  importTest
};