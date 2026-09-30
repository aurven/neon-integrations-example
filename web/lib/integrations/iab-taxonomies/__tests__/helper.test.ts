import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLabel,
  getLabels,
  getHierarchy,
  searchCategories,
  validateIds,
  getChildren,
  getTaxonomyStats,
  getTaxonomyTree,
} from '../helper';
import { getTaxonomy } from '../service';
import type { TaxonomyData } from '../service';

vi.mock('../service', () => ({
  getTaxonomy: vi.fn(),
}));

const mockGetTaxonomy = getTaxonomy as unknown as ReturnType<typeof vi.fn>;

const fixture: TaxonomyData = {
  version: '3.1',
  taxonomy: 'content',
  lastUpdated: '2026-06-14T00:00:00.000Z',
  totalCategories: 3,
  categories: [
    { id: '1', name: 'Arts & Entertainment', parentId: null, tiers: ['Arts & Entertainment'] },
    { id: '2', name: 'Movies', parentId: '1', tiers: ['Arts & Entertainment', 'Movies'] },
    { id: '3', name: 'Comedy Movies', parentId: '2', tiers: ['Arts & Entertainment', 'Movies', 'Comedy Movies'] },
  ],
  index: {
    '1': { name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null },
    '2': { name: 'Movies', path: 'Arts & Entertainment > Movies', parentId: '1' },
    '3': { name: 'Comedy Movies', path: 'Arts & Entertainment > Movies > Comedy Movies', parentId: '2' },
  },
};

beforeEach(() => {
  mockGetTaxonomy.mockReset();
  mockGetTaxonomy.mockResolvedValue(fixture);
});

describe('getLabel', () => {
  it('returns the label for an existing id', async () => {
    expect(await getLabel('content', '2')).toEqual({
      id: '2',
      name: 'Movies',
      path: 'Arts & Entertainment > Movies',
      parentId: '1',
    });
  });

  it('returns null for an unknown id', async () => {
    expect(await getLabel('content', '99')).toBeNull();
  });
});

describe('getLabels', () => {
  it('splits ids into found and notFound', async () => {
    const result = await getLabels('content', ['1', '99']);

    expect(result.found).toEqual([
      { id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null },
    ]);
    expect(result.notFound).toEqual(['99']);
    expect(result).toMatchObject({ total: 2, foundCount: 1, notFoundCount: 1 });
  });
});

describe('getHierarchy', () => {
  it('returns the full ancestor chain for a deep category', async () => {
    const result = await getHierarchy('content', '3');

    expect(result).toMatchObject({
      id: '3',
      name: 'Comedy Movies',
      path: 'Arts & Entertainment > Movies > Comedy Movies',
      parentId: '2',
      depth: 3,
    });
    expect(result?.hierarchy).toEqual([
      { id: '1', name: 'Arts & Entertainment', level: 2 },
      { id: '2', name: 'Movies', level: 1 },
      { id: '3', name: 'Comedy Movies', level: 0 },
    ]);
  });

  it('returns null for an unknown id', async () => {
    expect(await getHierarchy('content', '99')).toBeNull();
  });
});

describe('searchCategories', () => {
  it('matches case-insensitively against name and path', async () => {
    const results = await searchCategories('content', 'movie');

    expect(results.map((r) => r.id)).toEqual(['2', '3']);
  });
});

describe('validateIds', () => {
  it('splits ids into valid and invalid', async () => {
    const result = await validateIds('content', ['1', '2', '99']);

    expect(result).toEqual({ valid: ['1', '2'], invalid: ['99'], isValid: false, validCount: 2, invalidCount: 1 });
  });
});

describe('getChildren', () => {
  it('returns root categories when parentId is null', async () => {
    const children = await getChildren('content', null);

    expect(children).toEqual([
      { id: '1', name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null, hasChildren: true },
    ]);
  });

  it('returns children of a given parent', async () => {
    const children = await getChildren('content', '1');

    expect(children).toEqual([
      { id: '2', name: 'Movies', path: 'Arts & Entertainment > Movies', parentId: '1', hasChildren: true },
    ]);
  });

  it('returns an empty array for a leaf category', async () => {
    expect(await getChildren('content', '3')).toEqual([]);
  });
});

describe('getTaxonomyStats', () => {
  it('returns root count, max depth and metadata', async () => {
    expect(await getTaxonomyStats('content')).toEqual({
      version: '3.1',
      type: 'content',
      totalCategories: 3,
      rootCategories: 1,
      maxDepth: 3,
      lastUpdated: '2026-06-14T00:00:00.000Z',
    });
  });
});

describe('getTaxonomyTree', () => {
  it('builds a nested tree from root categories', async () => {
    const tree = await getTaxonomyTree('content');

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('1');
    expect(tree[0].children[0].id).toBe('2');
    expect(tree[0].children[0].children[0].id).toBe('3');
  });

  it('omits categories beyond maxDepth', async () => {
    const tree = await getTaxonomyTree('content', 2);

    expect(tree[0].children[0].children).toEqual([]);
  });
});
