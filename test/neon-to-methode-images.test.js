'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { transformWebImageGroups, NEON_EXCLUDED_ATTRIBUTES } = require('../src/neon-to-methode.js');

const TARGET = '02a6-214ab9943dad-d477ee5e2ef4-1000';
const SRC = (dims) => `/resources/${TARGET}/:${dims}:abc/george-santos.jpg?s=x`;
const EMXED = 'emxed-trx-component-type="image" emxed-trx-rezize="true" emxed-trx-uri-name="fileref"';
const FILEREF = '/Production/Product/Pictures/2026-10/14/george-santos.jpg?uuid=1c715308-c617-11f1-9214-d44777c0a1a5';

// Shape produced by jsonToXml for the Neon web-image-group (ids kept, enabledcropslist excluded)
const NEON_GROUP = `<story><web-image-group emxed-trx-show-images-button="true" group="media" id="Q4kt08luZwRX3X3">`
  + `<image ${EMXED} src="${SRC('1200x675')}" id="QhvWajlzPP15PlU" softCrop="Wide" softcropenabled="enabled" tmx="240 192 1200 675" class="wide xsm-blockstyle-align-center" xsm-preserve="true" xtransform="translate(-18 -0.6) scale(5.1 5.1)" targetid="${TARGET}"/>`
  + `<image ${EMXED} src="${SRC('490x490')}" id="QoVOg0nZaroHaPG" softCrop="Square" softcropenabled="enabled" tmx="240 192 490 490" class="square xsm-blockstyle-align-center" xsm-preserve="true" xtransform="translate(-203 -0.5) scale(3.7 3.7)"/>`
  + `<image ${EMXED} src="${SRC('556x988')}" id="QTqhxIJowi1exSI" softCrop="Portrait" softcropenabled="enabled" tmx="240 192 556 988" class="portrait xsm-blockstyle-align-center" xsm-preserve="true" xtransform="translate(-626 -1) scale(7.4 7.4)"/>`
  + `<image ${EMXED} src="${SRC('2048x800')}" id="QTfqfy6ibousBEQ" softCrop="Ultrawide" softcropenabled="enabled" tmx="240 192 2048 800" class="ultrawide xsm-blockstyle-align-center" xsm-preserve="true" xtransform="translate(-30 -177) scale(8.7 8.7)"/>`
  + `<web-image-caption id="QskvDKCbRBQDKgx"><caption id="QnkpCd1cWQm7hkc"><p id="QKTAeg2x8LkiLc0">George Santos outside court.</p></caption>`
  + `<credit id="QXi9fmkgtfYGYx3"><p id="QqYTDJEtvAc4wFt">Photograph: Stefan Jeremiah/AP</p></credit></web-image-caption>`
  + `</web-image-group></story>`;

const REFS = { [TARGET]: { fileref: FILEREF } };

function run(xml = NEON_GROUP, refs = REFS) {
  const $doc = cheerio.load(xml, { xml: true }, false);
  transformWebImageGroups($doc, refs);
  return $doc;
}

test('ids are no longer excluded from the Neon XML', () => {
  assert.ok(!NEON_EXCLUDED_ATTRIBUTES.includes('id'));
  assert.ok(NEON_EXCLUDED_ATTRIBUTES.includes('enabledcropslist'));
});

test('web-image-group gets the Méthode attributes and keeps its own', () => {
  const $group = run()('web-image-group');
  assert.deepEqual($group.get(0).attribs, {
    'emxed-trx-show-images-button': 'true',
    group: 'media',
    id: 'Q4kt08luZwRX3X3',
    class: 'default',
    picturedesklite: 'true',
    enabledcropslist: 'Landscape,Square,Rectangle',
  });
});

test('Neon crops become exactly three Méthode web-images, in order', () => {
  const $doc = run();
  assert.equal($doc('web-image-group image').length, 0);
  const webImages = $doc('web-image-group web-image').toArray();
  assert.deepEqual(webImages.map((w) => [w.attribs.softCrop, w.attribs.class]), [
    ['Landscape', 'landscape'],
    ['Square', 'square'],
    ['Rectangle', 'rect'],
  ]);
  // web-images come before the caption
  assert.equal($doc('web-image-group').children().last().get(0).name, 'web-image-caption');
});

test('web-images keep existing non-crop attributes, drop Neon crop data, add nothing else', () => {
  const [landscape, square, rect] = run()('web-image-group web-image').toArray();
  assert.deepEqual(landscape.attribs, {
    'emxed-trx-component-type': 'image',
    'emxed-trx-rezize': 'true',
    'emxed-trx-uri-name': 'fileref',
    'xsm-preserve': 'true',
    id: 'QhvWajlzPP15PlU',
    class: 'landscape',
    softCrop: 'Landscape',
    fileref: FILEREF,
  });
  assert.equal(square.attribs.id, 'QoVOg0nZaroHaPG');
  assert.equal(rect.attribs.id, 'QTqhxIJowi1exSI');
  for (const w of [landscape, square, rect]) {
    for (const gone of ['src', 'tmx', 'xtransform', 'softcropenabled', 'targetid']) {
      assert.equal(w.attribs[gone], undefined, `${w.attribs.softCrop} still has ${gone}`);
    }
    assert.equal(w.attribs.fileref, FILEREF);
  }
});

test('missing source crops get a generated id; ids stay unique', () => {
  const onlyWide = NEON_GROUP.replace(/<image [^>]*softCrop="(Square|Portrait|Ultrawide)"[^>]*\/>/g, '');
  const ids = run(onlyWide)('web-image-group web-image').toArray().map((w) => w.attribs.id);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], 'QhvWajlzPP15PlU');
  assert.match(ids[1], /^U[A-Za-z0-9]{13}$/);
  assert.match(ids[2], /^U[A-Za-z0-9]{13}$/);
  assert.equal(new Set(ids).size, 3);
});

test('unresolved Méthode picture -> web-images without fileref (as before)', () => {
  const webImages = run(NEON_GROUP, {})('web-image-group web-image').toArray();
  assert.equal(webImages.length, 3);
  assert.ok(webImages.every((w) => w.attribs.fileref === undefined));
});

test('web-image-caption keeps its Neon id', () => {
  assert.equal(run()('web-image-group web-image-caption').attr('id'), 'QskvDKCbRBQDKgx');
});

test('caption is still restructured as before', () => {
  const $doc = run();
  assert.equal($doc('web-image-group web-image-caption p caption').text(), 'George Santos outside court.');
  assert.equal($doc('web-image-group web-image-caption p credit').text(), 'Photograph: Stefan Jeremiah/AP');
});

test('a group without images is left without web-images', () => {
  const $doc = run('<story><web-image-group id="G1"><web-image-caption><caption><p>c</p></caption></web-image-caption></web-image-group></story>');
  assert.equal($doc('web-image').length, 0);
  assert.equal($doc('web-image-group').attr('class'), 'default');
});
