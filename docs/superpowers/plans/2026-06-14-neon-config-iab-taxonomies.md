# Neon Config + IAB Taxonomies Connectors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src/connectors/neon-config-connector.js`, `src/connectors/iab-taxonomies-connector.js`, `src/helpers/iab-taxonomies-helper.js`, `src/requestHandlers/neon-config.js`, and `src/requestHandlers/iab-taxonomies.js` into the Next.js `web/` app as `lib/integrations/neon-config`, `lib/integrations/iab-taxonomies`, and their route handlers under `app/api/neon/config/` and `app/api/iab/`.

**Architecture:** Vertical-slice port following Phase 2's pattern: `lib/integrations/<name>/service.ts` (framework-agnostic business logic, ported 1:1 from the old connector/helper) → `app/api/.../route.ts` (thin Next.js route adapters, `runtime = 'nodejs'`). Auth is handled by the existing `web/proxy.ts` apikey gate on `/api/:path*` — no per-route auth code.

**Tech Stack:** Next.js 16 App Router, TypeScript strict mode, `fs/promises` for JSON file caching, `axios` for TSV downloads, Vitest for tests.

---

## Task 1: `lib/integrations/neon-config/service.ts`

**Files:**
- Create: `web/lib/integrations/neon-config/service.ts`
- Test: `web/lib/integrations/neon-config/__tests__/service.test.ts`

Direct port of `src/connectors/neon-config-connector.js`. Cache dir `web/data/neon-config/*.json`. Drops `console.log`/`console.warn`/`console.error` calls (no functional behavior) and the redundant `if (!CONFIGS[type])` runtime guards (covered by the `ConfigType` union type).

- [ ] **Step 1: Write the failing test file**

Create `web/lib/integrations/neon-config/__tests__/service.test.ts`:

```typescript
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
    mockNeonClient.mockImplementation(() => ({
      getUsers: vi.fn().mockResolvedValue({ users: [{ id: 'u1' }] }),
      getGroups: vi.fn().mockResolvedValue({ groups: [{ name: 'editors' }] }),
    }));

    const data = await fetchFromNeon('usersGroups');

    expect(data).toMatchObject({
      source: 'neon-bo',
      users: [{ id: 'u1' }],
      groups: [{ name: 'editors' }],
    });
    expect(data.lastUpdated).toBeTruthy();
  });

  it('falls back to empty arrays when usersGroups results are not arrays/objects', async () => {
    mockNeonClient.mockImplementation(() => ({
      getUsers: vi.fn().mockResolvedValue(null),
      getGroups: vi.fn().mockResolvedValue(undefined),
    }));

    const data = await fetchFromNeon('usersGroups');

    expect(data).toMatchObject({ users: [], groups: [] });
  });

  it('fetches workflows for workflows type', async () => {
    mockNeonClient.mockImplementation(() => ({
      getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [{ name: 'Story/Edit' }] }),
    }));

    const data = await fetchFromNeon('workflows');

    expect(data).toMatchObject({ source: 'neon-bo', workflows: [{ name: 'Story/Edit' }] });
  });

  it('fetches and flattens content types for contentTypes type', async () => {
    mockNeonClient.mockImplementation(() => ({
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
    }));

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
    mockNeonClient.mockImplementation(() => ({
      getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [{ name: 'Story/Edit' }] }),
    }));

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
    mockNeonClient.mockImplementation(() => ({
      getWorkflowDefinitions: vi.fn().mockResolvedValue({ workflows: [] }),
    }));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/integrations/neon-config/__tests__/service.test.ts`
Expected: FAIL — `Cannot find module '../service'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `web/lib/integrations/neon-config/service.ts`:

```typescript
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
  const data = await fetchFromNeon(type);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/integrations/neon-config/__tests__/service.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/integrations/neon-config/service.ts web/lib/integrations/neon-config/__tests__/service.test.ts
git commit -m "feat: port neon-config connector to lib/integrations/neon-config/service"
```

---

## Task 2: `app/api/neon/config/` routes

**Files:**
- Create: `web/app/api/neon/config/route.ts`
- Create: `web/app/api/neon/config/[type]/route.ts`
- Create: `web/app/api/neon/config/refresh/route.ts`
- Create: `web/app/api/neon/config/refresh/[type]/route.ts`
- Test: `web/app/api/neon/config/__tests__/route.test.ts`

Ported from `src/requestHandlers/neon-config.js`. `VALID_TYPES`/`buildStats` live in `route.ts` (not the service) since they're route-shaping concerns. Auth is handled by `web/proxy.ts`.

- [ ] **Step 1: Write the failing test file**

Create `web/app/api/neon/config/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../../../../proxy';
import { GET } from '../route';
import { GET as getConfigDataRoute } from '../[type]/route';
import { POST as refreshAllRoute } from '../refresh/route';
import { POST as refreshSingleRoute } from '../refresh/[type]/route';
import {
  getAvailableConfigs,
  loadFromCache,
  getConfig,
  refreshAll,
  refreshConfig,
} from '../../../../../lib/integrations/neon-config/service';

vi.mock('../../../../../lib/integrations/neon-config/service', () => ({
  getAvailableConfigs: vi.fn(),
  loadFromCache: vi.fn(),
  getConfig: vi.fn(),
  refreshAll: vi.fn(),
  refreshConfig: vi.fn(),
}));

const mocks = {
  getAvailableConfigs: getAvailableConfigs as unknown as ReturnType<typeof vi.fn>,
  loadFromCache: loadFromCache as unknown as ReturnType<typeof vi.fn>,
  getConfig: getConfig as unknown as ReturnType<typeof vi.fn>,
  refreshAll: refreshAll as unknown as ReturnType<typeof vi.fn>,
  refreshConfig: refreshConfig as unknown as ReturnType<typeof vi.fn>,
};

function paramsOf(type: string) {
  return { params: Promise.resolve({ type }) };
}

describe('GET /api/neon/config', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns cached/uncached status and stats for each config type', async () => {
    mocks.getAvailableConfigs.mockReturnValue({
      usersGroups: { label: 'Users & Groups', cacheFile: 'users-groups.json' },
      workflows: { label: 'Workflow Definitions', cacheFile: 'workflows.json' },
      contentTypes: { label: 'Content Types', cacheFile: 'content-types.json' },
    });
    mocks.loadFromCache.mockImplementation((type: string) => {
      if (type === 'workflows') {
        return Promise.resolve({ lastUpdated: '2026-06-14T00:00:00.000Z', source: 'neon-bo', workflows: [{ name: 'Story/Edit' }] });
      }
      return Promise.resolve(null);
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.configs.workflows).toEqual({
      label: 'Workflow Definitions',
      cacheFile: 'workflows.json',
      cached: true,
      lastUpdated: '2026-06-14T00:00:00.000Z',
      stats: { workflowCount: 1 },
    });
    expect(body.configs.usersGroups).toMatchObject({ cached: false, lastUpdated: null, stats: null });
  });
});

describe('GET /api/neon/config/[type]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 for an invalid type', async () => {
    const response = await getConfigDataRoute(new NextRequest('https://example.com/api/neon/config/bogus'), paramsOf('bogus'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid config type 'bogus'. Valid types: usersGroups, workflows, contentTypes",
    });
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it('returns config data for a valid type', async () => {
    mocks.getConfig.mockResolvedValue({ lastUpdated: '2026-06-14T00:00:00.000Z', source: 'neon-bo', workflows: [] });

    const response = await getConfigDataRoute(new NextRequest('https://example.com/api/neon/config/workflows'), paramsOf('workflows'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      type: 'workflows',
      lastUpdated: '2026-06-14T00:00:00.000Z',
      source: 'neon-bo',
      data: { lastUpdated: '2026-06-14T00:00:00.000Z', source: 'neon-bo', workflows: [] },
    });
  });
});

describe('POST /api/neon/config/refresh', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('refreshes all config types', async () => {
    mocks.refreshAll.mockResolvedValue({ refreshed: ['usersGroups', 'workflows', 'contentTypes'], errors: [] });

    const response = await refreshAllRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Neon config refresh completed',
      refreshed: ['usersGroups', 'workflows', 'contentTypes'],
      errors: [],
    });
  });
});

describe('POST /api/neon/config/refresh/[type]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 for an invalid type', async () => {
    const response = await refreshSingleRoute(
      new NextRequest('https://example.com/api/neon/config/refresh/bogus', { method: 'POST' }),
      paramsOf('bogus')
    );

    expect(response.status).toBe(400);
    expect(mocks.refreshConfig).not.toHaveBeenCalled();
  });

  it('refreshes a single config type', async () => {
    mocks.refreshConfig.mockResolvedValue(true);

    const response = await refreshSingleRoute(
      new NextRequest('https://example.com/api/neon/config/refresh/workflows', { method: 'POST' }),
      paramsOf('workflows')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, type: 'workflows', refreshed: true });
    expect(mocks.refreshConfig).toHaveBeenCalledWith('workflows');
  });
});

describe('proxy + /api/neon/config', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('blocks /api/neon/config without an apikey', async () => {
    const request = new NextRequest('https://example.com/api/neon/config');
    const response = proxy(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows /api/neon/config through with a valid apikey header', () => {
    const request = new NextRequest('https://example.com/api/neon/config', {
      headers: { apikey: 'admin-key' },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run app/api/neon/config/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'` (route files don't exist yet)

- [ ] **Step 3: Write the implementation**

Create `web/app/api/neon/config/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getAvailableConfigs, loadFromCache, ConfigType, ConfigData, ConfigMeta } from '../../../../lib/integrations/neon-config/service';

function buildStats(type: ConfigType, data: ConfigData): Record<string, number> {
  if (type === 'usersGroups') {
    const d = data as { users?: unknown[]; groups?: unknown[] };
    return {
      userCount: Array.isArray(d.users) ? d.users.length : 0,
      groupCount: Array.isArray(d.groups) ? d.groups.length : 0,
    };
  }
  if (type === 'workflows') {
    const d = data as { workflows?: unknown[] };
    return { workflowCount: Array.isArray(d.workflows) ? d.workflows.length : 0 };
  }
  const d = data as { types?: unknown[] };
  return { typeCount: Array.isArray(d.types) ? d.types.length : 0 };
}

export const runtime = 'nodejs';

export async function GET() {
  try {
    const available = getAvailableConfigs();
    const configs: Record<string, unknown> = {};

    for (const [type, meta] of Object.entries(available) as [ConfigType, ConfigMeta][]) {
      try {
        const cached = await loadFromCache(type);
        configs[type] = {
          ...meta,
          cached: !!cached,
          lastUpdated: cached?.lastUpdated || null,
          stats: cached ? buildStats(type, cached) : null,
        };
      } catch {
        configs[type] = { ...meta, cached: false, lastUpdated: null, stats: null };
      }
    }

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/neon/config/[type]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getConfig, ConfigType } from '../../../../../lib/integrations/neon-config/service';

const VALID_TYPES: ConfigType[] = ['usersGroups', 'workflows', 'contentTypes'];

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as ConfigType)) {
    return NextResponse.json(
      { success: false, error: `Invalid config type '${type}'. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const data = await getConfig(type as ConfigType);
    return NextResponse.json({ success: true, type, lastUpdated: data.lastUpdated, source: data.source, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/neon/config/refresh/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { refreshAll } from '../../../../../lib/integrations/neon-config/service';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const results = await refreshAll();
    return NextResponse.json({
      success: true,
      message: 'Neon config refresh completed',
      refreshed: results.refreshed,
      errors: results.errors,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/neon/config/refresh/[type]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { refreshConfig, ConfigType } from '../../../../../../lib/integrations/neon-config/service';

const VALID_TYPES: ConfigType[] = ['usersGroups', 'workflows', 'contentTypes'];

export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as ConfigType)) {
    return NextResponse.json(
      { success: false, error: `Invalid config type '${type}'. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    await refreshConfig(type as ConfigType);
    return NextResponse.json({ success: true, type, refreshed: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run app/api/neon/config/__tests__/route.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add web/app/api/neon/config
git commit -m "feat: add /api/neon/config routes"
```

---

## Task 3: `lib/integrations/iab-taxonomies/service.ts`

**Files:**
- Create: `web/lib/integrations/iab-taxonomies/service.ts`
- Test: `web/lib/integrations/iab-taxonomies/__tests__/service.test.ts`

Direct port of `src/connectors/iab-taxonomies-connector.js`. Cache dir `web/data/iab-taxonomies/*.json`. Drops `console.*` calls and the redundant `if (!TAXONOMIES[type])` runtime guard (covered by `TaxonomyType` union). `buildPath` drops its unused `type` parameter.

- [ ] **Step 1: Write the failing test file**

Create `web/lib/integrations/iab-taxonomies/__tests__/service.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/integrations/iab-taxonomies/__tests__/service.test.ts`
Expected: FAIL — `Cannot find module '../service'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `web/lib/integrations/iab-taxonomies/service.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/integrations/iab-taxonomies/__tests__/service.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/integrations/iab-taxonomies/service.ts web/lib/integrations/iab-taxonomies/__tests__/service.test.ts
git commit -m "feat: port iab-taxonomies connector to lib/integrations/iab-taxonomies/service"
```

---

## Task 4: `lib/integrations/iab-taxonomies/helper.ts`

**Files:**
- Create: `web/lib/integrations/iab-taxonomies/helper.ts`
- Test: `web/lib/integrations/iab-taxonomies/__tests__/helper.test.ts`

Direct port of `src/helpers/iab-taxonomies-helper.js`. All functions wrap their logic in try/catch and rethrow as `Failed to <action> for ${type}/...: ${error.message}`, preserved as-is for API-contract fidelity.

- [ ] **Step 1: Write the failing test file**

Create `web/lib/integrations/iab-taxonomies/__tests__/helper.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/integrations/iab-taxonomies/__tests__/helper.test.ts`
Expected: FAIL — `Cannot find module '../helper'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `web/lib/integrations/iab-taxonomies/helper.ts`:

```typescript
import { getTaxonomy, TaxonomyType } from './service';

export interface LabelResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

export interface GetLabelsResult {
  found: LabelResult[];
  notFound: string[];
  total: number;
  foundCount: number;
  notFoundCount: number;
}

export interface HierarchyEntry {
  id: string;
  name: string;
  level: number;
}

export interface HierarchyResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  tiers: string[];
  extension?: string;
  hierarchy: HierarchyEntry[];
  depth: number;
}

export interface SearchResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  tiers: string[];
}

export interface ValidateIdsResult {
  valid: string[];
  invalid: string[];
  isValid: boolean;
  validCount: number;
  invalidCount: number;
}

export interface ChildCategory {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  hasChildren: boolean;
}

export interface TaxonomyStats {
  version: string;
  type: TaxonomyType;
  totalCategories: number;
  rootCategories: number;
  maxDepth: number;
  lastUpdated: string;
}

export interface TaxonomyTreeNode {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  depth: number;
  children: TaxonomyTreeNode[];
}

export async function getLabel(type: TaxonomyType, id: string | number): Promise<LabelResult | null> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const categoryInfo = taxonomy.index[idStr];

    if (!categoryInfo) return null;

    return { id: idStr, name: categoryInfo.name, path: categoryInfo.path, parentId: categoryInfo.parentId };
  } catch (error) {
    throw new Error(`Failed to get label for ${type}/${id}: ${(error as Error).message}`);
  }
}

export async function getLabels(type: TaxonomyType, ids: (string | number)[]): Promise<GetLabelsResult> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const found: LabelResult[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      const idStr = String(id);
      const categoryInfo = taxonomy.index[idStr];

      if (categoryInfo) {
        found.push({ id: idStr, name: categoryInfo.name, path: categoryInfo.path, parentId: categoryInfo.parentId });
      } else {
        notFound.push(idStr);
      }
    }

    return { found, notFound, total: ids.length, foundCount: found.length, notFoundCount: notFound.length };
  } catch (error) {
    throw new Error(`Failed to get labels for ${type}: ${(error as Error).message}`);
  }
}

export async function getHierarchy(type: TaxonomyType, id: string | number): Promise<HierarchyResult | null> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const category = taxonomy.categories.find((cat) => String(cat.id) === idStr);

    if (!category) return null;

    const hierarchy: HierarchyEntry[] = [];
    let currentId: string | null = category.id;
    let maxDepth = 10;

    while (currentId && maxDepth > 0) {
      const current = taxonomy.categories.find((cat) => String(cat.id) === String(currentId));
      if (!current) break;

      hierarchy.unshift({ id: current.id, name: current.name, level: hierarchy.length });

      currentId = current.parentId;
      maxDepth--;
    }

    return {
      id: category.id,
      name: category.name,
      path: taxonomy.index[idStr].path,
      parentId: category.parentId,
      tiers: category.tiers,
      extension: category.extension,
      hierarchy,
      depth: hierarchy.length,
    };
  } catch (error) {
    throw new Error(`Failed to get hierarchy for ${type}/${id}: ${(error as Error).message}`);
  }
}

export async function searchCategories(
  type: TaxonomyType,
  query: string,
  options: { caseSensitive?: boolean; limit?: number } = {}
): Promise<SearchResult[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const { caseSensitive = false, limit = 50 } = options;
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const results: SearchResult[] = [];

    for (const category of taxonomy.categories) {
      const categoryName = caseSensitive ? category.name : category.name.toLowerCase();
      const categoryPath = taxonomy.index[category.id].path;
      const categoryPathLower = caseSensitive ? categoryPath : categoryPath.toLowerCase();

      if (categoryName.includes(searchQuery) || categoryPathLower.includes(searchQuery)) {
        results.push({
          id: category.id,
          name: category.name,
          path: categoryPath,
          parentId: category.parentId,
          tiers: category.tiers,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to search ${type} taxonomy: ${(error as Error).message}`);
  }
}

export async function validateIds(type: TaxonomyType, ids: (string | number)[]): Promise<ValidateIdsResult> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const id of ids) {
      const idStr = String(id);
      if (taxonomy.index[idStr]) {
        valid.push(idStr);
      } else {
        invalid.push(idStr);
      }
    }

    return { valid, invalid, isValid: invalid.length === 0, validCount: valid.length, invalidCount: invalid.length };
  } catch (error) {
    throw new Error(`Failed to validate IDs for ${type}: ${(error as Error).message}`);
  }
}

export async function getChildren(
  type: TaxonomyType,
  parentId: string | number | null = null
): Promise<ChildCategory[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const parentIdStr = parentId ? String(parentId) : null;

    const children = taxonomy.categories.filter((cat) => {
      if (parentIdStr === null) {
        return cat.parentId === null || cat.parentId === '';
      }
      return String(cat.parentId) === parentIdStr;
    });

    return children.map((cat) => ({
      id: cat.id,
      name: cat.name,
      path: taxonomy.index[cat.id].path,
      parentId: cat.parentId,
      hasChildren: taxonomy.categories.some((c) => String(c.parentId) === String(cat.id)),
    }));
  } catch (error) {
    throw new Error(`Failed to get children for ${type}/${parentId}: ${(error as Error).message}`);
  }
}

export async function getTaxonomyStats(type: TaxonomyType): Promise<TaxonomyStats> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const rootCount = taxonomy.categories.filter((cat) => !cat.parentId || cat.parentId === '').length;

    let maxDepth = 0;
    for (const cat of taxonomy.categories) {
      if (cat.tiers && cat.tiers.length > maxDepth) {
        maxDepth = cat.tiers.length;
      }
    }

    return {
      version: taxonomy.version,
      type: taxonomy.taxonomy,
      totalCategories: taxonomy.totalCategories,
      rootCategories: rootCount,
      maxDepth,
      lastUpdated: taxonomy.lastUpdated,
    };
  } catch (error) {
    throw new Error(`Failed to get stats for ${type}: ${(error as Error).message}`);
  }
}

export async function getTaxonomyTree(type: TaxonomyType, maxDepth: number | null = null): Promise<TaxonomyTreeNode[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const categoryMap = new Map<string, TaxonomyTreeNode>();
    taxonomy.categories.forEach((cat) => {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        path: taxonomy.index[cat.id].path,
        parentId: cat.parentId,
        depth: cat.tiers ? cat.tiers.length : 0,
        children: [],
      });
    });

    const rootNodes: TaxonomyTreeNode[] = [];

    categoryMap.forEach((node) => {
      if (maxDepth !== null && node.depth > maxDepth) return;

      if (!node.parentId || node.parentId === '') {
        rootNodes.push(node);
      } else {
        const parent = categoryMap.get(node.parentId);
        if (parent) parent.children.push(node);
      }
    });

    return rootNodes;
  } catch (error) {
    throw new Error(`Failed to get tree for ${type}: ${(error as Error).message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/integrations/iab-taxonomies/__tests__/helper.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/integrations/iab-taxonomies/helper.ts web/lib/integrations/iab-taxonomies/__tests__/helper.test.ts
git commit -m "feat: port iab-taxonomies-helper to lib/integrations/iab-taxonomies/helper"
```

---

## Task 5: `app/api/iab/` routes

**Files:**
- Create: `web/app/api/iab/taxonomies/route.ts`
- Create: `web/app/api/iab/[type]/route.ts`
- Create: `web/app/api/iab/lookup/route.ts`
- Create: `web/app/api/iab/search/route.ts`
- Create: `web/app/api/iab/validate/route.ts`
- Create: `web/app/api/iab/refresh/route.ts`
- Create: `web/app/api/iab/[type]/children/route.ts`
- Create: `web/app/api/iab/[type]/stats/route.ts`
- Test: `web/app/api/iab/__tests__/route.test.ts`

Ported from `src/requestHandlers/iab-taxonomies.js`. `VALID_TYPES` is redefined per route file (matches the original handler-by-handler duplication), using the `TaxonomyType` union. `taxonomies/`, `lookup/`, `search/`, `validate/`, `refresh/` are static segments that coexist as siblings of the dynamic `[type]/` folder — Next matches static routes before dynamic ones. Auth is handled by `web/proxy.ts`.

- [ ] **Step 1: Write the failing test file**

Create `web/app/api/iab/__tests__/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run app/api/iab/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../taxonomies/route'` (route files don't exist yet)

- [ ] **Step 3: Write the implementation**

Create `web/app/api/iab/taxonomies/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import {
  getAvailableTaxonomies,
  TaxonomyType,
  TaxonomyAvailableMeta,
} from '../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyStats } from '../../../../lib/integrations/iab-taxonomies/helper';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const taxonomies = getAvailableTaxonomies();
    const taxonomiesWithStats: Record<string, unknown> = {};

    for (const [type, config] of Object.entries(taxonomies) as [TaxonomyType, TaxonomyAvailableMeta][]) {
      try {
        const stats = await getTaxonomyStats(type);
        taxonomiesWithStats[type] = {
          ...config,
          stats: {
            totalCategories: stats.totalCategories,
            rootCategories: stats.rootCategories,
            maxDepth: stats.maxDepth,
            lastUpdated: stats.lastUpdated,
          },
        };
      } catch {
        taxonomiesWithStats[type] = { ...config, cached: false };
      }
    }

    return NextResponse.json({ success: true, taxonomies: taxonomiesWithStats });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/[type]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTaxonomy, TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyTree, getTaxonomyStats } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'flat';
  const maxDepth = searchParams.get('maxDepth');

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    if (format === 'tree') {
      const tree = await getTaxonomyTree(type as TaxonomyType, maxDepth ? parseInt(maxDepth, 10) : null);
      const stats = await getTaxonomyStats(type as TaxonomyType);

      return NextResponse.json({ success: true, type, version: stats.version, format: 'tree', data: tree, stats });
    }

    const taxonomy = await getTaxonomy(type as TaxonomyType);

    return NextResponse.json({
      success: true,
      type,
      version: taxonomy.version,
      format: 'flat',
      data: taxonomy.categories,
      index: taxonomy.index,
      totalCategories: taxonomy.totalCategories,
      lastUpdated: taxonomy.lastUpdated,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/lookup/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { getLabels, getHierarchy, HierarchyResult } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { type?: string; ids?: unknown; hierarchy?: boolean };
  const { type, ids, hierarchy = false } = body;

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required field: type' }, { status: 400 });
  }

  if (!ids) {
    return NextResponse.json({ success: false, error: 'Missing required field: ids' }, { status: 400 });
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const idArray = Array.isArray(ids) ? ids : [ids];

  if (idArray.length === 0) {
    return NextResponse.json({ success: false, error: 'IDs array cannot be empty' }, { status: 400 });
  }

  try {
    if (hierarchy) {
      const results: HierarchyResult[] = [];

      for (const id of idArray) {
        const hierarchyData = await getHierarchy(type as TaxonomyType, id);
        if (hierarchyData) results.push(hierarchyData);
      }

      return NextResponse.json({
        success: true,
        type,
        hierarchy: true,
        results,
        totalRequested: idArray.length,
        totalFound: results.length,
      });
    }

    const result = await getLabels(type as TaxonomyType, idArray);

    return NextResponse.json({ success: true, type, hierarchy: false, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { searchCategories } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const q = searchParams.get('q');
  const limit = searchParams.get('limit') || '50';
  const caseSensitive = searchParams.get('caseSensitive') || 'false';

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required parameter: type' }, { status: 400 });
  }

  if (!q) {
    return NextResponse.json({ success: false, error: 'Missing required parameter: q (query)' }, { status: 400 });
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const results = await searchCategories(type as TaxonomyType, q, {
      caseSensitive: caseSensitive === 'true',
      limit: parseInt(limit, 10),
    });

    return NextResponse.json({ success: true, type, query: q, results, count: results.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/validate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { validateIds } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { type?: string; ids?: unknown };
  const { type, ids } = body;

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required field: type' }, { status: 400 });
  }

  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid field: ids (must be an array)' },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const validation = await validateIds(type as TaxonomyType, ids);
    return NextResponse.json({ success: true, type, ...validation });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/refresh/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { refreshAll } from '../../../../lib/integrations/iab-taxonomies/service';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const results = await refreshAll();
    return NextResponse.json({ success: true, message: 'Taxonomies refresh completed', ...results });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/[type]/children/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../../lib/integrations/iab-taxonomies/service';
import { getChildren } from '../../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId');

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const children = await getChildren(type as TaxonomyType, parentId || null);
    return NextResponse.json({ success: true, type, parentId: parentId || null, children, count: children.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

Create `web/app/api/iab/[type]/stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyStats } from '../../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const stats = await getTaxonomyStats(type as TaxonomyType);
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run app/api/iab/__tests__/route.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add web/app/api/iab
git commit -m "feat: add /api/iab routes"
```

---

## Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd web && npx vitest run`
Expected: PASS — all existing (146) + new tests pass

- [ ] **Step 2: Lint and build**

Run: `cd web && npm run lint && npm run build`
Expected: both clean, no errors

- [ ] **Step 3: Manual smoke test**

Start the dev server (`cd web && npm run dev`) and, with `NEON_EXT_APIKEY` set to match the running server's env, run:

```bash
curl -H "apikey: $NEON_EXT_APIKEY" http://localhost:3000/api/iab/taxonomies
curl -H "apikey: $NEON_EXT_APIKEY" "http://localhost:3000/api/iab/content?format=tree"
curl -H "apikey: $NEON_EXT_APIKEY" http://localhost:3000/api/neon/config
```

Expected:
- `/api/iab/taxonomies` → 200, lists `content`/`audience`/`adproduct` with versions
- `/api/iab/content?format=tree` → 200, tree structure (downloads + caches the TSV from GitHub on first call)
- `/api/neon/config` → 200 list (against real Neon BO if `NEON_BO_URL`/`NEON_BO_APIKEY` are configured; otherwise verify request shaping, same caveat as Phase 2)
