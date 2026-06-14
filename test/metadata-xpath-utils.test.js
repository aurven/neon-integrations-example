'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { applyMetadataChanges } = require('../src/helpers/metadata-xpath-utils.js');

const SAMPLE_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">` +
  `<ObjectMetadata>` +
  `<General><Keywords/><Keyword>first</Keyword><Keyword>second</Keyword></General>` +
  `<SEO><SEOTitle>Old title</SEOTitle><MetaDescription>Old description</MetaDescription></SEO>` +
  `</ObjectMetadata>`;

test('set replaces an empty element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/General/Keywords', action: 'set', value: 'space, science' }
  ]);
  assert.ok(result.includes('<Keywords>space, science</Keywords>'));
});

test('set replaces an existing element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'New title' }
  ]);
  assert.ok(result.includes('<SEOTitle>New title</SEOTitle>'));
  assert.ok(!result.includes('Old title'));
});

test('unset clears an element\'s text content', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/MetaDescription', action: 'unset' }
  ]);
  assert.ok(result.includes('<MetaDescription/>') || result.includes('<MetaDescription></MetaDescription>'));
  assert.ok(!result.includes('Old description'));
});

test('an xpath matching nothing is skipped without throwing', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/DoesNotExist', action: 'set', value: 'x' },
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'New title' }
  ]);
  assert.ok(result.includes('<SEOTitle>New title</SEOTitle>'));
  assert.ok(!result.includes('DoesNotExist'));
});

test('an xpath matching multiple nodes only changes the first', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/General/Keyword', action: 'set', value: 'changed' }
  ]);
  assert.ok(result.includes('<Keyword>changed</Keyword>'));
  assert.ok(result.includes('<Keyword>second</Keyword>'));
});

test('values are XML-escaped and DOCTYPE is preserved', () => {
  const result = applyMetadataChanges(SAMPLE_XML, [
    { xpath: '/ObjectMetadata/SEO/SEOTitle', action: 'set', value: 'A & <B>' }
  ]);
  assert.ok(result.includes('<SEOTitle>A &amp; &lt;B&gt;</SEOTitle>'));
  assert.ok(result.includes('<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">'));
});
