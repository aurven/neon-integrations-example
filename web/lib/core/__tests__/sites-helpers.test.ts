import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  getFrontOfficeUrl,
  getSiteHostname,
  getNodeById,
  getResource,
  getResourceById,
} from '../sites-helpers';

vi.mock('axios');

describe('getFrontOfficeUrl', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns the configured URL for a given site and environment', () => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    expect(getFrontOfficeUrl('theglobe', 'live')).toBe('https://theglobe.example.com');
  });

  it('returns the configured URL for a preview environment', () => {
    process.env.NEON_FO_THEGLOBE_PREVIEW_URL = 'https://preview.theglobe.example.com';
    expect(getFrontOfficeUrl('theglobe', 'preview')).toBe('https://preview.theglobe.example.com');
  });

  it('returns undefined when the env var is not set', () => {
    delete process.env.NEON_FO_UNKNOWNSITE_LIVE_URL;
    expect(getFrontOfficeUrl('unknownsite', 'live')).toBeUndefined();
  });

  it('defaults to the live environment when none is provided', () => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    expect(getFrontOfficeUrl('theglobe')).toBe('https://theglobe.example.com');
  });
});

describe('getSiteHostname', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockRequest = vi.fn();

  beforeEach(() => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({
      request: mockRequest,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns the hostname from a successful response', async () => {
    mockRequest.mockResolvedValue({
      data: { siteNode: { hostname: 'theglobe.com' } },
    });

    const result = await getSiteHostname('theglobe', 'live');

    expect(result).toBe('theglobe.com');
  });

  it('returns null when no Front Office URL is configured', async () => {
    delete process.env.NEON_FO_THEGLOBE_LIVE_URL;

    const result = await getSiteHostname('theglobe', 'live');

    expect(result).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('returns null when the request rejects', async () => {
    mockRequest.mockRejectedValue(new Error('network error'));

    const result = await getSiteHostname('theglobe', 'live');

    expect(result).toBeNull();
  });
});

describe('getNodeById', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockRequest = vi.fn();

  beforeEach(() => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({
      request: mockRequest,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns response.data on success', async () => {
    mockRequest.mockResolvedValue({ data: { resourceUrl: '/api/resource/123' } });

    const result = await getNodeById({ siteName: 'theglobe', targetId: '123', environment: 'live' });

    expect(result).toEqual({ resourceUrl: '/api/resource/123' });
  });

  it('returns undefined on error', async () => {
    mockRequest.mockRejectedValue(new Error('network error'));

    const result = await getNodeById({ siteName: 'theglobe', targetId: '123', environment: 'live' });

    expect(result).toBeUndefined();
  });
});

describe('getResource', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockRequest = vi.fn();

  beforeEach(() => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({
      request: mockRequest,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns response.data on success', async () => {
    const streamData = { pipe: vi.fn() };
    mockRequest.mockResolvedValue({ data: streamData });

    const result = await getResource({
      siteName: 'theglobe',
      url: '/api/resource/123',
      environment: 'live',
    });

    expect(result).toBe(streamData);
  });

  it('returns undefined on error', async () => {
    mockRequest.mockRejectedValue(new Error('network error'));

    const result = await getResource({
      siteName: 'theglobe',
      url: '/api/resource/123',
      environment: 'live',
    });

    expect(result).toBeUndefined();
  });
});

describe('getResourceById', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockRequest = vi.fn();

  beforeEach(() => {
    process.env.NEON_FO_THEGLOBE_LIVE_URL = 'https://theglobe.example.com';
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({
      request: mockRequest,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('composes getNodeById and getResource using the resourceUrl from the node', async () => {
    const streamData = { pipe: vi.fn() };
    mockRequest
      .mockResolvedValueOnce({ data: { resourceUrl: '/api/resource/123' } })
      .mockResolvedValueOnce({ data: streamData });

    const result = await getResourceById({ siteName: 'theglobe', targetId: '123', environment: 'live' });

    expect(result.node).toEqual({ resourceUrl: '/api/resource/123' });
    expect(result.data).toBe(streamData);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[0][0].url).toBe('https://theglobe.example.com/api/nodes/123');
    expect(mockRequest.mock.calls[1][0].url).toBe(
      'https://theglobe.example.com/api/resource/123'
    );
  });

  it('falls back to an empty resource URL when the node lookup fails', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ data: undefined });

    const result = await getResourceById({ siteName: 'theglobe', targetId: '123', environment: 'live' });

    expect(result.node).toBeUndefined();
    expect(mockRequest.mock.calls[1][0].url).toBe('https://theglobe.example.com');
  });
});
