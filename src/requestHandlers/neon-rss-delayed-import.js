const Parser = require('rss-parser');
const delayedImporter = require('../delayed-importer.js');
const { safeLogRequest } = require('../helpers/utils.js');
const { authenticate } = require('../helpers/auth.js');

function resolveField(item, fieldName) {
  switch (fieldName) {
    case 'title':       return item.title || '';
    case 'description': return item.contentSnippet || item.description || '';
    case 'content':     return item.content || item.contentSnippet || item.description || '';
    case 'link':        return item.link || '';
    case 'pubDate':     return item.isoDate || item.pubDate || '';
    case 'dc:creator':  return item.dcCreator || '';
    case 'author':      return item.author || item.creator || '';
    default:            return item[fieldName] || '';
  }
}

function interpolateSuffix(template, vars) {
  return template.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function formatDate(dateStr, locale) {
  try {
    return new Date(dateStr).toLocaleDateString(locale || 'it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr || '';
  }
}

async function fetchRssItems(rssUrl, maxItems) {
  const parser = new Parser({
    customFields: {
      item: [
        ['dc:creator', 'dcCreator'],
        ['author',     'creator'],
      ],
    },
  });

  const feed = await parser.parseURL(rssUrl);
  const slice = maxItems ? feed.items.slice(0, maxItems) : feed.items;
  return slice;
}

async function submitRssDelayedImportHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log('submitRssDelayedImportHandler << ERROR: Unauthorized');
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  console.log('submitRssDelayedImportHandler << IN:');
  const safeReq = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log('Request Headers:', JSON.stringify(safeReq.headers));
  console.log('Request Body:', JSON.stringify(safeReq.body));

  const {
    rssUrl,
    site,
    workspace,
    duration    = 1,
    type        = 'wirestory',
    maxItems,
    assignTo,
    publish     = false,
    fieldMap    = {},
    contentSuffix,
    dateLocale  = 'it-IT',
  } = request.body || {};

  if (!rssUrl)    return reply.status(400).send({ error: 'rssUrl is required' });
  if (!site)      return reply.status(400).send({ error: 'site is required' });
  if (!workspace) return reply.status(400).send({ error: 'workspace is required' });

  let rssItems;
  try {
    rssItems = await fetchRssItems(rssUrl, maxItems);
  } catch (err) {
    console.error('submitRssDelayedImportHandler << RSS fetch error:', err.message);
    return reply.status(502).send({ error: `Failed to fetch RSS: ${err.message}` });
  }

  if (!rssItems.length) {
    return reply.status(422).send({ error: 'No items found in RSS feed' });
  }

  const items = rssItems.map(item => {
    const entry = { contentType: 'story', type };

    for (const [storyField, rssFieldName] of Object.entries(fieldMap)) {
      entry[storyField] = resolveField(item, rssFieldName);
    }

    if (contentSuffix && entry.content !== undefined) {
      const pubDateFormatted = formatDate(resolveField(item, 'pubDate'), dateLocale);
      entry.content += interpolateSuffix(contentSuffix, {
        title:   resolveField(item, 'title'),
        link:    resolveField(item, 'link'),
        pubDate: pubDateFormatted,
      });
    }

    return entry;
  });

  const payload = { site, workspace, duration, publish, items };
  if (assignTo) payload.assignTo = assignTo;

  const validation = delayedImporter.validatePayload(payload);
  if (!validation.valid) {
    console.error('submitRssDelayedImportHandler << validation error:', validation.error);
    return reply.status(400).send({ error: validation.error });
  }

  const job = delayedImporter.createJob(payload);

  console.log('submitRssDelayedImportHandler << OUT:', JSON.stringify(job));
  return reply.status(202).send({ ...job, rssUrl, fetchedItems: items.length });
}

module.exports = { submitRssDelayedImportHandler };
