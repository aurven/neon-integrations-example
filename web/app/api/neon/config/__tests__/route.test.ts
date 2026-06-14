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
