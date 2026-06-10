/**
 * Delayed Importer — simulates a content feed into Neon.
 * Accepts a batch of items (stories/images) and imports them one at a time,
 * spread evenly over a caller-supplied timespan, into a target workfolder.
 *
 * In-memory only: jobs are lost on server restart (documented limitation).
 * Spec: docs/superpowers/specs/2026-06-10-delayed-importer-design.md
 */
const crypto = require('crypto');
const dayjs = require('dayjs');
const storiesPopulator = require('./stories-populator.js');
const imagesImporter = require('./images-importer.js');
const utils = require('./helpers/utils.js');

const ITEM_TYPES = ['story', 'image'];

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Missing request body' };
  }
  if (typeof body.duration !== 'number' || !(body.duration > 0)) {
    return { valid: false, error: 'duration must be a number of minutes greater than 0' };
  }
  if (!body.site || typeof body.site !== 'string') {
    return { valid: false, error: 'site is required' };
  }
  if (!body.workspace || typeof body.workspace !== 'string') {
    return { valid: false, error: 'workspace is required' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { valid: false, error: 'items must be a non-empty array' };
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `items[${i}]: must be an object` };
    }
    if (!ITEM_TYPES.includes(item.type)) {
      return { valid: false, error: `items[${i}]: type must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.type === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.type === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
  }
  return { valid: true };
}

module.exports = {
  validatePayload,
};
