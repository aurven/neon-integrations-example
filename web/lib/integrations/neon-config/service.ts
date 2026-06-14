import { promises as fs } from 'fs';
import path from 'path';
import { NeonClient } from '../../core/neon-bo-api-v3';

const CACHE_DIR = path.join(process.cwd(), 'data', 'neon-config');

export type ConfigType = 'usersGroups' | 'workflows' | 'contentTypes';

export interface ConfigMeta {
  label: string;
  cacheFile: string;
}

export const CONFIGS: Record<ConfigType, ConfigMeta> = {
  usersGroups: { label: 'Users & Groups', cacheFile: 'users-groups.json' },
  workflows: { label: 'Workflow Definitions', cacheFile: 'workflows.json' },
  contentTypes: { label: 'Content Types', cacheFile: 'content-types.json' },
};

export const DEFAULT_TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  'article/gallery': 'Gallery',
};

export interface UsersGroupsConfigData {
  lastUpdated: string;
  source: 'neon-bo';
  users: unknown[];
  groups: unknown[];
}

export interface WorkflowsConfigData {
  lastUpdated: string;
  source: 'neon-bo';
  workflows: unknown[];
}

export interface ContentTypeEntry {
  typeName: string;
  typeId: number;
  contentType: string | null;
  typeMeta: { label?: string } | null;
  composedTypeName: string;
}

export interface ContentTypesConfigData {
  lastUpdated: string;
  source: 'neon-bo';
  types: ContentTypeEntry[];
}

export type ConfigData = UsersGroupsConfigData | WorkflowsConfigData | ContentTypesConfigData;

interface ContentTypeNode {
  typeInfo?: {
    typeName: string;
    typeId: number;
    contentType?: string | null;
    typeMeta?: { label?: string } | null;
  };
  contentType?: string | null;
  composedTypeName?: string;
  hierarchicalSubTypes?: Record<string, ContentTypeNode>;
}

let typeLabels: Record<string, string> | null = null;

function extractArray(result: unknown, key: string): unknown[] {
  if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>)[key])) {
    return (result as Record<string, unknown>)[key] as unknown[];
  }
  return Array.isArray(result) ? result : [];
}

export async function saveToCache(type: ConfigType, data: ConfigData): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, CONFIGS[type].cacheFile);
  await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');
}

export async function loadFromCache(type: ConfigType): Promise<ConfigData | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, CONFIGS[type].cacheFile);
    const content = await fs.readFile(cacheFile, 'utf8');
    return JSON.parse(content) as ConfigData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to load cache for ${type}: ${(error as Error).message}`);
  }
}

export async function cacheExists(type: ConfigType): Promise<boolean> {
  try {
    await fs.access(path.join(CACHE_DIR, CONFIGS[type].cacheFile));
    return true;
  } catch {
    return false;
  }
}

export function flattenContentTypes(
  node: ContentTypeNode | null | undefined,
  list: ContentTypeEntry[] = []
): ContentTypeEntry[] {
  if (!node) return list;

  if (node.typeInfo) {
    list.push({
      typeName: node.typeInfo.typeName,
      typeId: node.typeInfo.typeId,
      contentType: node.typeInfo.contentType ?? node.contentType ?? null,
      typeMeta: node.typeInfo.typeMeta ?? null,
      composedTypeName: node.composedTypeName ?? node.typeInfo.typeName,
    });
  }

  if (node.hierarchicalSubTypes) {
    for (const sub of Object.values(node.hierarchicalSubTypes)) {
      flattenContentTypes(sub, list);
    }
  }

  return list;
}

export async function fetchFromNeon(type: 'usersGroups'): Promise<UsersGroupsConfigData>;
export async function fetchFromNeon(type: 'workflows'): Promise<WorkflowsConfigData>;
export async function fetchFromNeon(type: 'contentTypes'): Promise<ContentTypesConfigData>;
export async function fetchFromNeon(type: ConfigType): Promise<ConfigData> {
  const client = new NeonClient();

  if (type === 'usersGroups') {
    const [usersResult, groupsResult] = await Promise.all([client.getUsers(), client.getGroups()]);
    return {
      lastUpdated: new Date().toISOString(),
      source: 'neon-bo',
      users: extractArray(usersResult, 'users'),
      groups: extractArray(groupsResult, 'groups'),
    };
  }

  if (type === 'workflows') {
    const workflowsResult = await client.getWorkflowDefinitions();
    return {
      lastUpdated: new Date().toISOString(),
      source: 'neon-bo',
      workflows: extractArray(workflowsResult, 'workflows'),
    };
  }

  const typesResult = await client.getContentTypesConfig();
  return {
    lastUpdated: new Date().toISOString(),
    source: 'neon-bo',
    types: flattenContentTypes(typesResult as ContentTypeNode),
  };
}

export async function fetchAndCache(type: ConfigType): Promise<ConfigData> {
  const data = await (fetchFromNeon as (type: ConfigType) => Promise<ConfigData>)(type);
  await saveToCache(type, data);
  return data;
}

export async function getConfig(type: ConfigType, forceRefresh = false): Promise<ConfigData> {
  if (!forceRefresh) {
    const cached = await loadFromCache(type);
    if (cached) return cached;
  }
  return await fetchAndCache(type);
}

export interface InitResults {
  initialized: ConfigType[];
  cached: ConfigType[];
  errors: { type: ConfigType; error: string }[];
}

export async function initializeAll(): Promise<InitResults> {
  const results: InitResults = { initialized: [], cached: [], errors: [] };

  for (const type of Object.keys(CONFIGS) as ConfigType[]) {
    try {
      if (await cacheExists(type)) {
        results.cached.push(type);
      } else {
        await fetchAndCache(type);
        results.initialized.push(type);
      }
    } catch (error) {
      results.errors.push({ type, error: (error as Error).message });
    }
  }

  return results;
}

export interface RefreshResults {
  refreshed: ConfigType[];
  errors: { type: ConfigType; error: string }[];
}

export async function refreshAll(): Promise<RefreshResults> {
  const results: RefreshResults = { refreshed: [], errors: [] };

  for (const type of Object.keys(CONFIGS) as ConfigType[]) {
    try {
      await fetchAndCache(type);
      results.refreshed.push(type);
    } catch (error) {
      results.errors.push({ type, error: (error as Error).message });
    }
  }

  return results;
}

export async function refreshConfig(type: ConfigType): Promise<true> {
  await fetchAndCache(type);
  return true;
}

export async function loadContentTypesConfig(): Promise<Record<string, string>> {
  try {
    const config = (await getConfig('contentTypes')) as ContentTypesConfigData;
    const types = config.types || [];
    typeLabels = types.reduce<Record<string, string>>(
      (acc, t) => {
        if (t?.composedTypeName) acc[t.composedTypeName] = t.typeMeta?.label || t.typeName;
        return acc;
      },
      { ...DEFAULT_TYPE_LABELS }
    );
  } catch {
    // keep previous/default labels
  }
  return typeLabels || DEFAULT_TYPE_LABELS;
}

export function getTypeLabel(composedTypeName: string | null | undefined): string | null {
  if (!composedTypeName) return null;
  const labels = typeLabels || DEFAULT_TYPE_LABELS;
  return labels[composedTypeName] || composedTypeName;
}

export function getAvailableConfigs(): Record<ConfigType, ConfigMeta> {
  return (Object.entries(CONFIGS) as [ConfigType, ConfigMeta][]).reduce(
    (acc, [type, config]) => {
      acc[type] = { label: config.label, cacheFile: config.cacheFile };
      return acc;
    },
    {} as Record<ConfigType, ConfigMeta>
  );
}
