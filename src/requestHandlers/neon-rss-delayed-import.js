const Parser = require('rss-parser');
const delayedImporter = require('../delayed-importer.js');
const { safeLogRequest } = require('../helpers/utils.js');
const { authenticate } = require('../helpers/auth.js');

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function formatItalianDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('it-IT', {
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
        ['author',     'authorField'],
      ],
    },
  });

  const feed = await parser.parseURL(rssUrl);
  const slice = maxItems ? feed.items.slice(0, maxItems) : feed.items;

  return slice.map(item => ({
    title:       item.title       || '',
    description: item.content     || item.contentSnippet || item.description || '',
    link:        item.link        || '',
    pubDate:     item.isoDate     || item.pubDate || '',
    byline:      item.dcCreator   || item.authorField || item.creator || item.author || '',
  }));
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
    sourceName,
    locale      = 'it-IT',
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

  let displaySource = sourceName;
  if (!displaySource) {
    try { displaySource = new URL(rssUrl).hostname.replace(/^www\./, ''); }
    catch { displaySource = rssUrl; }
  }

  const items = rssItems.map(item => {
    const dateLabel = formatItalianDate(item.pubDate);
    const attribution = `<p>Questo articolo è apparso su ${displaySource} <a href="${item.link}">a questo indirizzo</a> il ${dateLabel}</p>`;
    const entry = {
      contentType: 'story',
      type,
      title:   item.title,
      summary: stripHtml(item.description),
      content: (item.description || '') + attribution,
    };
    if (item.byline) entry.byline = item.byline;
    return entry;
  });

  const payload = {
    site,
    workspace,
    duration,
    publish,
    items,
  };
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
