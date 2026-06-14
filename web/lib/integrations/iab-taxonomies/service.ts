import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'iab-taxonomies');

const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/InteractiveAdvertisingBureau/Taxonomies/main';

export type TaxonomyType = 'content' | 'audience' | 'adproduct';

export interface TaxonomyMeta {
  version: string;
  filename: string;
  url: string;
  cacheFile: string;
}

export const TAXONOMIES: Record<TaxonomyType, TaxonomyMeta> = {
  content: {
    version: '3.1',
    filename: 'Content Taxonomy 3.1.tsv',
    url: `${GITHUB_BASE_URL}/Content Taxonomies/Content Taxonomy 3.1.tsv`,
    cacheFile: 'content-taxonomy-v3.1.json',
  },
  audience: {
    version: '1.1',
    filename: 'Audience Taxonomy 1.1.tsv',
    url: `${GITHUB_BASE_URL}/Audience Taxonomies/Audience Taxonomy 1.1.tsv`,
    cacheFile: 'audience-taxonomy-v1.1.json',
  },
  adproduct: {
    version: '2.0',
    filename: 'Ad Product Taxonomy 2.0.tsv',
    url: `${GITHUB_BASE_URL}/Ad Product Taxonomies/Ad Product Taxonomy 2.0.tsv`,
    cacheFile: 'adproduct-taxonomy-v2.0.json',
  },
};

export interface TaxonomyCategory {
  id: string;
  name: string;
  parentId: string | null;
  tiers: string[];
  extension?: string;
}

export interface TaxonomyIndexEntry {
  name: string;
  path: string;
  parentId: string | null;
}

export interface TaxonomyData {
  version: string;
  taxonomy: TaxonomyType;
  lastUpdated: string;
  totalCategories: number;
  categories: TaxonomyCategory[];
  index: Record<string, TaxonomyIndexEntry>;
}

export async function downloadTSV(url: string): Promise<string> {
  try {
    const response = await axios.get(url, { responseType: 'text', timeout: 30000 });
    return response.data as string;
  } catch (error) {
    throw new Error(`Failed to download taxonomy from ${url}: ${(error as Error).message}`);
  }
}

function normalizeCategoryStructure(row: Record<string, string | null>, type: TaxonomyType): TaxonomyCategory {
  let name = row['Name'];
  if (!name) {
    for (const key in row) {
      if (key.startsWith('Condensed Name')) {
        name = row[key];
        break;
      }
    }
  }

  const category: TaxonomyCategory = {
    id: (row['Unique ID'] || row['UniqueID'] || '') as string,
    name: name || '',
    parentId: row['Parent'] || row['Parent ID'] || null,
    tiers: [],
  };

  if (category.parentId === '' || category.parentId === category.id) {
    category.parentId = null;
  }

  const maxTiers = type === 'audience' ? 6 : type === 'content' ? 4 : 3;
  for (let i = 1; i <= maxTiers; i++) {
    const tierValue = row[`Tier ${i}`];
    if (tierValue && tierValue.trim()) {
      category.tiers.push(tierValue.trim());
    }
  }

  if (row['Extension'] || row['Extension Notes']) {
    category.extension = (row['Extension'] || row['Extension Notes']) as string;
  }

  return category;
}

function buildPath(category: TaxonomyCategory): string {
  if (category.tiers && category.tiers.length > 0) {
    return category.tiers.join(' > ');
  }
  return category.name;
}

export function parseTSV(tsvContent: string, type: TaxonomyType): TaxonomyData {
  const lines = tsvContent.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    throw new Error('Empty TSV file');
  }

  let headerLineIndex = 0;
  let dataStartIndex = 1;

  const firstLine = lines[0];
  if (firstLine.includes('Relational ID System') || firstLine.includes('IAB') || firstLine.includes('Taxonomy')) {
    headerLineIndex = 1;
    dataStartIndex = 2;
  }

  const rawHeaders = lines[headerLineIndex].split('\t').map((h) => h.trim());
  const headers: string[] = [];
  const headerIndexMap: number[] = [];

  rawHeaders.forEach((header, idx) => {
    if (header) {
      headers.push(header);
      headerIndexMap.push(idx);
    }
  });

  const categories: TaxonomyCategory[] = [];
  const index: Record<string, TaxonomyIndexEntry> = {};

  for (let i = dataStartIndex; i < lines.length; i++) {
    const values = lines[i].split('\t');

    if (values.length === 0) continue;

    const row: Record<string, string | null> = {};
    headers.forEach((header, idx) => {
      const originalIdx = headerIndexMap[idx];
      row[header] = values[originalIdx] ? values[originalIdx].trim() : null;
    });

    const hasContent = Object.values(row).some((v) => v && v !== '');
    if (!hasContent) continue;

    const category = normalizeCategoryStructure(row, type);

    if (category.id) {
      categories.push(category);
      index[category.id] = {
        name: category.name,
        path: buildPath(category),
        parentId: category.parentId,
      };
    }
  }

  return {
    version: TAXONOMIES[type].version,
    taxonomy: type,
    lastUpdated: new Date().toISOString(),
    totalCategories: categories.length,
    categories,
    index,
  };
}

export async function saveToCache(type: TaxonomyType, data: TaxonomyData): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, TAXONOMIES[type].cacheFile);
  await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');
}

export async function loadFromCache(type: TaxonomyType): Promise<TaxonomyData | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, TAXONOMIES[type].cacheFile);
    const content = await fs.readFile(cacheFile, 'utf8');
    return JSON.parse(content) as TaxonomyData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to load cache for ${type}: ${(error as Error).message}`);
  }
}

export async function cacheExists(type: TaxonomyType): Promise<boolean> {
  try {
    await fs.access(path.join(CACHE_DIR, TAXONOMIES[type].cacheFile));
    return true;
  } catch {
    return false;
  }
}

export async function downloadAndCache(type: TaxonomyType): Promise<TaxonomyData> {
  const tsvContent = await downloadTSV(TAXONOMIES[type].url);
  const taxonomyData = parseTSV(tsvContent, type);
  await saveToCache(type, taxonomyData);
  return taxonomyData;
}

export async function getTaxonomy(type: TaxonomyType, forceRefresh = false): Promise<TaxonomyData> {
  if (!forceRefresh) {
    const cached = await loadFromCache(type);
    if (cached) return cached;
  }
  return await downloadAndCache(type);
}

export interface InitResults {
  initialized: TaxonomyType[];
  cached: TaxonomyType[];
  errors: { type: TaxonomyType; error: string }[];
}

export async function initializeAll(): Promise<InitResults> {
  const results: InitResults = { initialized: [], cached: [], errors: [] };

  for (const type of Object.keys(TAXONOMIES) as TaxonomyType[]) {
    try {
      if (await cacheExists(type)) {
        results.cached.push(type);
      } else {
        await downloadAndCache(type);
        results.initialized.push(type);
      }
    } catch (error) {
      results.errors.push({ type, error: (error as Error).message });
    }
  }

  return results;
}

export interface RefreshResults {
  refreshed: TaxonomyType[];
  errors: { type: TaxonomyType; error: string }[];
}

export async function refreshAll(): Promise<RefreshResults> {
  const results: RefreshResults = { refreshed: [], errors: [] };

  for (const type of Object.keys(TAXONOMIES) as TaxonomyType[]) {
    try {
      await downloadAndCache(type);
      results.refreshed.push(type);
    } catch (error) {
      results.errors.push({ type, error: (error as Error).message });
    }
  }

  return results;
}

export interface TaxonomyAvailableMeta {
  version: string;
  filename: string;
}

export function getAvailableTaxonomies(): Record<TaxonomyType, TaxonomyAvailableMeta> {
  return (Object.entries(TAXONOMIES) as [TaxonomyType, TaxonomyMeta][]).reduce(
    (acc, [type, config]) => {
      acc[type] = { version: config.version, filename: config.filename };
      return acc;
    },
    {} as Record<TaxonomyType, TaxonomyAvailableMeta>
  );
}
