import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import {
  fetchFromNeon,
  flattenContentTypes,
  getTypeLabel,
  loadContentTypesConfig,
  getConfig,
  refreshConfig,
  getAvailableConfigs,
  CONFIGS,
  DEFAULT_TYPE_LABELS,
} from '../service';
import { NeonClient } from '../../../core/neon-bo-api-v3';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

vi.mock('../../../core/neon-bo-api-v3', () => ({
  NeonClient: vi.fn(),
}));

const mockFs = {
  mkdir: fs.mkdir as ReturnType<typeof vi.fn>,
  writeFile: fs.writeFile as ReturnType<typeof vi.fn>,
  readFile: fs.readFile as ReturnType<typeof vi.fn>,
  access: fs.access as ReturnType<typeof vi.fn>,
};

const mockNeonClient = NeonClient as unknown as ReturnType<typeof vi.fn>;

describe('fetchFromNeon', () => {
  beforeEach(() => {
    Object.values(mockFs).forEach((m) => m.mockReset());
    mockNeonClient.mockReset();
  });

  it('fetches users and groups for usersGroups', async () => {
    mockNeonClient.mockImplementation(function () {
      return {
        getUsers: vi.fn().mockResolvedValue({ users: [{ id: 'u1' }] }),
        getGroups: vi.fn().mockResolvedValue({ groups: [{ name: 'editors' }] }),
      };
    });

    const data = await fetchFromNeon('usersGroups');

    expect(data).toMatchObject({
      source: 'neon-bo',
      users: [{ id: 'u1' }],
      groups: [{ name: 'editors' }],
    });
    expect(data.lastUpdated).toBeTruthy();
  });

  it('falls back to empty arrays when usersGroups results are not arrays/objects', async () => {
    mockNeonClient.mockImplementation(function () {
      return {
        getUsers: vi.fn().mockResolvedValue(null),
        getGroups: vi.fn().mockResolvedValue(undefined),
      };
    });

    const data = await fetchFromNeon('usersGroups');

    expect(data).toMatchObject({ users: [], groups: [] });
  });

  it('fetches workflows for workflows type', async () => {
    mockNeonClient.mockImplementation(function () {
      return {
        getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [{ name: 'Story/Edit' }] }),
      };
    });

    const data = await fetchFromNeon('workflows');

    expect(data).toMatchObject({ source: 'neon-bo', workflows: [{ name: 'Story/Edit' }] });
  });

  it('fetches and flattens content types for contentTypes type', async () => {
    mockNeonClient.mockImplementation(function () {
      return {
        getContentTypesConfig: vi.fn().mockResolvedValue({
          typeInfo: { typeId: 4096, typeName: 'content', typeMeta: { label: 'Content' } },
          hierarchicalSubTypes: {
            4098: {
              typeInfo: { typeId: 4098, typeName: 'article', contentType: 'story', typeMeta: { label: 'Article' } },
              composedTypeName: 'article',
              contentType: 'story',
            },
          },
        }),
      };
    });

    const data = await fetchFromNeon('contentTypes');

    expect(data.types).toEqual([
      { typeName: 'content', typeId: 4096, contentType: null, typeMeta: { label: 'Content' }, composedTypeName: 'content' },
      { typeName: 'article', typeId: 4098, contentType: 'story', typeMeta: { label: 'Article' }, composedTypeName: 'article' },
    ]);
  });
});

describe('flattenContentTypes', () => {
  it('returns an empty list for a nullish node', () => {
    expect(flattenContentTypes(null)).toEqual([]);
  });

  it('recursively flattens nested hierarchicalSubTypes', () => {
    const tree = {
      typeInfo: { typeId: 1, typeName: 'content', typeMeta: { label: 'Content' } },
      hierarchicalSubTypes: {
        a: {
          typeInfo: { typeId: 2, typeName: 'article', contentType: 'story', typeMeta: { label: 'Article' } },
          composedTypeName: 'article',
          hierarchicalSubTypes: {
            b: {
              typeInfo: { typeId: 3, typeName: 'gallery', contentType: 'gallery', typeMeta: { label: 'Gallery' } },
              composedTypeName: 'article/gallery',
            },
          },
        },
      },
    };

    const list = flattenContentTypes(tree);

    expect(list.map((t) => t.composedTypeName)).toEqual(['content', 'article', 'article/gallery']);
  });
});

describe('getTypeLabel', () => {
  beforeEach(() => {
    Object.values(mockFs).forEach((m) => m.mockReset());
    mockNeonClient.mockReset();
  });

  it('returns null for a nullish composedTypeName', () => {
    expect(getTypeLabel(null)).toBeNull();
  });

  it('falls back to DEFAULT_TYPE_LABELS before loadContentTypesConfig has run', () => {
    expect(getTypeLabel('article')).toBe(DEFAULT_TYPE_LABELS.article);
  });

  it('uses the cached contentTypes label after loadContentTypesConfig runs', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      lastUpdated: '2026-06-14T00:00:00.000Z',
      source: 'neon-bo',
      types: [{ typeName: 'video', typeId: 5, contentType: 'video', typeMeta: { label: 'Video Story' }, composedTypeName: 'video' }],
    }));

    await loadContentTypesConfig();

    expect(getTypeLabel('video')).toBe('Video Story');
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    Object.values(mockFs).forEach((m) => m.mockReset());
    mockNeonClient.mockReset();
  });

  it('returns cached data without calling Neon BO on a cache hit', async () => {
    const cached = { lastUpdated: '2026-06-14T00:00:00.000Z', source: 'neon-bo', workflows: [{ name: 'Story/Edit' }] };
    mockFs.readFile.mockResolvedValue(JSON.stringify(cached));

    const data = await getConfig('workflows');

    expect(data).toEqual(cached);
    expect(mockNeonClient).not.toHaveBeenCalled();
  });

  it('fetches from Neon BO and caches on a cache miss', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    mockFs.readFile.mockRejectedValue(enoent);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockNeonClient.mockImplementation(function () {
      return {
        getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [{ name: 'Story/Edit' }] }),
      };
    });

    const data = await getConfig('workflows');

    expect(data).toMatchObject({ source: 'neon-bo', workflows: [{ name: 'Story/Edit' }] });
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe('refreshConfig', () => {
  beforeEach(() => {
    Object.values(mockFs).forEach((m) => m.mockReset());
    mockNeonClient.mockReset();
  });

  it('fetches from Neon BO and writes to cache regardless of cache state', async () => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockNeonClient.mockImplementation(function () {
      return {
        getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [] }),
      };
    });

    const result = await refreshConfig('workflows');

    expect(result).toBe(true);
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe('getAvailableConfigs', () => {
  it('returns label and cacheFile for each config type', () => {
    expect(getAvailableConfigs()).toEqual({
      usersGroups: CONFIGS.usersGroups,
      workflows: CONFIGS.workflows,
      contentTypes: CONFIGS.contentTypes,
    });
  });
});
