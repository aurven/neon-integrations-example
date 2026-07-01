const mammoth = require("mammoth");
const seo = require("../seo.json");
const openai = require("../ai/openai.js");
const storiesPopulator = require("../stories-populator.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");
const neonBoApi = require("../helpers/neon-bo-api-v3.js");
const neonConfigConnector = require("../connectors/neon-config-connector.js");

// Normalize "yyyymmdd" or "yyyy-mm-dd" into "yyyy-mm-dd" (used by issueDate field).
function normalizeDateToIso(value) {
  const digits = String(value).replace(/-/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// Derive printPriority (1-5) and issueDate (yyyy-mm-dd) from a search-result node,
// preferring nodeMeta.printPriority/printIssueDate and falling back to
// publishInfos priority / metadataGroups productInfo.issueDate.
function derivePrintFields(node) {
  const printPriorityMeta = node.nodeMeta?.printPriority;
  let printPriority;
  if (printPriorityMeta != null && printPriorityMeta !== '') {
    printPriority = Math.min(5, Math.max(1, parseInt(printPriorityMeta, 10)));
  } else {
    const rawPriority = Object.values(node.publishInfos || {})[0]?.priority;
    printPriority = rawPriority ? Math.min(3, Math.max(1, Math.ceil(rawPriority / 3))) : null;
  }

  const printIssueDateMeta = node.nodeMeta?.printIssueDate;
  let issueDate;
  if (printIssueDateMeta) {
    issueDate = normalizeDateToIso(printIssueDateMeta);
  } else {
    const rawIssueDate = node.metadataGroups?.eom?.sys_attributes_json?.productInfo?.issueDate;
    issueDate = rawIssueDate ? normalizeDateToIso(rawIssueDate) : null;
  }

  return { printPriority, issueDate };
}

// Load a create-widget config JSON by name (sanitized), falling back to 'default'.
function loadCreateConfig(name) {
  const fs = require('fs');
  const path = require('path');
  const safe = /^[a-zA-Z0-9_-]+$/.test(name || '') ? name : 'default';
  const tryFile = (n) => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../../conf/widgets/neon-create', `${n}.json`), 'utf8')); }
    catch { return null; }
  };
  return tryFile(safe) || tryFile('default') || { buttons: [] };
}

// Load a grid config JSON by name (sanitized), falling back to 'default'.
function loadGridConfig(name) {
  const fs = require('fs');
  const path = require('path');
  const safe = /^[a-zA-Z0-9_-]+$/.test(name || '') ? name : 'default';
  const tryFile = (n) => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../../conf/widgets/neon-grid', `${n}.json`), 'utf8')); }
    catch { return null; }
  };
  return tryFile(safe) || tryFile('default') || { fields: [], columns: [] };
}

// Load a query config JSON (queryStatement + variables + options) by name (sanitized),
// for the given widget dir (e.g. 'neon-grid', 'print-query-board'), falling back to 'default'.
function loadQueryConfig(widgetDir, name) {
  const fs = require('fs');
  const path = require('path');
  const safe = /^[a-zA-Z0-9_-]+$/.test(name || '') ? name : 'default';
  const tryFile = (n) => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../../conf/widgets', widgetDir, 'queries', `${n}.json`), 'utf8')); }
    catch { return null; }
  };
  return tryFile(safe) || tryFile('default') || { queryStatement: { bool: { and: [], or: [] } }, variables: {}, options: {} };
}

// Resolve a dotted path (e.g. "nodeMeta.printSection") against an object.
function getByPath(obj, pathStr) {
  return pathStr.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Demo-mode reveal simulation: tracks how much of a static fixture has been
// "revealed" so far per cache key, so repeated polling requests against the
// same demo data show a growing slice instead of the exact same payload every
// time. Module-scope in-memory state, same convention as `typeLabels` in
// src/connectors/neon-config-connector.js (no session/db involved).
const demoRevealState = new Map(); // key -> { revealCount }

function getDemoRevealSlice(key, totalLength, { initialSize = 20, stepSize = 3 } = {}) {
  const initial = Math.min(initialSize, totalLength);
  const state = demoRevealState.get(key);
  if (!state) {
    demoRevealState.set(key, { revealCount: initial });
    return initial;
  }
  state.revealCount += stepSize;
  if (state.revealCount > totalLength) {
    state.revealCount = initial;
  }
  return state.revealCount;
}

function testWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/test.hbs", params);
}

function dropWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  // Check for theme query parameter
  const theme = request.query.theme;
  const templatePath = theme === 'light' ? "/src/widgets/drop-a-doc-light.hbs" : "/src/widgets/drop-a-doc.hbs";

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view(templatePath, params);
}

async function asyncDropUploadWidgetHandler(request, reply) {
  const supportedDocs = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const supportedAudios = [
    'audio/mpeg',
    'audio/ogg'
  ];

  console.log("asyncDropUploadWidgetHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  const data = await request.file({
    limits: {
      fileSize: 10 * 1024 * 1024,  // 10mb limit
    }
  });

  //await data.toBuffer();
  console.log('asyncDropUploadWidgetHandler - File received!');

  const isDocument = data && data.mimetype && supportedDocs.includes(data.mimetype);
  const isAudio = data && data.mimetype && supportedAudios.includes(data.mimetype);

  async function stream2buffer(stream) {

    return new Promise((resolve, reject) => {

      const _buf = [];

      stream.on("data", (chunk) => _buf.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(_buf)));
      stream.on("error", (err) => reject(err));

    });
  }

  const dataBuffer = await stream2buffer(data.file);
  const fileName = data.filename;

  if (isDocument) {
    const parsedDoc = await mammoth.convertToHtml({ buffer: dataBuffer })
      .then(function (result) {
        const html = result.value; // The generated HTML
        const messages = result.messages; // Any messages, such as warnings during conversion
        return result;
      })
      .catch(function (error) {
        console.error(error);
      });

    const resultMessage = fileName + ' successfully imported!';
    console.log(resultMessage);
    console.log(parsedDoc);

    const docResponse = {
      message: resultMessage,
      document: parsedDoc
    };

    console.log("asyncDropUploadWidgetHandler << OUT:");
    console.log("Response Data:", docResponse);

    return reply.status(200).send(docResponse);
  }

  if (isAudio) {
    const transcription = await openai.transcribeAudio(dataBuffer, fileName);

    const { structure, metadata } = await openai.generateInterviewStructure(transcription);

    const neonPopulatorOptions = {
      "site": "TheGlobe",
      "workspace": "/Convergent/Sport",
      "directPublish": false,
      "siteAsChannel": false,
    };

    const processResult = await storiesPopulator.populateNeonInstance([
      {
        "id": fileName,
        "itemUrl": null,
        "overhead": "Interview",
        "headline": structure.headline,
        "summary": structure.summary,
        "byline": "Eidosmedia AI Suite",
        "figureURL": null,
        "localFigurePath": null,
        "figureCaption": null,
        "figureCredit": null,
        "mainContentHtml": structure.html,
        "metadata": metadata
      }
    ], neonPopulatorOptions);

    const resultMessage = fileName + ' successfully imported!';

    const responseBody = {
      message: resultMessage,
      transcription: transcription,
      structure: structure,
      neon: processResult
    };

    console.log('asyncDropUploadWidgetHandler - Done!', responseBody);

    console.log("asyncDropUploadWidgetHandler << OUT:");
    console.log("Response Data:", responseBody);

    return reply.status(200).send(responseBody);
  }

  const errorResponse = {
    message: 'Unsupported MIME type',
    supportedTypes: {
      documentTypes: supportedDocs,
      audioTypes: supportedAudios
    }
  };

  console.log("asyncDropUploadWidgetHandler << ERROR:");
  console.log("Error Response:", errorResponse);

  return reply.status(400).send(errorResponse);
}

function wiresWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, apiKey: auth.apikey, neonAppUrl: process.env.NEON_APP_URL };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/wires-list.hbs", params);
}

function breakingNewsWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  return reply.view("/src/widgets/breakingnews-light.hbs", params);
}

function smartOctoDashboardHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/smartocto-dashboard.hbs", params);
}

function neonAnalyticsDashboardHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/neon-analytics-dashboard.hbs", params);
}

async function breakingNewsPublishHandler(request, reply) {
  console.log("breakingNewsPublishHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  const { headline, summary, body } = request.body;

  if (!headline) {
    const errorResponse = {
      message: 'Headline is required'
    };
    console.log("breakingNewsPublishHandler << ERROR:");
    console.log("Error Response:", errorResponse);
    return reply.status(400).send(errorResponse);
  }

  try {
    const timestamp = Date.now();
    const id = `breakingnews_${timestamp}.xml`;

    const neonPopulatorOptions = {
      "site": "TheGlobe",
      "section": "/News",
      "workspace": "/Convergent/News",
      "directPublish": true,
      "siteAsChannel": false
    };

    const processResult = await storiesPopulator.populateNeonInstance([
      {
        "id": id,
        "itemUrl": null,
        "overhead": "Breaking News",
        "headline": headline,
        "summary": summary || "",
        "byline": "The Newsroom",
        "figureURL": null,
        "localFigurePath": null,
        "figureCaption": null,
        "figureCredit": null,
        "mainContentHtml": body ? `<p>${body}</p>` : null,
        "metadata": null,
        "type": "article/breakingnews"
      }
    ], neonPopulatorOptions);

    const responseBody = {
      message: 'Breaking news published successfully!',
      neon: processResult
    };

    console.log('breakingNewsPublishHandler - Success!', responseBody);
    console.log("breakingNewsPublishHandler << OUT:");
    console.log("Response Data:", responseBody);

    return reply.status(200).send(responseBody);

  } catch (error) {
    console.error('breakingNewsPublishHandler - Error:', error);

    const errorResponse = {
      message: `Failed to publish breaking news: ${error.message}`,
      error: error.toString()
    };

    console.log("breakingNewsPublishHandler << ERROR:");
    console.log("Error Response:", errorResponse);

    return reply.status(500).send(errorResponse);
  }
}

function welcomeWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "Welcome to Neon - Get Started",
      description: "Quick tour and onboarding for new Neon users"
    }
  };
  return reply.view("/src/widgets/welcome-widget.hbs", params);
}

function nssDemoWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "NSS Demo — Neon Syndication Service",
      description: "Walkable demo of the Neon Syndication Service (Adnkronos) — Prodotti, Pacchetti, Clienti with fake data"
    },
    neonAppUrl: process.env.NEON_APP_URL,
    apiKey: auth.apikey,
    demo: true
  };
  return reply.view("/src/widgets/nss-demo.hbs", params);
}

function planningBoardWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let params = {
    seo: {
      title: "Planning Board",
      description: "Editorial task planning board for newsroom workflow management"
    },
    neonAppUrl: process.env.NEON_APP_URL
  };
  return reply.view("/src/widgets/planning-board.hbs", params);
}

async function neonGridWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const configName = /^[a-zA-Z0-9_-]+$/.test(request.query.config || '') ? request.query.config : 'default';
  const gridConfig = loadGridConfig(configName);
  const configDefaultQuery = /^[a-zA-Z0-9_-]+$/.test(gridConfig.query || '') ? gridConfig.query : 'default';
  const queryName = /^[a-zA-Z0-9_-]+$/.test(request.query.query || '') ? request.query.query : configDefaultQuery;

  // Optional fast-QA override: ?pollMs=4000 lets a manual tester shorten the
  // poll interval without editing the config JSON. Works in demo and live mode.
  const pollMsOverride = parseInt(request.query.pollMs, 10);
  if (Number.isInteger(pollMsOverride) && pollMsOverride > 0) {
    gridConfig.pollIntervalMs = pollMsOverride;
  }

  // Embed cached workfolders so the client never needs to fetch them live
  gridConfig.workfolders = await neonConfigConnector.loadWorkfoldersConfig();

  let params = {
    seo: {
      title: "Neon Articles Grid",
      description: "AG-Grid list of articles from Neon CMS"
    },
    neonAppUrl: process.env.NEON_APP_URL,
    apiKey: auth.apikey,
    demo: request.query.demo === 'true',
    gridConfig: JSON.stringify(gridConfig),
    gridConfigName: configName,
    queryConfigName: queryName
  };
  return reply.view("/src/widgets/neon-grid.hbs", params);
}

async function neonGridDataHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const demoMode = request.query.demo === 'true';
  const configName = /^[a-zA-Z0-9_-]+$/.test(request.query.config || '') ? request.query.config : 'default';
  const gridConfig = loadGridConfig(configName);
  const configDefaultQuery = /^[a-zA-Z0-9_-]+$/.test(gridConfig.query || '') ? gridConfig.query : 'default';
  const queryName = /^[a-zA-Z0-9_-]+$/.test(request.query.query || '') ? request.query.query : configDefaultQuery;

  await neonConfigConnector.loadContentTypesConfig();

  const mapNodes = (nodes) => nodes.map(node => {
    const derived = derivePrintFields(node); // { printPriority, issueDate }
    const derivedMap = {
      printPriority: derived.printPriority,
      issueDate: derived.issueDate,
      typeLabel: neonConfigConnector.getTypeLabel(node.typeName),
      status: node.versionInfo?.workflowInfo?.workflow || 'Unknown',
      statusColor: node.versionInfo?.workflowInfo?.color || null,
    };
    const row = { id: node.familyRef, typeName: node.typeName ?? null };
    for (const f of gridConfig.fields) {
      row[f.key] = f.derived ? (derivedMap[f.derived] ?? null) : (getByPath(node, f.source) ?? null);
    }
    return row;
  });

  if (demoMode) {
    try {
      const fs = require('fs');
      const path = require('path');
      const demoData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples', gridConfig.demoData || 'search-results.json'), 'utf8'));
      const nodes = demoData.nodes || [];
      const revealKey = `grid:${configName}:${queryName}`;
      const revealCount = getDemoRevealSlice(revealKey, nodes.length);
      return reply.status(200).send({ articles: mapNodes(nodes.slice(0, revealCount)) });
    } catch (error) {
      console.error('neonGridDataHandler demo error:', error);
      return reply.status(500).send({ error: 'Failed to load demo data' });
    }
  }

  const queryConfig = loadQueryConfig('neon-grid', queryName);

  const queryPayload = {
    queryStatement: queryConfig.queryStatement,
    variables: { ...queryConfig.variables },
    options: queryConfig.options || { showLoadPublishInfo: true, showSystemAttributes: true }
  };

  if (gridConfig.queryOverrides?.variables) {
    Object.assign(queryPayload.variables, gridConfig.queryOverrides.variables);
  }

  // Query variable overrides from client switcher
  const qvRaw = request.query.qv;
  if (qvRaw) {
    try {
      const qv = JSON.parse(qvRaw);
      if (qv && typeof qv === 'object' && !Array.isArray(qv)) {
        Object.assign(queryPayload.variables, qv);
      }
    } catch {
      // malformed qv — ignore
    }
  }

  try {
    const searchResults = await neonBoApi.searchContents(queryPayload, 500, 500);
    const articles = mapNodes(searchResults.nodes || []);
    return reply.status(200).send({ articles });
  } catch (error) {
    console.error('neonGridDataHandler error:', error);
    return reply.status(500).send({ error: 'Failed to fetch articles from Neon' });
  }
}

async function neonGridDuplicateHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });

  const { familyRef, workFolder, name, type } = request.body || {};
  if (!familyRef || !workFolder) return reply.status(400).send({ error: 'familyRef and workFolder are required' });

  const issueDate = new Date().toISOString().split('T')[0];
  const workspaceSuffix = workFolder.split('/').filter(Boolean).pop() ?? '';
  const duplicateName = workspaceSuffix ? `${name} [${workspaceSuffix}]` : name;

  try {
    const result = await neonBoApi.duplicateNode(familyRef, { name: duplicateName, workFolder, type, issueDate });
    return reply.status(200).send(result);
  } catch (error) {
    console.error('neonGridDuplicateHandler error:', error);
    const status = error.response?.status || 500;
    return reply.status(status).send({ error: `Duplicate failed: ${error.message}` });
  }
}

function printQueryBoardHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });

  const fs = require('fs');
  const path = require('path');
  let printConfig = {};
  try {
    printConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../conf/widgets/print-query-board/print-query-board-config.json'), 'utf8'));
  } catch (error) {
    console.error('printQueryBoardHandler config error:', error);
  }

  const queryName = /^[a-zA-Z0-9_-]+$/.test(request.query.query || '') ? request.query.query : 'default';

  // Optional fast-QA override: ?pollMs=4000 lets a manual tester shorten the
  // poll interval without editing the config JSON. Works in demo and live mode.
  const pollMsOverride = parseInt(request.query.pollMs, 10);
  if (Number.isInteger(pollMsOverride) && pollMsOverride > 0) {
    printConfig.pollIntervalMs = pollMsOverride;
  }

  return reply.view('/src/widgets/print-query-board.hbs', {
    seo: { title: 'Print Query Board', description: 'Kanban board for planning print edition stories by section, priority, desk, or access' },
    neonAppUrl: process.env.NEON_APP_URL,
    apiKey: auth.apikey,
    demo: request.query.demo === 'true',
    printConfig: JSON.stringify(printConfig),
    queryConfigName: queryName
  });
}

async function printQueryBoardDataHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const demoMode = request.query.demo === 'true';
  const queryName = /^[a-zA-Z0-9_-]+$/.test(request.query.query || '') ? request.query.query : 'default';

  await neonConfigConnector.loadContentTypesConfig();

  const mapStories = (nodes) => nodes.map(node => {
    const { printPriority } = derivePrintFields(node);
    // Only an explicit nodeMeta.printIssueDate means this story is assigned to a print
    // issue; otherwise leave it unset so the frontend bins it into the active issue.
    const printIssueDateMeta = node.nodeMeta?.printIssueDate;
    const issueDate = printIssueDateMeta ? normalizeDateToIso(printIssueDateMeta) : null;
    const printSectionRaw = node.nodeMeta?.printSection || null;
    const segments = printSectionRaw ? printSectionRaw.split('/').filter(Boolean) : [];
    const section = segments.length ? segments[segments.length - 1] : 'Unassigned';

    return {
      id: node.familyRef,
      title: node.title || '',
      type: neonConfigConnector.getTypeLabel(node.typeName),
      status: node.versionInfo?.workflowInfo?.workflow || 'Unknown',
      statusColor: node.versionInfo?.workflowInfo?.color || null,
      printPriority,
      issueDate,
      printSection: printSectionRaw,
      section,
      printDiffusion: node.nodeMeta?.printDiffusion || null,
      paywallLevel: Object.values(node.publishInfos || {})[0]?.paywallLevel || 'FREE',
      wordCount: node.metadataGroups?.eom?.sys_attributes_json?.wordCount || 0
    };
  });

  if (demoMode) {
    try {
      const fs = require('fs');
      const path = require('path');
      const demoData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/search-results.json'), 'utf8'));
      const nodes = demoData.nodes || [];
      const revealKey = `board:${queryName}`;
      const revealCount = getDemoRevealSlice(revealKey, nodes.length);
      return reply.status(200).send({ stories: mapStories(nodes.slice(0, revealCount)) });
    } catch (error) {
      console.error('printQueryBoardDataHandler demo error:', error);
      return reply.status(500).send({ error: 'Failed to load demo data' });
    }
  }

  const queryConfig = loadQueryConfig('print-query-board', queryName);

  const queryPayload = {
    queryStatement: queryConfig.queryStatement,
    variables: { ...queryConfig.variables },
    options: queryConfig.options || { showLoadPublishInfo: true, showSystemAttributes: true }
  };

  try {
    const searchResults = await neonBoApi.searchContents(queryPayload, 50, 50);
    const stories = mapStories(searchResults.nodes || []);
    return reply.status(200).send({ stories });
  } catch (error) {
    console.error('printQueryBoardDataHandler error:', error);
    return reply.status(500).send({ error: 'Failed to fetch stories from Neon' });
  }
}

async function neonCreateWidgetHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const configName = /^[a-zA-Z0-9_-]+$/.test(request.query.config || '') ? request.query.config : 'default';
  const createConfig = loadCreateConfig(configName);

  return reply.view('/src/widgets/neon-create.hbs', {
    seo: { title: 'Create Content', description: 'Quick content creation widget' },
    neonAppUrl: process.env.NEON_APP_URL,
    apiKey: auth.apikey,
    createConfig: JSON.stringify(createConfig),
  });
}

async function neonCreateHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { createOptions } = request.body || {};
  if (!createOptions || !createOptions.type) {
    return reply.status(400).send({ error: 'createOptions.type is required' });
  }

  try {
    const node = await neonBoApi.createNewStory(createOptions);
    console.log('neonCreateHandler << created:', node.familyRef);
    return reply.status(200).send({ familyRef: node.familyRef });
  } catch (err) {
    console.error('neonCreateHandler << error:', err.message);
    return reply.status(500).send({ error: err.message });
  }
}

async function neonNodeUnlockHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) return reply.status(401).send({ error: 'Unauthorized' });
  const { familyRef, unlockMode, updateContextId } = request.body || {};
  if (!familyRef) return reply.status(400).send({ error: 'familyRef is required' });
  try {
    await neonBoApi.unlockNode(familyRef, unlockMode || 'MAJOR', true, updateContextId || null);
    return reply.status(200).send({ success: true });
  } catch (err) {
    console.error('[neonNodeUnlockHandler] Unlock failed:', err.message);
    return reply.status(500).send({ error: 'Failed to unlock node' });
  }
}

module.exports = {
  testWidgetHandler,
  dropWidgetHandler,
  asyncDropUploadWidgetHandler,
  wiresWidgetHandler,
  breakingNewsWidgetHandler,
  breakingNewsPublishHandler,
  smartOctoDashboardHandler,
  neonAnalyticsDashboardHandler,
  welcomeWidgetHandler,
  nssDemoWidgetHandler,
  planningBoardWidgetHandler,
  neonGridWidgetHandler,
  neonGridDataHandler,
  neonGridDuplicateHandler,
  printQueryBoardHandler,
  printQueryBoardDataHandler,
  neonCreateWidgetHandler,
  neonCreateHandler,
  neonNodeUnlockHandler,
};
