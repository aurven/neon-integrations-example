import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { promises as fs } from 'fs';
import { downloadTSV, parseTSV, getTaxonomy, getAvailableTaxonomies, TAXONOMIES } from '../service';

vi.mock('axios');
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

const mockFs = {
  mkdir: fs.mkdir as ReturnType<typeof vi.fn>,
  writeFile: fs.writeFile as ReturnType<typeof vi.fn>,
  readFile: fs.readFile as ReturnType<typeof vi.fn>,
  access: fs.access as ReturnType<typeof vi.fn>,
};

describe('downloadTSV', () => {
  beforeEach(() => {
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns the response body on success', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'tsv-content' });

    const result = await downloadTSV('https://example.com/x.tsv');

    expect(result).toBe('tsv-content');
    expect(axios.get).toHaveBeenCalledWith('https://example.com/x.tsv', { responseType: 'text', timeout: 30000 });
  });

  it('wraps axios errors with the source URL', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));

    await expect(downloadTSV('https://example.com/x.tsv')).rejects.toThrow(
      'Failed to download taxonomy from https://example.com/x.tsv: timeout'
    );
  });
});

describe('parseTSV', () => {
  it('throws on an empty TSV file', () => {
    expect(() => parseTSV('', 'content')).toThrow('Empty TSV file');
  });

  it('parses a descriptive-header TSV into categories and an index', () => {
    const tsv = [
      'IAB Content Taxonomy 3.1',
      'Unique ID\tParent\tName\tTier 1\tTier 2\tTier 3\tTier 4',
      '1\t\tArts & Entertainment\tArts & Entertainment\t\t\t',
      '2\t1\tMovies\tArts & Entertainment\tMovies\t\t',
      '\t\t\t\t\t\t',
    ].join('\n');

    const data = parseTSV(tsv, 'content');

    expect(data.version).toBe('3.1');
    expect(data.taxonomy).toBe('content');
    expect(data.totalCategories).toBe(2);
    expect(data.categories).toEqual([
      { id: '1', name: 'Arts & Entertainment', parentId: null, tiers: ['Arts & Entertainment'] },
      { id: '2', name: 'Movies', parentId: '1', tiers: ['Arts & Entertainment', 'Movies'] },
    ]);
    expect(data.index).toEqual({
      '1': { name: 'Arts & Entertainment', path: 'Arts & Entertainment', parentId: null },
      '2': { name: 'Movies', path: 'Arts & Entertainment > Movies', parentId: '1' },
    });
  });
});

describe('getTaxonomy', () => {
  beforeEach(() => {
    Object.values(mockFs).forEach((m) => m.mockReset());
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns cached data without downloading on a cache hit', async () => {
    const cached = {
      version: '3.1',
      taxonomy: 'content',
      lastUpdated: '2026-06-14T00:00:00.000Z',
      totalCategories: 0,
      categories: [],
      index: {},
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(cached));

    const data = await getTaxonomy('content');

    expect(data).toEqual(cached);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('downloads, parses and caches on a cache miss', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    mockFs.readFile.mockRejectedValue(enoent);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const tsv = [
      'IAB Content Taxonomy 3.1',
      'Unique ID\tName\tTier 1',
      '1\tArts & Entertainment\tArts & Entertainment',
    ].join('\n');
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: tsv });

    const data = await getTaxonomy('content');

    expect(data.totalCategories).toBe(1);
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe('getAvailableTaxonomies', () => {
  it('returns version and filename for each taxonomy type', () => {
    expect(getAvailableTaxonomies()).toEqual({
      content: { version: TAXONOMIES.content.version, filename: TAXONOMIES.content.filename },
      audience: { version: TAXONOMIES.audience.version, filename: TAXONOMIES.audience.filename },
      adproduct: { version: TAXONOMIES.adproduct.version, filename: TAXONOMIES.adproduct.filename },
    });
  });
});
