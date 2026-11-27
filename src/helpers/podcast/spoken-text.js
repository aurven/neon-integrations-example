const crypto = require('node:crypto');
const { findElementByNodeType, extractTextFromElements } = require('../neon-content-parser');

const BLOCK_TYPES = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'subhead', 'li', 'blockquote']);
const LIST_TYPES = new Set(['ul', 'ol']);

const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function extractSummary(model, storyEl) {
  if (model.summary?.trim()) return model.summary.trim();
  const summaryEl = findElementByNodeType(storyEl?.elements || [], 'summary');
  return summaryEl ? extractTextFromElements(summaryEl.elements) : '';
}

function extractTitle(model, storyEl) {
  if (model.title?.trim()) return model.title;
  const headline = findElementByNodeType(storyEl?.elements || [], 'headline');
  return headline ? extractTextFromElements(headline.elements) : '';
}

// Collect readable blocks from a body text element; unknown containers
// (figures, captions, tables, embeds) are skipped.
function collectBlocks(elements, out) {
  for (const el of elements || []) {
    if (BLOCK_TYPES.has(el.nodeType)) {
      const text = collapse(extractTextFromElements(el.elements));
      if (text) out.push(text);
    } else if (LIST_TYPES.has(el.nodeType)) {
      collectBlocks(el.elements, out);
    }
  }
}

function buildSpokenText(model) {
  const root = model?.rootData || model || {};
  const storyEl = root.files?.content?.data?.elements?.find((el) => el.nodeType === 'story');
  const blocks = [];
  const title = collapse(extractTitle(root, storyEl));
  if (title) blocks.push(title);
  const summary = collapse(extractSummary(root, storyEl));
  if (summary) blocks.push(summary);
  const textEl = (storyEl?.elements || []).find((el) => el.nodeType === 'text');
  collectBlocks(textEl?.elements, blocks);
  return blocks.join('\n\n');
}

function textHash(text) {
  return 'sha256:' + crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Split one oversized piece on word boundaries (hard-cut only for a single word > max).
function splitWords(text, max) {
  const out = [];
  let cur = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(word.slice(0, max));
      word = word.slice(max);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= max) cur += ' ' + word;
    else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out;
}

function splitSentences(text, max) {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  return sentences.flatMap((s) => (s.length <= max ? [s] : splitWords(s, max)));
}

function chunkText(text, maxChars) {
  const pieces = [];
  for (const para of String(text).split(/\n\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= maxChars) pieces.push({ t: p, sep: '\n\n' });
    else splitSentences(p, maxChars).forEach((s, i) => pieces.push({ t: s, sep: i === 0 ? '\n\n' : ' ' }));
  }
  const chunks = [];
  let cur = '';
  for (const { t, sep } of pieces) {
    if (!cur) cur = t;
    else if (cur.length + sep.length + t.length <= maxChars) cur += sep + t;
    else { chunks.push(cur); cur = t; }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

module.exports = { buildSpokenText, textHash, chunkText };
