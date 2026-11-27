const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpokenText, textHash, chunkText } = require('../../src/helpers/podcast/spoken-text');

const rootData = require('../../examples/out-methode.json').rootData;

test('buildSpokenText starts with title and contains summary', () => {
  const text = buildSpokenText(rootData);
  assert.ok(text.startsWith("SEC's Bold Climate Disclosure Proposal"));
  assert.ok(text.includes(rootData.summary));
  assert.ok(text.includes('The Securities and Exchange Co'));
  assert.ok(!text.includes('Summer Corner'));
  assert.ok(!text.includes('Pexels'));
});

test('buildSpokenText gives same result for wrapper and bare model', () => {
  assert.equal(buildSpokenText({ rootData }), buildSpokenText(rootData));
});

test('buildSpokenText returns title for title-only model', () => {
  assert.equal(buildSpokenText({ title: '  Just   a title ' }), 'Just a title');
});

test('buildSpokenText reads headings, lists and blockquotes, skips tables', () => {
  const t = (v) => ({ nodeType: 'plainText', value: v });
  const model = {
    title: 'T',
    files: { content: { data: { elements: [{ nodeType: 'story', elements: [
      { nodeType: 'text', elements: [
        { nodeType: 'h2', elements: [t('Head')] },
        { nodeType: 'ul', elements: [{ nodeType: 'li', elements: [t('one')] }, { nodeType: 'li', elements: [t('two')] }] },
        { nodeType: 'blockquote', elements: [{ nodeType: 'p', elements: [t('quoted  text')] }] },
        { nodeType: 'table', elements: [{ nodeType: 'p', elements: [t('cell')] }] },
        { nodeType: 'p', elements: [t('end')] }
      ] }
    ] }] } } }
  };
  assert.equal(buildSpokenText(model), 'T\n\nHead\n\none\n\ntwo\n\nquoted text\n\nend');
});

test('textHash', () => {
  assert.equal(textHash('a'), textHash('a'));
  assert.notEqual(textHash('a'), textHash('b'));
  assert.match(textHash('a'), /^sha256:[0-9a-f]{64}$/);
});

const words = (s) => s.split(/\s+/).filter(Boolean);

test('chunkText packs paragraphs greedily', () => {
  const p = 'x'.repeat(100);
  const chunks = chunkText([p, p, p].join('\n\n'), 250);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], `${p}\n\n${p}`);
});

test('chunkText splits long sentence on words', () => {
  const sentence = Array.from({ length: 150 }, (_, i) => `w${i}xx`).join(' ') + '.';
  assert.ok(sentence.length > 800);
  const chunks = chunkText(sentence, 400);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 400 && c.length > 0);
  assert.deepEqual(words(chunks.join(' ')), words(sentence));
});

test('chunkText 40 paragraphs keeps limit and order', () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Para ${i} first sentence here. Second sentence of ${i}! Third one? Yes.`);
  const text = paras.join('\n\n');
  const chunks = chunkText(text, 200);
  for (const c of chunks) assert.ok(c.length <= 200 && c.trim().length > 0);
  assert.deepEqual(words(chunks.join(' ')), words(text));
});
