'use strict';
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const xpath = require('xpath');

const PODCAST_PATH = '/ObjectMetadata/DistributionChannels/Podcast';
const PODCAST_FIELDS = ['Enabled', 'ShareUrl', 'MediaUrl', 'EpisodeId', 'TextHash', 'Provider', 'Status', 'UpdatedAt'];

// camelCase key <-> XML element name (single source of truth)
const FIELD_MAP = {
    enabled: 'Enabled',
    shareUrl: 'ShareUrl',
    mediaUrl: 'MediaUrl',
    episodeId: 'EpisodeId',
    textHash: 'TextHash',
    provider: 'Provider',
    status: 'Status',
    updatedAt: 'UpdatedAt'
};

function parse(xml) {
    return new DOMParser().parseFromString(xml, 'text/xml');
}

/**
 * Read the <Podcast> node. Missing node/fields yield null; `enabled` is true
 * only when Enabled text is "true" (case-insensitive, trimmed).
 */
function readPodcastMetadata(xml) {
    const doc = parse(xml);
    const result = {};
    for (const [key, el] of Object.entries(FIELD_MAP)) {
        const node = xpath.select1(`${PODCAST_PATH}/${el}`, doc);
        const text = node ? (node.textContent || '').trim() : '';
        result[key] = text === '' ? null : text;
    }
    result.enabled = (result.enabled || '').toLowerCase() === 'true';
    return result;
}

function findChild(parent, name) {
    for (let c = parent.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && c.nodeName === name) return c;
    }
    return null;
}

// Get or create a child, inserted before the first existing sibling named in
// `before` (DTD order); appended when none of them exists.
function ensureChild(parent, name, before = []) {
    const existing = findChild(parent, name);
    if (existing) return existing;
    const el = parent.ownerDocument.createElement(name);
    let ref = null;
    for (let c = parent.firstChild; c && !ref; c = c.nextSibling) {
        if (c.nodeType === 1 && before.includes(c.nodeName)) ref = c;
    }
    parent.insertBefore(el, ref);
    return el;
}

/**
 * Set only the provided keys (never `enabled`), creating missing
 * DistributionChannels/Podcast/child elements. Returns the updated XML.
 */
function writePodcastMetadata(xml, fields) {
    const doc = parse(xml);
    const root = doc.documentElement;
    const podcast = ensureChild(ensureChild(root, 'DistributionChannels', ['Diffusion']), 'Podcast');

    for (const [key, el] of Object.entries(FIELD_MAP)) {
        if (key === 'enabled' || fields[key] === undefined) continue;
        const node = ensureChild(podcast, el, PODCAST_FIELDS.slice(PODCAST_FIELDS.indexOf(el) + 1));
        while (node.firstChild) node.removeChild(node.firstChild);
        const value = fields[key] === null ? '' : String(fields[key]);
        if (value !== '') node.appendChild(doc.createTextNode(value));
    }

    return new XMLSerializer().serializeToString(doc);
}

module.exports = {
    PODCAST_PATH,
    PODCAST_FIELDS,
    readPodcastMetadata,
    writePodcastMetadata
};
