import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../../../../proxy';
import { POST, GET } from '../route';
import { GET as getJobRoute, DELETE as deleteJobRoute } from '../[jobId]/route';
import {
  validatePayload,
  createJob,
  listJobs,
  getJob,
  cancelJob,
} from '../../../../../lib/integrations/delayed-importer/service';

vi.mock('../../../../../lib/integrations/delayed-importer/service', () => ({
  validatePayload: vi.fn(),
  createJob: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  cancelJob: vi.fn(),
}));

const mocks = {
  validatePayload: validatePayload as unknown as ReturnType<typeof vi.fn>,
  createJob: createJob as unknown as ReturnType<typeof vi.fn>,
  listJobs: listJobs as unknown as ReturnType<typeof vi.fn>,
  getJob: getJob as unknown as ReturnType<typeof vi.fn>,
  cancelJob: cancelJob as unknown as ReturnType<typeof vi.fn>,
};

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paramsOf(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

describe('POST /api/in/delayed-import', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns 400 when the payload is invalid', async () => {
    mocks.validatePayload.mockReturnValue({ valid: false, error: 'items must be a non-empty array' });

    const response = await POST(jsonRequest('https://example.com/api/in/delayed-import', { duration: 1 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'items must be a non-empty array' });
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it('returns 202 with the job submission on a valid payload', async () => {
    mocks.validatePayload.mockReturnValue({ valid: true });
    mocks.createJob.mockReturnValue({
      jobId: 'dlyimp-20260614-abc123',
      itemCount: 3,
      intervalMs: 20000,
      estimatedEndAt: '2026-06-14T00:01:00.000Z',
    });

    const payload = {
      duration: 1,
      site: 'demo-site',
      workspace: 'Demo Workspace',
      items: [{ contentType: 'story', title: 'A', content: '<p>a</p>' }],
    };
    const response = await POST(jsonRequest('https://example.com/api/in/delayed-import', payload));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      jobId: 'dlyimp-20260614-abc123',
      itemCount: 3,
      intervalMs: 20000,
      estimatedEndAt: '2026-06-14T00:01:00.000Z',
    });
    expect(mocks.createJob).toHaveBeenCalledWith(payload);
  });
});

describe('GET /api/in/delayed-import', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns the list of job summaries', async () => {
    mocks.listJobs.mockReturnValue([{ jobId: 'dlyimp-1', state: 'running', done: 1, total: 3, nextFireAt: null }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jobs: [{ jobId: 'dlyimp-1', state: 'running', done: 1, total: 3, nextFireAt: null }],
    });
  });
});

describe('GET /api/in/delayed-import/[jobId]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns the job snapshot when found', async () => {
    mocks.getJob.mockReturnValue({ jobId: 'dlyimp-1', state: 'running', done: 1, total: 3 });

    const response = await getJobRoute(
      new NextRequest('https://example.com/api/in/delayed-import/dlyimp-1'),
      paramsOf('dlyimp-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobId: 'dlyimp-1', state: 'running', done: 1, total: 3 });
  });

  it('returns 404 when the job is unknown', async () => {
    mocks.getJob.mockReturnValue(null);

    const response = await getJobRoute(
      new NextRequest('https://example.com/api/in/delayed-import/nope'),
      paramsOf('nope')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Job not found' });
  });
});

describe('DELETE /api/in/delayed-import/[jobId]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('returns the cancelled job snapshot', async () => {
    mocks.cancelJob.mockReturnValue({ jobId: 'dlyimp-1', state: 'cancelled', done: 1, total: 3 });

    const response = await deleteJobRoute(
      new NextRequest('https://example.com/api/in/delayed-import/dlyimp-1', { method: 'DELETE' }),
      paramsOf('dlyimp-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobId: 'dlyimp-1', state: 'cancelled', done: 1, total: 3 });
  });

  it('returns 404 when the job is unknown', async () => {
    mocks.cancelJob.mockReturnValue(null);

    const response = await deleteJobRoute(
      new NextRequest('https://example.com/api/in/delayed-import/nope', { method: 'DELETE' }),
      paramsOf('nope')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Job not found' });
  });

  it('returns 409 when the job is already finished', async () => {
    mocks.cancelJob.mockReturnValue({ error: 'Job already finished' });

    const response = await deleteJobRoute(
      new NextRequest('https://example.com/api/in/delayed-import/dlyimp-1', { method: 'DELETE' }),
      paramsOf('dlyimp-1')
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Job already finished' });
  });
});

describe('proxy + /api/in/delayed-import', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('blocks /api/in/delayed-import without an apikey', async () => {
    const request = new NextRequest('https://example.com/api/in/delayed-import');
    const response = proxy(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows /api/in/delayed-import through with a valid apikey header', () => {
    const request = new NextRequest('https://example.com/api/in/delayed-import', {
      headers: { apikey: 'admin-key' },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
