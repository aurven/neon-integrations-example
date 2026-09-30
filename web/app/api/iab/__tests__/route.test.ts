import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../../../proxy';
import { GET as listTaxonomiesRoute } from '../taxonomies/route';
import { GET as getTaxonomyDataRoute } from '../[type]/route';
import { POST as lookupRoute } from '../lookup/route';
import { GET as searchRoute } from '../search/route';
import { POST as validateRoute } from '../validate/route';
import { POST as refreshRoute } from '../refresh/route';
import { GET as childrenRoute } from '../[type]/children/route';
import { GET as statsRoute } from '../[type]/stats/route';
import { getAvailableTaxonomies, getTaxonomy, refreshAll } from '../../../../lib/integrations/iab-taxonomies/service';
import {
  getTaxonomyStats,
  getTaxonomyTree,
  getLabels,
  getHierarchy,
  searchCategories,
  validateIds,
  getChildren,
} from '../../../../lib/integrations/iab-taxonomies/helper';

vi.mock('../../../../lib/integrations/iab-taxonomies/service', () => ({
  getAvailableTaxonomies: vi.fn(),
  getTaxonomy: vi.fn(),
  refreshAll: vi.fn(),
}));

vi.mock('../../../../lib/integrations/iab-taxonomies/helper', () => ({
  getTaxonomyStats: vi.fn(),
  getTaxonomyTree: vi.fn(),
  getLabels: vi.fn(),
  getHierarchy: vi.fn(),
  searchCategories: vi.fn(),
  validateIds: vi.fn(),
  getChildren: vi.fn(),
}));

const mocks = {
  getAvailableTaxonomies: getAvailableTaxonomies as unknown as ReturnType<typeof vi.fn>,
  getTaxonomy: getTaxonomy as unknown as ReturnType<typeof vi.fn>,
  refreshAll: refreshAll as unknown as ReturnType<typeof vi.fn>,
  getTaxonomyStats: getTaxonomyStats as unknown as ReturnType<typeof vi.fn>,
  getTaxonomyTree: getTaxonomyTree as unknown as ReturnType<typeof vi.fn>,
  getLabels: getLabels as unknown as ReturnType<typeof vi.fn>,
  getHierarchy: getHierarchy as unknown as ReturnType<typeof vi.fn>,
  searchCategories: searchCategories as unknown as ReturnType<typeof vi.fn>,
  validateIds: validateIds as unknown as ReturnType<typeof vi.fn>,
  getChildren: getChildren as unknown as ReturnType<typeof vi.fn>,
};

function paramsOf(type: string) {
  return { params: Promise.resolve({ type }) };
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/iab/taxonomies', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('lists taxonomies with stats when cached, and basic info when not', async () => {
    mocks.getAvailableTaxonomies.mockReturnValue({
      content: { version: '3.1', filename: 'Content Taxonomy 3.1.tsv' },
      audience: { version: '1.1', filename: 'Audience Taxonomy 1.1.tsv' },
      adproduct: { version: '2.0', filename: 'Ad Product Taxonomy 2.0.tsv' },
    });
    mocks.getTaxonomyStats.mockImplementation((type: string) => {
      if (type === 'content') {
        return Promise.resolve({
          version: '3.1',
          type: 'content',
          totalCategories: 10,
          rootCategories: 2,
          maxDepth: 4,
          lastUpdated: '2026-06-14T00:00:00.000Z',
        });
      }
      return Promise.reject(new Error('not cached'));
    });

    const response = await listTaxonomiesRoute();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.taxonomies.content).toEqual({
      version: '3.1',
      filename: 'Content Taxonomy 3.1.tsv',
      stats: { totalCategories: 10, rootCategories: 2, maxDepth: 4, lastUpdated: '2026-06-14T00:00:00.000Z' },
    });
    expect(body.taxonomies.audience).toEqual({ version: '1.1', filename: 'Audience Taxonomy 1.1.tsv', cached: false });
  });
});

describe('GET /api/iab/[type]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 for an invalid type', async () => {
    const response = await getTaxonomyDataRoute(new NextRequest('https://example.com/api/iab/bogus'), paramsOf('bogus'));

    expect(response.status).toBe(400);
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
  });

  it('returns flat data by default', async () => {
    mocks.getTaxonomy.mockResolvedValue({
      version: '3.1',
      categories: [{ id: '1', name: 'Arts & Entertainment', parentId: null, tiers: ['Arts & Entertainment'] }],
      index: { '1': { name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null } },
      totalCategories: 1,
      lastUpdated: '2026-06-14T00:00:00.000Z',
    });

    const response = await getTaxonomyDataRoute(new NextRequest('https://example.com/api/iab/content'), paramsOf('content'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, type: 'content', format: 'flat', totalCategories: 1 });
    expect(mocks.getTaxonomyTree).not.toHaveBeenCalled();
  });

  it('returns tree data when format=tree, passing maxDepth through', async () => {
    mocks.getTaxonomyTree.mockResolvedValue([
      { id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null, depth: 1, children: [] },
    ]);
    mocks.getTaxonomyStats.mockResolvedValue({
      version: '3.1',
      type: 'content',
      totalCategories: 1,
      rootCategories: 1,
      maxDepth: 1,
      lastUpdated: '2026-06-14T00:00:00.000Z',
    });

    const response = await getTaxonomyDataRoute(
      new NextRequest('https://example.com/api/iab/content?format=tree&maxDepth=2'),
      paramsOf('content')
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, type: 'content', format: 'tree', version: '3.1' });
    expect(mocks.getTaxonomyTree).toHaveBeenCalledWith('content', 2);
  });
});

describe('POST /api/iab/lookup', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 when type is missing', async () => {
    const response = await lookupRoute(jsonRequest('https://example.com/api/iab/lookup', { ids: ['1'] }));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid type', async () => {
    const response = await lookupRoute(jsonRequest('https://example.com/api/iab/lookup', { type: 'bogus', ids: ['1'] }));
    expect(response.status).toBe(400);
  });

  it('performs a simple label lookup', async () => {
    mocks.getLabels.mockResolvedValue({
      found: [{ id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null }],
      notFound: [],
      total: 1,
      foundCount: 1,
      notFoundCount: 0,
    });

    const response = await lookupRoute(jsonRequest('https://example.com/api/iab/lookup', { type: 'content', ids: ['1'] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, type: 'content', hierarchy: false, foundCount: 1 });
  });

  it('performs a hierarchy lookup when hierarchy is true', async () => {
    mocks.getHierarchy.mockResolvedValue({
      id: '1',
      name: 'Arts & Entertainment',
      path: 'Arts & Entertainment',
      parentId: null,
      tiers: ['Arts & Entertainment'],
      hierarchy: [],
      depth: 0,
    });

    const response = await lookupRoute(
      jsonRequest('https://example.com/api/iab/lookup', { type: 'content', ids: ['1'], hierarchy: true })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, type: 'content', hierarchy: true, totalRequested: 1, totalFound: 1 });
  });
});

describe('GET /api/iab/search', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 when q is missing', async () => {
    const response = await searchRoute(new NextRequest('https://example.com/api/iab/search?type=content'));
    expect(response.status).toBe(400);
  });

  it('returns search results', async () => {
    mocks.searchCategories.mockResolvedValue([
      { id: '2', name: 'Movies', path: 'Arts & Entertainment > Movies', parentId: '1', tiers: ['Arts & Entertainment', 'Movies'] },
    ]);

    const response = await searchRoute(new NextRequest('https://example.com/api/iab/search?type=content&q=movie'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, type: 'content', query: 'movie', count: 1 });
    expect(mocks.searchCategories).toHaveBeenCalledWith('content', 'movie', { caseSensitive: false, limit: 50 });
  });
});

describe('POST /api/iab/validate', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 when ids is not an array', async () => {
    const response = await validateRoute(jsonRequest('https://example.com/api/iab/validate', { type: 'content', ids: '1' }));
    expect(response.status).toBe(400);
  });

  it('returns validation results', async () => {
    mocks.validateIds.mockResolvedValue({ valid: ['1'], invalid: ['99'], isValid: false, validCount: 1, invalidCount: 1 });

    const response = await validateRoute(
      jsonRequest('https://example.com/api/iab/validate', { type: 'content', ids: ['1', '99'] })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      type: 'content',
      valid: ['1'],
      invalid: ['99'],
      isValid: false,
      validCount: 1,
      invalidCount: 1,
    });
  });
});

describe('POST /api/iab/refresh', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('refreshes all taxonomies', async () => {
    mocks.refreshAll.mockResolvedValue({ refreshed: ['content', 'audience', 'adproduct'], errors: [] });

    const response = await refreshRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Taxonomies refresh completed',
      refreshed: ['content', 'audience', 'adproduct'],
      errors: [],
    });
  });
});

describe('GET /api/iab/[type]/children', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 for an invalid type', async () => {
    const response = await childrenRoute(new NextRequest('https://example.com/api/iab/bogus/children'), paramsOf('bogus'));
    expect(response.status).toBe(400);
  });

  it('returns children for the root when parentId is omitted', async () => {
    mocks.getChildren.mockResolvedValue([
      { id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null, hasChildren: true },
    ]);

    const response = await childrenRoute(new NextRequest('https://example.com/api/iab/content/children'), paramsOf('content'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      type: 'content',
      parentId: null,
      children: [{ id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null, hasChildren: true }],
      count: 1,
    });
    expect(mocks.getChildren).toHaveBeenCalledWith('content', null);
  });
});

describe('GET /api/iab/[type]/stats', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 for an invalid type', async () => {
    const response = await statsRoute(new NextRequest('https://example.com/api/iab/bogus/stats'), paramsOf('bogus'));
    expect(response.status).toBe(400);
  });

  it('returns taxonomy statistics', async () => {
    mocks.getTaxonomyStats.mockResolvedValue({
      version: '3.1',
      type: 'content',
      totalCategories: 10,
      rootCategories: 2,
      maxDepth: 4,
      lastUpdated: '2026-06-14T00:00:00.000Z',
    });

    const response = await statsRoute(new NextRequest('https://example.com/api/iab/content/stats'), paramsOf('content'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      version: '3.1',
      type: 'content',
      totalCategories: 10,
      rootCategories: 2,
      maxDepth: 4,
      lastUpdated: '2026-06-14T00:00:00.000Z',
    });
  });
});

describe('proxy + /api/iab', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('blocks /api/iab/taxonomies without an apikey', async () => {
    const request = new NextRequest('https://example.com/api/iab/taxonomies');
    const response = proxy(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows /api/iab/taxonomies through with a valid apikey header', () => {
    const request = new NextRequest('https://example.com/api/iab/taxonomies', {
      headers: { apikey: 'admin-key' },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
