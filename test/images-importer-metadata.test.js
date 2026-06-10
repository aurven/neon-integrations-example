'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildImageMetadataXml } = require('../src/images-importer.js');

const LEGACY_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
  `<ObjectMetadata>` +
  `<iptc>` +
  `<credit></credit>` +
  `</iptc>` +
  `<WebDesign><WebType>Image</WebType></WebDesign>` +
  `</ObjectMetadata>`;

test('no metadata produces the legacy XML exactly', () => {
  assert.equal(buildImageMetadataXml(), LEGACY_XML);
  assert.equal(buildImageMetadataXml({}), LEGACY_XML);
});

test('credit and caption are injected', () => {
  const xml = buildImageMetadataXml({ caption: 'A sunset', credit: 'Jane Doe' });
  assert.ok(xml.includes('<caption>A sunset</caption>'));
  assert.ok(xml.includes('<credit>Jane Doe</credit>'));
});

test('values are XML-escaped', () => {
  const xml = buildImageMetadataXml({ credit: 'AP <Photos> & "Co"' });
  assert.ok(xml.includes('<credit>AP &lt;Photos&gt; &amp; &quot;Co&quot;</credit>'));
});
