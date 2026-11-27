'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  PODCAST_PATH,
  PODCAST_FIELDS,
  readPodcastMetadata,
  writePodcastMetadata
} = require('../../src/helpers/podcast/metadata.js');

const HEAD =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">`;
const SEO = `<SEO><SEOTitle>Title</SEOTitle></SEO>`;
const BARE_XML = `${HEAD}<ObjectMetadata><General><Keyword>a</Keyword></General>${SEO}</ObjectMetadata>`;

const withPodcast = (inner) =>
  `${HEAD}<ObjectMetadata>${SEO}<DistributionChannels><Podcast>${inner}</Podcast></DistributionChannels></ObjectMetadata>`;

test('constants expose the path and field list', () => {
  assert.equal(PODCAST_PATH, '/ObjectMetadata/DistributionChannels/Podcast');
  assert.deepEqual(PODCAST_FIELDS, ['Enabled', 'ShareUrl', 'MediaUrl', 'EpisodeId', 'TextHash', 'Provider', 'Status', 'UpdatedAt']);
});

test('read with no Podcast node returns disabled and nulls', () => {
  assert.deepEqual(readPodcastMetadata(BARE_XML), {
    enabled: false, shareUrl: null, mediaUrl: null, episodeId: null,
    textHash: null, provider: null, status: null, updatedAt: null
  });
});

test('Enabled is case-insensitive and trimmed', () => {
  assert.equal(readPodcastMetadata(withPodcast('<Enabled> TRUE </Enabled>')).enabled, true);
});

test('empty or false Enabled is disabled', () => {
  assert.equal(readPodcastMetadata(withPodcast('<Enabled/>')).enabled, false);
  assert.equal(readPodcastMetadata(withPodcast('<Enabled>false</Enabled>')).enabled, false);
});

test('full node reads all fields', () => {
  const r = readPodcastMetadata(withPodcast(
    '<Enabled>true</Enabled><ShareUrl>https://share.transistor.fm/s/abc</ShareUrl><MediaUrl>https://m/x.mp3</MediaUrl>' +
    '<EpisodeId>123</EpisodeId><TextHash>sha256:ff</TextHash><Provider>elevenlabs</Provider><Status>ready</Status>' +
    '<UpdatedAt>2026-11-27T10:00:00Z</UpdatedAt>'));
  assert.deepEqual(r, {
    enabled: true, shareUrl: 'https://share.transistor.fm/s/abc', mediaUrl: 'https://m/x.mp3',
    episodeId: '123', textHash: 'sha256:ff', provider: 'elevenlabs', status: 'ready',
    updatedAt: '2026-11-27T10:00:00Z'
  });
});

test('write creates DistributionChannels/Podcast and keeps DOCTYPE and SEO', () => {
  const out = writePodcastMetadata(BARE_XML, { shareUrl: 'https://share.transistor.fm/s/abc' });
  assert.ok(out.includes('<DistributionChannels><Podcast><ShareUrl>https://share.transistor.fm/s/abc</ShareUrl>'));
  assert.ok(out.includes('<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">'));
  assert.ok(out.includes(SEO));
});

test('write preserves existing siblings such as Print', () => {
  const xml = `${HEAD}<ObjectMetadata><DistributionChannels><Print><PrintSection>/Product/World</PrintSection></Print></DistributionChannels></ObjectMetadata>`;
  const out = writePodcastMetadata(xml, { status: 'ready' });
  assert.ok(out.includes('<Print><PrintSection>/Product/World</PrintSection></Print>'));
  assert.ok(out.includes('<Podcast><Status>ready</Status></Podcast>'));
  assert.equal(readPodcastMetadata(out).status, 'ready');
});

test('write only touches provided keys', () => {
  const xml = withPodcast('<Enabled>true</Enabled><ShareUrl>https://x/1</ShareUrl><Status>ready</Status>');
  const r = readPodcastMetadata(writePodcastMetadata(xml, { status: 'failed' }));
  assert.equal(r.shareUrl, 'https://x/1');
  assert.equal(r.status, 'failed');
  assert.equal(r.enabled, true);
});

test('enabled in fields is ignored', () => {
  const xml = withPodcast('<Enabled>false</Enabled>');
  const out = writePodcastMetadata(xml, { enabled: true, status: 'ready' });
  assert.equal(readPodcastMetadata(out).enabled, false);
  const out2 = writePodcastMetadata(BARE_XML, { enabled: true, status: 'ready' });
  assert.ok(!out2.includes('<Enabled'));
});

test('round trip returns written values', () => {
  const fields = {
    shareUrl: 'https://s/1', mediaUrl: 'https://m/1.mp3', episodeId: '42',
    textHash: 'sha256:ab', provider: 'openai', status: 'ready', updatedAt: '2026-11-27T10:00:00.000Z'
  };
  const r = readPodcastMetadata(writePodcastMetadata(BARE_XML, fields));
  assert.deepEqual(r, { enabled: false, ...fields });
});
