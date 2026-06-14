import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { NeonClient } from '../neon-bo-api-v3';

vi.mock('axios');

describe('NeonClient.makeRequest', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockRequest = vi.fn();

  beforeEach(() => {
    process.env.NEON_BO_URL = 'https://bo.example.com';
    process.env.NEON_BO_APIKEY = 'bo-key';
    process.env.NEON_USER_API_KEY = 'user-key';
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({ request: mockRequest });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('shapes the request with baseURL and auth headers', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { ok: true } });
    const client = new NeonClient();

    await client.makeRequest({ method: 'get', url: '/contents/nodes/abc' });

    const config = mockRequest.mock.calls[0][0];
    expect(config.baseURL).toBe('https://bo.example.com');
    expect(config.url).toBe('/contents/nodes/abc');
    expect(config.headers['neon-bo-access-key']).toBe('bo-key');
    expect(config.headers['Authorization']).toBe('Bearer api:user-key');
    expect(config.headers['Content-Type']).toBe('application/json');
    expect(config.headers['update-context-id']).toMatch(/^neon-integration-\d+$/);
  });

  it('returns response.data when returnData is true', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { hello: 'world' } });
    const client = new NeonClient();

    const result = await client.makeRequest({ method: 'get', url: '/x' }, null, true);

    expect(result).toEqual({ hello: 'world' });
  });

  it('returns the full response when returnData is false', async () => {
    const response = { status: 200, data: { hello: 'world' } };
    mockRequest.mockResolvedValue(response);
    const client = new NeonClient();

    const result = await client.makeRequest({ method: 'get', url: '/x' });

    expect(result).toBe(response);
  });

  it('logs and rethrows on request failure', async () => {
    const error = { response: { status: 500, data: { message: 'boom' } }, code: 'ERR' };
    mockRequest.mockRejectedValue(error);
    const client = new NeonClient();

    await expect(client.makeRequest({ method: 'get', url: '/x' })).rejects.toBe(error);
  });
});

describe('NeonClient story methods', () => {
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({ request: mockRequest });
  });

  it('createNewStory returns the created node', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { node: { familyRef: 'fam-1' } } });
    const client = new NeonClient();

    const node = await client.createNewStory({
      type: 'article',
      name: 'test.xml',
      template: 'story.xml',
      issueDate: '20260614',
      creationMode: 'AUTO_RENAME',
      timeSuffix: false,
      storageFolder: 'SELECTED_WORKFOLDER',
    });

    expect(node).toEqual({ familyRef: 'fam-1' });
  });

  it('updateNodeContent returns true on a truthy response and false on falsy', async () => {
    mockRequest.mockResolvedValueOnce({ status: 200, data: {} });
    const client = new NeonClient();
    expect(await client.updateNodeContent('fam-1', '<doc/>')).toBe(true);

    mockRequest.mockResolvedValueOnce(undefined);
    expect(await client.updateNodeContent('fam-1', '<doc/>')).toBe(false);
  });

  it('updateNodeMetadata returns true on a truthy response', async () => {
    mockRequest.mockResolvedValueOnce({ status: 200, data: {} });
    const client = new NeonClient();
    expect(await client.updateNodeMetadata('fam-1', '<doc/>')).toBe(true);
  });

  it('promoteNode returns error response data on failure and null on no familyRef', async () => {
    const client = new NeonClient();
    expect(await client.promoteNode(undefined, {})).toBeNull();

    mockRequest.mockRejectedValueOnce({ response: { data: { error: 'failed' } } });
    expect(await client.promoteNode('fam-1', { targetSite: 'site', targetSection: '/sec' })).toEqual({
      error: 'failed',
    });
  });
});

describe('NeonClient stub fallbacks', () => {
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockRejectedValue({ response: { status: 404 }, code: 'ERR_404' });
    (axios.create as ReturnType<typeof vi.fn>) = vi.fn().mockReturnValue({ request: mockRequest });
  });

  it('getGroups returns the documented stub on failure', async () => {
    const client = new NeonClient();
    const result = (await client.getGroups()) as { groups: { name: string }[] };
    expect(result.groups.map((g) => g.name)).toEqual(['editors', 'admins', 'contributors', 'readers']);
  });

  it('getWorkflowDefinitions returns the documented stub on failure', async () => {
    const client = new NeonClient();
    const result = (await client.getWorkflowDefinitions()) as { workflows: { name: string }[] };
    expect(result.workflows.map((w) => w.name)).toEqual([
      'Story/Created',
      'Story/Edit',
      'Story/Ready',
      'Story/Published',
      'Story/Archived',
    ]);
  });

  it('getContentTypesConfig returns the documented stub on failure', async () => {
    const client = new NeonClient();
    const result = (await client.getContentTypesConfig()) as { typeInfo: { typeName: string } };
    expect(result.typeInfo.typeName).toBe('content');
  });
});
