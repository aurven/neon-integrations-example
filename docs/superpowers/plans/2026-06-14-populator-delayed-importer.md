# Populator + Delayed Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Neon Back Office API v3 client, the workflow-transition helper, the Populator (story/image creation), and the Delayed Importer (including its API-only Next.js routes) from the Fastify app (`src/`) into `web/lib` and `web/app/api`, per the approved design at `docs/superpowers/specs/2026-06-14-populator-delayed-importer-design.md`.

**Architecture:** Vertical slice, bottom-up: `web/lib/core/neon-bo-api-v3.ts` (shared Neon client, full port) → `web/lib/core/neon-utils.ts` (workflow transitions, built on the client) → `web/lib/integrations/populator/{images,service}.ts` (business logic, built on both) → `web/lib/integrations/delayed-importer/service.ts` (in-memory job scheduler, dependency-injects the populator) → `web/app/api/in/delayed-import/**/route.ts` (thin Next.js adapters, auth handled by existing `proxy.ts`).

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), vitest, axios, dayjs (new dependency).

---

## Task 1: `web/lib/core/neon-bo-api-v3.ts` — Neon Back Office API v3 client (full port)

**Files:**
- Create: `web/lib/core/neon-bo-api-v3.ts`
- Test: `web/lib/core/__tests__/neon-bo-api-v3.test.ts`

This is a direct TypeScript port of `src/helpers/neon-bo-api-v3.js` (452 lines): the `NeonClient` class (constructor + `makeRequest` + ~25 methods) plus a flat API delegating to a `defaultClient` singleton, including `getCallerName()`/`logNeonCall()` (local dev call-logging gated on `NEON_EXT_LOCATION === 'Local'`) and the three stubbed endpoints (`getGroups`, `getWorkflowDefinitions`, `getContentTypesConfig`) with their existing "remove stub when endpoint confirmed" TODOs preserved as-is (pre-existing known issues, not introduced here).

- [ ] **Step 1: Write `web/lib/core/neon-bo-api-v3.ts`**

```typescript
/**
 * Neon Back Office API v3 client, ported from src/helpers/neon-bo-api-v3.js.
 */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import fs from 'fs';
import path from 'path';

const NEON_CALLS_LOG_DIR = path.join(process.cwd(), 'logs', 'neon-calls');

interface NeonRequestConfig extends AxiosRequestConfig {
  url: string;
}

interface LogNeonCallParams {
  callerName: string;
  requestConfig: NeonRequestConfig;
  response?: AxiosResponse;
  error?: unknown;
}

// Caller name = first NeonClient.* frame above makeRequest in the stack
function getCallerName(): string {
  const stack = new Error().stack?.split('\n') || [];
  const frame = stack.find(
    (line) =>
      line.includes('NeonClient.') &&
      !line.includes('makeRequest') &&
      !line.includes('getCallerName')
  );
  const match = frame?.match(/NeonClient\.(\w+)/);
  return match ? match[1] : 'unknown';
}

function logNeonCall({ callerName, requestConfig, response, error }: LogNeonCallParams): void {
  if (process.env.NEON_EXT_LOCATION !== 'Local') return;

  try {
    fs.mkdirSync(NEON_CALLS_LOG_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${callerName}.json`;

    const axiosError = error as { response?: AxiosResponse; code?: string } | undefined;

    const entry = {
      caller: callerName,
      timestamp: new Date().toISOString(),
      request: {
        method: requestConfig.method,
        url: requestConfig.url,
        baseURL: requestConfig.baseURL,
        params: requestConfig.params,
        data: requestConfig.data,
      },
      response: response
        ? {
            status: response.status,
            data: response.data,
          }
        : null,
      error: error
        ? {
            status: axiosError?.response?.status,
            code: axiosError?.code,
            data: axiosError?.response?.data,
          }
        : null,
    };

    fs.writeFileSync(path.join(NEON_CALLS_LOG_DIR, filename), JSON.stringify(entry, null, 2));
  } catch (logError) {
    console.warn(`⚠️ Failed to write Neon call log: ${(logError as Error).message}`);
  }
}

export interface NeonNode {
  familyRef: string;
  title?: string;
  workspaceLinkInfo?: {
    workspaceUriPath?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CreateNewStoryOptions {
  type: string;
  name: string;
  template: string;
  issueDate: string;
  workFolder?: string;
  creationMode: string;
  timeSuffix: boolean;
  storageFolder: string;
  outputChannel?: string;
  edition?: string;
}

export interface PutNodeOptions {
  boundary: string;
  requestBody: string;
}

export interface PutNodeResponse {
  node?: NeonNode;
  [key: string]: unknown;
}

export interface PromoteOptions {
  targetSite?: string;
  targetSection?: string;
  mode?: 'PREVIEW' | 'LIVE';
}

export interface WorkflowStep {
  name: string;
  state: { name: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface WorkflowInfo {
  processInstance?: {
    processName?: string;
    state?: string;
    [key: string]: unknown;
  };
  steps?: WorkflowStep[];
  [key: string]: unknown;
}

export interface NextStepsData {
  node?: NeonNode;
  associatedWorkflow?: WorkflowInfo;
  availableWorkflows?: WorkflowInfo[];
  [key: string]: unknown;
}

export type NextStepsResponse = AxiosResponse<NextStepsData>;

export interface NextStepAssignmentBody {
  workflowAssignment: {
    title: string;
    comment: string;
    principals: string[];
    prioprity: number;
  };
  workflowStep: {
    connectorName: string;
    workflowName?: string;
  };
}

export interface GroupsStub {
  groups: { name: string; realm: string }[];
}

export interface WorkflowDefinitionsStub {
  workflows: { name: string }[];
}

export interface ContentTypesConfigStub {
  typeInfo: { typeId: number; typeName: string; typeMeta: { label: string } };
  hierarchicalSubTypes: Record<string, unknown>;
}

export interface NeonClientOptions {
  baseUrl?: string;
  apiKey?: string;
  userApiKey?: string;
}

export class NeonClient {
  baseUrl?: string;
  apiKey?: string;
  userApiKey?: string;
  updateContextId: string;
  client: ReturnType<typeof axios.create>;

  constructor(options: NeonClientOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.NEON_BO_URL;
    this.apiKey = options.apiKey || process.env.NEON_BO_APIKEY;
    this.userApiKey = options.userApiKey || process.env.NEON_USER_API_KEY;
    this.updateContextId = `neon-integration-${Date.now()}`;

    if (process.env.NEON_EXT_LOCATION === 'Local') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    this.client = axios.create();
  }

  async makeRequest(
    config: NeonRequestConfig,
    successMessage: string | null = null,
    returnData = false
  ): Promise<unknown> {
    const { headers: configHeaders, ...restConfig } = config;
    const requestConfig: NeonRequestConfig = {
      ...restConfig,
      url: config.url,
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'neon-bo-access-key': this.apiKey,
        Authorization: `Bearer api:${this.userApiKey}`,
        'update-context-id': this.updateContextId,
        ...configHeaders,
      },
    };

    const callerName = getCallerName();

    try {
      const response = await this.client.request(requestConfig);
      if (successMessage) {
        console.log(`✅ ${successMessage}`);
      }
      logNeonCall({ callerName, requestConfig, response });
      return returnData ? response.data : response;
    } catch (error) {
      const axiosError = error as { response?: AxiosResponse; code?: string };
      const errorMsg = `❌ ${String(config.method ?? 'REQUEST').toUpperCase()} ${config.url} failed: ${axiosError.response?.status || axiosError.code}`;
      console.error(errorMsg);
      if (axiosError.response?.data) {
        console.error('Error details:', JSON.stringify(axiosError.response.data, null, 2));
      }
      logNeonCall({ callerName, requestConfig, error });
      throw error;
    }
  }

  async getNode(familyRef: string): Promise<NeonNode> {
    return (await this.makeRequest(
      { method: 'get', url: `/contents/nodes/${familyRef}` },
      `Node ${familyRef} retrieved`,
      true
    )) as NeonNode;
  }

  async getNodeMetadata(familyRef: string): Promise<unknown> {
    return await this.makeRequest(
      { method: 'get', url: `/contents/nodes/${familyRef}/metadata` },
      `Node metadata for ${familyRef} retrieved`,
      true
    );
  }

  async deleteNode(familyRef: string, force = false): Promise<unknown> {
    return await this.makeRequest(
      { method: 'delete', url: `/contents/nodes?familyRefs=${familyRef}&unpublish=${force}` },
      `Node ${familyRef} deleted`
    );
  }

  async lockNode(familyRef: string): Promise<unknown> {
    return await this.makeRequest(
      { method: 'put', url: '/contents/nodes/lock', data: [familyRef] },
      `Node ${familyRef} locked`,
      true
    );
  }

  async unlockNode(familyRef: string, unlockMode = 'MAJOR'): Promise<unknown> {
    return await this.makeRequest(
      { method: 'put', url: `/contents/nodes/unlock?unlockMode=${unlockMode}`, data: [familyRef] },
      `Node ${familyRef} unlocked`
    );
  }

  async updateNodeContent(familyRef: string, xmlBodyString: string): Promise<boolean> {
    const result = await this.makeRequest(
      {
        method: 'put',
        url: `/contents/story/${familyRef}?saveMode=UPDATE_ONLY&keepCheckedout=false`,
        headers: { 'Content-Type': 'application/xml', Accept: 'text/xml' },
        data: xmlBodyString,
      },
      `Node content for ${familyRef} updated`
    );
    return !!result;
  }

  async updateNodeMetadata(familyRef: string, xmlBodyString: string): Promise<boolean> {
    const result = await this.makeRequest(
      {
        method: 'put',
        url: `/contents/nodes/${familyRef}/metadata`,
        headers: { 'Content-Type': 'application/xml', Accept: 'text/xml' },
        data: xmlBodyString,
      },
      `Node metadata for ${familyRef} updated`
    );
    return !!result;
  }

  async searchContents(queryPayload: unknown, numberOfNodes = 0, numberOfIds = 10): Promise<unknown> {
    return await this.makeRequest(
      {
        method: 'post',
        url: `/contents/search?numberOfNodes=${numberOfNodes}&numberOfIds=${numberOfIds}`,
        data: queryPayload,
      },
      'Content search completed',
      true
    );
  }

  async createNewStory(options: CreateNewStoryOptions): Promise<NeonNode> {
    const response = (await this.makeRequest(
      { method: 'post', url: '/contents/story', data: options },
      null,
      true
    )) as { node: NeonNode };
    const { node } = response;
    console.log(`📝 Created new Story: ${node.familyRef}`);
    return node;
  }

  async putNode({ boundary, requestBody }: PutNodeOptions): Promise<PutNodeResponse> {
    return (await this.makeRequest(
      {
        method: 'put',
        url: '/contents/nodes',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        data: requestBody,
      },
      'Asset uploaded',
      true
    )) as PutNodeResponse;
  }

  async getSites(): Promise<unknown> {
    const response = (await this.makeRequest(
      { method: 'get', url: '/core/sites' },
      'Sites retrieved',
      true
    )) as { result: unknown };
    return response.result;
  }

  async createNewSiteNode(options: unknown, realm = 'default'): Promise<unknown> {
    const response = (await this.makeRequest(
      { method: 'post', url: `/core/sites/nodes/create?realm=${realm}`, data: options },
      null,
      true
    )) as { id: unknown };
    console.log(`🏗️ Created new Site! Id: ${String(response.id)}`);
    return response.id;
  }

  async publishSiteNode(options: unknown, realm = 'default', viewStatus = 'LIVE'): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: `/core/sites/nodes/publish?realm=${realm}&viewStatus=${viewStatus}`, data: options },
      'Site Node published',
      true
    );
  }

  async createUser(options: unknown): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: '/directory/users/create', data: options },
      'New user created',
      true
    );
  }

  async getUsers(): Promise<unknown> {
    return await this.makeRequest({ method: 'get', url: '/directory/users?limit=100' }, 'Users retrieved', true);
  }

  async getGroups(): Promise<unknown> {
    try {
      return await this.makeRequest(
        { method: 'get', url: '/directory/groups?limit=100' },
        'Groups retrieved',
        true
      );
    } catch (error) {
      const axiosError = error as { response?: AxiosResponse; code?: string };
      console.warn(
        `⚠️ getGroups(): endpoint unavailable (${axiosError.response?.status || axiosError.code}), returning stub`
      );
      // TODO: remove stub when /directory/groups is confirmed available on this Neon BO version
      const stub: GroupsStub = {
        groups: [
          { name: 'editors', realm: 'default' },
          { name: 'admins', realm: 'default' },
          { name: 'contributors', realm: 'default' },
          { name: 'readers', realm: 'default' },
        ],
      };
      return stub;
    }
  }

  async addUserToGroup(userId: string, groupName: string): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: '/directory/users/groups/add?realm=default', data: { id: userId, group: groupName } },
      `User ${userId} added to ${groupName}`
    );
  }

  async createGroup(options: unknown): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: '/directory/groups/create', data: options },
      'New group created',
      true
    );
  }

  async updateGroup(options: unknown): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: '/directory/groups/update', data: options },
      'Group updated',
      true
    );
  }

  async updateWorkspace({
    parentWorkspaceName,
    targetWorkspaceId,
    options,
  }: {
    parentWorkspaceName: string;
    targetWorkspaceId: string;
    options: unknown;
  }): Promise<unknown> {
    return await this.makeRequest(
      { method: 'put', url: `/contents/folders/config/${parentWorkspaceName}/${targetWorkspaceId}`, data: options },
      'Workspace updated',
      true
    );
  }

  async updateWorkspaceTemplates({
    targetWorkspaceId,
    options,
  }: {
    targetWorkspaceId: string;
    options: unknown;
  }): Promise<unknown> {
    return await this.makeRequest(
      { method: 'put', url: `/contents/folders/templates/${targetWorkspaceId}`, data: options },
      'Workspace templates updated',
      true
    );
  }

  async createBasefolder(options: unknown): Promise<unknown> {
    return await this.makeRequest(
      { method: 'post', url: '/contents/folders', data: options },
      'Base folder created',
      true
    );
  }

  async getNextSteps(familyRef?: string): Promise<NextStepsResponse | null> {
    if (!familyRef) return null;
    return (await this.makeRequest(
      { method: 'get', url: `/contents/nodes/${familyRef}/workflow/nextsteps` },
      `Got next workflow steps for ${familyRef}`
    )) as NextStepsResponse;
  }

  async nextStepAssignment(familyRef?: string, options?: NextStepAssignmentBody): Promise<unknown | null> {
    if (!familyRef) return null;
    return await this.makeRequest(
      { method: 'post', url: `/workflow/instance/task/nextStepAssignment?objRef=${familyRef}`, data: options }
,
      `Assigned new workflow step to ${familyRef}`
    );
  }

  async getWorkflowDefinitions(): Promise<unknown> {
    try {
      return await this.makeRequest(
        { method: 'get', url: '/workflow/definitions' },
        'Workflow definitions retrieved',
        true
      );
    } catch (error) {
      const axiosError = error as { response?: AxiosResponse; code?: string };
      console.warn(
        `⚠️ getWorkflowDefinitions(): endpoint unavailable (${axiosError.response?.status || axiosError.code}), returning stub`
      );
      // TODO: remove stub when a real workflow-list endpoint is confirmed on this Neon BO version
      const stub: WorkflowDefinitionsStub = {
        workflows: [
          { name: 'Story/Created' },
          { name: 'Story/Edit' },
          { name: 'Story/Ready' },
          { name: 'Story/Published' },
          { name: 'Story/Archived' },
        ],
      };
      return stub;
    }
  }

  async getContentTypesConfig(): Promise<unknown> {
    try {
      return await this.makeRequest({ method: 'get', url: '/contents/types' }, 'Content types config retrieved', true);
    } catch (error) {
      const axiosError = error as { response?: AxiosResponse; code?: string };
      console.warn(
        `⚠️ getContentTypesConfig(): endpoint unavailable (${axiosError.response?.status || axiosError.code}), returning stub`
      );
      // TODO: remove stub when the real content-types-config endpoint is confirmed on this Neon BO version
      const stub: ContentTypesConfigStub = {
        typeInfo: { typeId: 4096, typeName: 'content', typeMeta: { label: 'Content' } },
        hierarchicalSubTypes: {
          4098: {
            typeInfo: { typeId: 4098, typeName: 'article', contentType: 'story', typeMeta: { label: 'Article' } },
            composedTypeName: 'article',
            contentType: 'story',
            hierarchicalSubTypes: {
              4100: {
                typeInfo: { typeId: 4100, typeName: 'gallery', contentType: 'gallery', typeMeta: { label: 'Gallery' } },
                composedTypeName: 'article/gallery',
                contentType: 'gallery',
              },
            },
          },
        },
      };
      return stub;
    }
  }

  async promoteNode(familyRef: string | undefined, { targetSite, targetSection, mode = 'PREVIEW' }: PromoteOptions): Promise<unknown | null> {
    if (!familyRef) return null;
    const siteDetails = [{ siteName: targetSite, sitePath: targetSection }];
    try {
      return await this.makeRequest(
        { method: 'post', url: `/contents/nodes/${familyRef}/promote/${mode}`, data: { siteDetails } },
        `Node ${familyRef} promoted to ${targetSite}${targetSection}`,
        true
      );
    } catch (error) {
      const axiosError = error as { response?: AxiosResponse };
      return axiosError.response?.data ?? null;
    }
  }

  async promoteNodeEverywhere(familyRef: string | undefined, { mode = 'PREVIEW' }: { mode?: string }): Promise<unknown | null> {
    if (!familyRef) return null;
    return await this.makeRequest(
      { method: 'post', url: `/contents/nodes/${familyRef}/promote/${mode}`, data: {} },
      `Node ${familyRef} promoted everywhere`,
      true
    );
  }

  async discoveryServices(): Promise<unknown> {
    return await this.makeRequest({ method: 'get', url: '/discovery/services' }, 'Discovery services retrieved', true);
  }

  async getMetricsReports(): Promise<unknown> {
    return await this.makeRequest({ method: 'get', url: '/core/metrics' }, 'Available metrics reports retrieved', true);
  }

  async getMetricsData(reportId: string, queryParams: Record<string, unknown> = {}): Promise<unknown> {
    if (!reportId) throw new Error('Report ID is required');
    return await this.makeRequest(
      { method: 'get', url: `/core/metrics/${reportId}`, params: queryParams },
      `Metrics data for ${reportId} retrieved`,
      true
    );
  }
}

const defaultClient = new NeonClient();

export const getNode = (familyRef: string) => defaultClient.getNode(familyRef);
export const getNodeMetadata = (familyRef: string) => defaultClient.getNodeMetadata(familyRef);
export const deleteNode = (familyRef: string, force?: boolean) => defaultClient.deleteNode(familyRef, force);
export const lockNode = (familyRef: string) => defaultClient.lockNode(familyRef);
export const unlockNode = (familyRef: string, unlockMode?: string) => defaultClient.unlockNode(familyRef, unlockMode);
export const updateNodeContent = (familyRef: string, xmlBodyString: string) =>
  defaultClient.updateNodeContent(familyRef, xmlBodyString);
export const updateNodeMetadata = (familyRef: string, xmlBodyString: string) =>
  defaultClient.updateNodeMetadata(familyRef, xmlBodyString);
export const createNewStory = (options: CreateNewStoryOptions) => defaultClient.createNewStory(options);
export const putNode = (params: PutNodeOptions) => defaultClient.putNode(params);
export const getSites = () => defaultClient.getSites();
export const createNewSiteNode = (options: unknown, realm?: string) => defaultClient.createNewSiteNode(options, realm);
export const publishSiteNode = (options: unknown, realm?: string, viewStatus?: string) =>
  defaultClient.publishSiteNode(options, realm, viewStatus);
export const createUser = (options: unknown) => defaultClient.createUser(options);
export const getUsers = () => defaultClient.getUsers();
export const getGroups = () => defaultClient.getGroups();
export const addUserToGroup = (userId: string, groupName: string) => defaultClient.addUserToGroup(userId, groupName);
export const createGroup = (options: unknown) => defaultClient.createGroup(options);
export const updateGroup = (options: unknown) => defaultClient.updateGroup(options);
export const updateWorkspace = (params: { parentWorkspaceName: string; targetWorkspaceId: string; options: unknown }) =>
  defaultClient.updateWorkspace(params);
export const updateWorkspaceTemplates = (params: { targetWorkspaceId: string; options: unknown }) =>
  defaultClient.updateWorkspaceTemplates(params);
export const createBasefolder = (options: unknown) => defaultClient.createBasefolder(options);
export const getNextSteps = (familyRef?: string) => defaultClient.getNextSteps(familyRef);
export const nextStepAssignment = (familyRef?: string, options?: NextStepAssignmentBody) =>
  defaultClient.nextStepAssignment(familyRef, options);
export const getWorkflowDefinitions = () => defaultClient.getWorkflowDefinitions();
export const getContentTypesConfig = () => defaultClient.getContentTypesConfig();
export const promoteNode = (familyRef: string | undefined, params: PromoteOptions) => defaultClient.promoteNode(familyRef, params);
export const promoteNodeEverywhere = (familyRef: string | undefined, params: { mode?: string }) =>
  defaultClient.promoteNodeEverywhere(familyRef, params);
export const discoveryServices = () => defaultClient.discoveryServices();
export const searchContents = (queryPayload: unknown, numberOfNodes?: number, numberOfIds?: number) =>
  defaultClient.searchContents(queryPayload, numberOfNodes, numberOfIds);
export const getMetricsReports = () => defaultClient.getMetricsReports();
export const getMetricsData = (reportId: string, queryParams?: Record<string, unknown>) =>
  defaultClient.getMetricsData(reportId, queryParams);
```

- [ ] **Step 2: Write `web/lib/core/__tests__/neon-bo-api-v3.test.ts`**

```typescript
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
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run lib/core/__tests__/neon-bo-api-v3.test.ts`
Expected: PASS (all new tests green)

- [ ] **Step 4: Commit**

```bash
git add web/lib/core/neon-bo-api-v3.ts web/lib/core/__tests__/neon-bo-api-v3.test.ts
git commit -m "feat: port Neon Back Office API v3 client to TypeScript"
```

## Task 2: `web/lib/core/neon-utils.ts` — workflow transitions

**Files:**
- Create: `web/lib/core/neon-utils.ts`
- Test: `web/lib/core/__tests__/neon-utils.test.ts`
- Modify: `web/lib/core/utils.ts:4-8` and `web/lib/core/utils.ts:495-496`

Port `workflowTransitionTo` and `nextStepAssignmentBodyGenerator` from `src/helpers/neon-utils.js` as-is. `deleteObjectsByQuery` is **not** ported — it calls `neon.searchNodes(...)`, which doesn't exist on `NeonClient` (only `searchContents` does). This is dead/broken code in the original, unused by populator/delayed-importer.

Two stale comments in `web/lib/core/utils.ts` reference "the Phase 2 neon-bo-api port" as the trigger for re-adding `withNeonSession` (a thin `new NeonClient(options)` wrapper). `withNeonSession` is only used by `src/requestHandlers/neon-metrics.js` (the metrics integration), which is out of scope for this phase — Task 1's `neon-bo-api-v3.ts` port does not satisfy this TODO. Both comments are updated to point at the metrics integration instead, so they don't read as "done" once Task 1 lands.

- [ ] **Step 1: Update the stale `withNeonSession` comments in `web/lib/core/utils.ts`**

Replace the file header comment (`web/lib/core/utils.ts:1-8`):

```typescript
/**
 * Common utilities, ported from src/helpers/utils.js.
 *
 * NOTE: `withNeonSession` is NOT ported here. It is a thin
 * `new NeonClient(options)` wrapper only used by the metrics integration
 * (src/requestHandlers/neon-metrics.js, not yet ported). Re-introduce it
 * alongside that integration's port.
 */
```

Replace the comment at `web/lib/core/utils.ts:495-496`:

```typescript
// `withNeonSession` (thin `new NeonClient(options)` wrapper) is still not
// ported - only the metrics integration needs it. Re-add alongside that port.
```

- [ ] **Step 2: Write `web/lib/core/neon-utils.ts`**

```typescript
/**
 * Workflow transition helpers, ported from src/helpers/neon-utils.js.
 */
import { getNextSteps, nextStepAssignment } from './neon-bo-api-v3';
import type { NextStepsData, NextStepAssignmentBody, WorkflowStep } from './neon-bo-api-v3';

export interface WorkflowTransitionOptions {
  familyRef?: string;
  targetStateName: string;
  targetWorkflowName?: string | null;
  priority?: number;
  principals?: string[];
  comment?: string;
}

export async function workflowTransitionTo({
  familyRef,
  targetStateName,
  targetWorkflowName = null,
  priority = 0,
  principals = [],
  comment = '',
}: WorkflowTransitionOptions): Promise<unknown> {
  const getNextStepsResult = await getNextSteps(familyRef);
  const nodeData = getNextStepsResult?.data?.node;
  const associatedWorkflow = getNextStepsResult?.data?.associatedWorkflow;

  if (nodeData?.familyRef === familyRef) {
    try {
      if (
        associatedWorkflow?.processInstance?.processName === targetWorkflowName &&
        associatedWorkflow?.processInstance?.state === targetStateName
      ) {
        console.log(
          `Node ${familyRef} is already in the desired state '${targetStateName}' of workflow '${targetWorkflowName}'`
        );
        return;
      }
      const nextStepBody = nextStepAssignmentBodyGenerator({
        getNextStepsResult: getNextStepsResult!.data,
        targetWorkflowName,
        targetStateName,
        priority,
        principals,
        comment,
      });
      console.log(
        `Transitioning node ${familyRef} to state '${targetStateName}' of workflow '${targetWorkflowName}'...`
      );

      if (!nextStepBody) {
        console.error(`Cannot generate next step body for ${familyRef}`);
        return;
      }
      return await nextStepAssignment(familyRef, nextStepBody);
    } catch (error) {
      console.error((error as Error).message);
    }
  } else {
    console.error(`Cannot transition to ${targetStateName} for ${familyRef}`);
  }
}

export interface NextStepAssignmentBodyGeneratorOptions {
  getNextStepsResult: NextStepsData;
  targetWorkflowName?: string | null;
  targetStateName: string;
  priority: number;
  principals: string[];
  comment: string;
}

export function nextStepAssignmentBodyGenerator({
  getNextStepsResult,
  targetWorkflowName,
  targetStateName,
  priority,
  principals,
  comment,
}: NextStepAssignmentBodyGeneratorOptions): NextStepAssignmentBody | undefined {
  let processName = getNextStepsResult.associatedWorkflow?.processInstance?.processName;
  let matchingStep: WorkflowStep | undefined;
  const nodeTitle = getNextStepsResult.node?.title || 'Automatically transitioned by a Neon Integration';

  if (!processName && targetWorkflowName) {
    console.warn(
      `No associated workflow found for this node. Trying to find the workflow by name "${targetWorkflowName}"...`
    );
    const targetWorkflow = getNextStepsResult.availableWorkflows?.find(
      (workflow) => workflow.processInstance?.processName === targetWorkflowName
    );
    if (!targetWorkflow) {
      console.error(`Workflow with name '${targetWorkflowName}' not found`);
      return undefined;
    }
    processName = targetWorkflowName;
    matchingStep = targetWorkflow.steps?.find((step) => step.state.name === targetStateName);
  } else {
    matchingStep = getNextStepsResult.associatedWorkflow?.steps?.find((step) => step.state.name === targetStateName);
  }

  if (!matchingStep) {
    console.error(`Step with state name '${targetStateName}' not found`);
    return undefined;
  }

  return {
    workflowAssignment: {
      title: nodeTitle,
      comment,
      principals,
      prioprity: priority,
    },
    workflowStep: {
      connectorName: matchingStep.name,
      workflowName: processName,
    },
  };
}
```

- [ ] **Step 3: Write `web/lib/core/__tests__/neon-utils.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowTransitionTo, nextStepAssignmentBodyGenerator } from '../neon-utils';
import { getNextSteps, nextStepAssignment } from '../neon-bo-api-v3';

vi.mock('../neon-bo-api-v3', () => ({
  getNextSteps: vi.fn(),
  nextStepAssignment: vi.fn(),
}));

const mockGetNextSteps = getNextSteps as unknown as ReturnType<typeof vi.fn>;
const mockNextStepAssignment = nextStepAssignment as unknown as ReturnType<typeof vi.fn>;

describe('workflowTransitionTo', () => {
  beforeEach(() => {
    mockGetNextSteps.mockReset();
    mockNextStepAssignment.mockReset();
  });

  it('is a no-op when the node is already in the target state of the target workflow', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'Title' },
        associatedWorkflow: { processInstance: { processName: 'Story', state: 'Edit' }, steps: [] },
      },
    });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Edit' });

    expect(mockNextStepAssignment).not.toHaveBeenCalled();
  });

  it('transitions via the associated workflow when the state differs', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'My Story' },
        associatedWorkflow: {
          processInstance: { processName: 'Story', state: 'Created' },
          steps: [{ name: 'edit-step', state: { name: 'Edit' } }],
        },
      },
    });
    mockNextStepAssignment.mockResolvedValue({ status: 200 });

    await workflowTransitionTo({
      familyRef: 'fam-1',
      targetWorkflowName: 'Story',
      targetStateName: 'Edit',
      principals: ['user-1'],
      comment: 'go',
    });

    expect(mockNextStepAssignment).toHaveBeenCalledWith('fam-1', {
      workflowAssignment: {
        title: 'My Story',
        comment: 'go',
        principals: ['user-1'],
        prioprity: 0,
      },
      workflowStep: {
        connectorName: 'edit-step',
        workflowName: 'Story',
      },
    });
  });

  it('falls back to availableWorkflows when there is no associated workflow', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'My Story' },
        associatedWorkflow: {},
        availableWorkflows: [
          {
            processInstance: { processName: 'Story' },
            steps: [{ name: 'ready-step', state: { name: 'Ready' } }],
          },
        ],
      },
    });
    mockNextStepAssignment.mockResolvedValue({ status: 200 });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Ready' });

    expect(mockNextStepAssignment).toHaveBeenCalledWith(
      'fam-1',
      expect.objectContaining({ workflowStep: { connectorName: 'ready-step', workflowName: 'Story' } })
    );
  });

  it('does nothing when the node familyRef does not match', async () => {
    mockGetNextSteps.mockResolvedValue({ data: { node: { familyRef: 'other' } } });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Edit' });

    expect(mockNextStepAssignment).not.toHaveBeenCalled();
  });
});

describe('nextStepAssignmentBodyGenerator', () => {
  it('returns undefined when no matching step is found', () => {
    const result = nextStepAssignmentBodyGenerator({
      getNextStepsResult: {
        node: { familyRef: 'fam-1', title: 'Title' },
        associatedWorkflow: { processInstance: { processName: 'Story' }, steps: [] },
      },
      targetWorkflowName: 'Story',
      targetStateName: 'Ready',
      priority: 0,
      principals: [],
      comment: '',
    });

    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run lib/core/__tests__/neon-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/core/neon-utils.ts web/lib/core/__tests__/neon-utils.test.ts web/lib/core/utils.ts
git commit -m "feat: port workflow transition helpers to neon-utils.ts"
```

## Task 3: `web/lib/integrations/populator/images.ts` — populator-relevant image upload helpers

**Files:**
- Create: `web/lib/integrations/populator/images.ts`
- Test: `web/lib/integrations/populator/__tests__/images.test.ts`

Port of the populator-relevant subset of `src/images-importer.js`: `imageToBase64`, `buildImageMetadataXml`, `uploadImage`, `uploadImageFromStory`, `mainImageReferenceGenerator`. Methode-specific functions (`prepareNeonImage`, `extractImageCaptions`, `modelImagesToMethode`, `uploadImageToMethode`, `isTrelloUrl`, `getTrelloCoverUrl`) stay in `src/images-importer.js`.

**Deliberate deviations from the original (documented):**
- The original `imageToBase64` has a self-referential bug (`!isTrelloUrl` evaluates the function reference, not a call, so it's always falsy) that *always* attaches a Trello OAuth header built from `TRELLO_APIKEY`/`TRELLO_TOKEN`. Since Trello support is explicitly out of scope for this phase (`isTrelloUrl`/`getTrelloCoverUrl` are not ported), the port fetches images with no special headers — the actual populator/delayed-importer path (non-Trello URLs) behaves identically; the Trello branch was dead weight here regardless.
- `uploadImage` throws an explicit `Error` if `imageToBase64` returns `null`, instead of the original's implicit `TypeError` from destructuring `null`. Same failure outcome (the promise rejects), clearer message.
- `uploadImageFromStory`'s `imageName` falls back to `''` if both `getImageNameFromUrl(imageUrl)` and `story.id` are falsy (TS requires `imageName: string`); in practice one of these is always present.

- [ ] **Step 1: Write `web/lib/integrations/populator/images.ts`**

```typescript
/**
 * Populator-relevant image helpers, ported from src/images-importer.js.
 */
import querystring from 'querystring';
import axios from 'axios';
import { putNode } from '../../core/neon-bo-api-v3';
import type { NeonNode, PutNodeResponse } from '../../core/neon-bo-api-v3';
import { hasFileExtension, getImageNameFromUrl } from '../../core/utils';

export interface ImageMetadata {
  caption?: string;
  credit?: string;
}

export interface UploadImageOptions {
  imageName: string;
  imageUrl: string;
  workspace?: string;
  metadata?: ImageMetadata;
}

export interface StoryForImageUpload {
  figureUrl?: string;
  id?: string;
  tgtWorkspace?: string;
  neon?: { workspace?: string };
}

export async function imageToBase64(url: string): Promise<{ mimeType: string; base64: string } | null> {
  const [baseUrl, queryString] = url.split('?');
  const queryParams = queryString ? querystring.parse(queryString) : {};

  try {
    const response = await axios.get(baseUrl, { responseType: 'arraybuffer', params: queryParams });
    const base64 = Buffer.from(response.data as Buffer, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] as string;
    return { mimeType, base64 };
  } catch (error) {
    console.error('Error fetching image:', (error as Error).message);
    return null;
  }
}

function escapeXml(value: string): string {
  const replacements: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return String(value).replace(/[<>&'"]/g, (c) => replacements[c]);
}

export function buildImageMetadataXml(metadata: ImageMetadata = {}): string {
  // credit is always emitted (empty when absent) to keep legacy output byte-identical;
  // caption is only emitted when present; image.dtd requires credit before caption.
  const caption = metadata.caption ? `<caption>${escapeXml(metadata.caption)}</caption>` : '';
  const credit = `<credit>${metadata.credit ? escapeXml(metadata.credit) : ''}</credit>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
    `<ObjectMetadata>` +
    `<iptc>` +
    credit +
    caption +
    `</iptc>` +
    `<WebDesign><WebType>Image</WebType></WebDesign>` +
    `</ObjectMetadata>`
  );
}

export async function uploadImage(options: UploadImageOptions): Promise<PutNodeResponse> {
  const imageUrl = options.imageUrl;

  console.log('Fetching image from URL: ' + imageUrl);

  const imageData = await imageToBase64(imageUrl);
  if (!imageData) {
    throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
  }
  const { mimeType, base64 } = imageData;

  console.log('Detected Image MIME type: ' + mimeType);

  const imageType = mimeType.split('/')[1];
  const imageName = hasFileExtension(options.imageName) ? options.imageName : `${options.imageName}.${imageType}`;

  console.log(`Uploading image: ${imageName} with ${imageType} type to workspace: ${options.workspace}`);

  const boundary = 'WebKitFormBoundary4B2922fkRo7Alk4m';

  const imagePart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="${imageName}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64}\r\n`;

  const objectModel = {
    workFolder: options.workspace,
    creationMode: 'AUTO_RENAME',
    timeSuffix: true,
    name: imageName,
  };

  const objectModelPart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="objectModel"; filename="blob"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(objectModel)}\r\n`;

  const xmlMetadata = buildImageMetadataXml(options.metadata);

  const attributesPart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="attributes"; filename="blob"\r\n` +
    `Content-Type: application/xml\r\n\r\n` +
    `${xmlMetadata}\r\n`;

  const finalBoundary = `--${boundary}--`;

  const requestBody = imagePart + objectModelPart + attributesPart + finalBoundary;

  return putNode({ boundary, requestBody });
}

export function mainImageReferenceGenerator(imageNode: NeonNode): string | null {
  try {
    const { familyRef, workspaceLinkInfo } = imageNode;
    const { workspaceUriPath } = workspaceLinkInfo as NonNullable<NeonNode['workspaceLinkInfo']>;
    return workspaceUriPath + '?uuid=' + familyRef;
  } catch {
    return null;
  }
}

export async function uploadImageFromStory(story: StoryForImageUpload): Promise<PutNodeResponse | false> {
  const imageUrl = story.figureUrl;
  const workspace = story.tgtWorkspace || story.neon?.workspace;

  if (!imageUrl) return false;

  const imageName = getImageNameFromUrl(imageUrl) || story.id || '';

  return await uploadImage({ imageName, imageUrl, workspace });
}
```

- [ ] **Step 2: Write `web/lib/integrations/populator/__tests__/images.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  buildImageMetadataXml,
  mainImageReferenceGenerator,
  imageToBase64,
  uploadImage,
  uploadImageFromStory,
} from '../images';
import { putNode } from '../../../core/neon-bo-api-v3';

vi.mock('axios');
vi.mock('../../../core/neon-bo-api-v3', () => ({
  putNode: vi.fn(),
}));

const mockPutNode = putNode as unknown as ReturnType<typeof vi.fn>;

describe('buildImageMetadataXml', () => {
  it('includes credit and caption when both present', () => {
    const xml = buildImageMetadataXml({ caption: 'A caption', credit: 'A credit' });
    expect(xml).toContain('<credit>A credit</credit>');
    expect(xml).toContain('<caption>A caption</caption>');
    expect(xml.indexOf('<credit>')).toBeLessThan(xml.indexOf('<caption>'));
  });

  it('emits an empty credit tag and omits caption when absent', () => {
    const xml = buildImageMetadataXml({});
    expect(xml).toContain('<credit></credit>');
    expect(xml).not.toContain('<caption>');
  });

  it('escapes XML special characters', () => {
    const xml = buildImageMetadataXml({ caption: 'A & B <tag>' });
    expect(xml).toContain('<caption>A &amp; B &lt;tag&gt;</caption>');
  });
});

describe('mainImageReferenceGenerator', () => {
  it('builds a reference from familyRef and workspaceUriPath', () => {
    const ref = mainImageReferenceGenerator({
      familyRef: 'fam-img-1',
      workspaceLinkInfo: { workspaceUriPath: '/Demo/Images' },
    });
    expect(ref).toBe('/Demo/Images?uuid=fam-img-1');
  });

  it('returns null when workspaceLinkInfo is missing', () => {
    const ref = mainImageReferenceGenerator({ familyRef: 'fam-img-1' });
    expect(ref).toBeNull();
  });
});

describe('imageToBase64', () => {
  beforeEach(() => {
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns mimeType and base64 on success', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/jpeg' },
    });

    const result = await imageToBase64('https://example.com/pic.jpg');

    expect(result).toEqual({ mimeType: 'image/jpeg', base64: Buffer.from('hello').toString('base64') });
  });

  it('returns null on fetch failure', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const result = await imageToBase64('https://example.com/pic.jpg');

    expect(result).toBeNull();
  });
});

describe('uploadImage', () => {
  beforeEach(() => {
    mockPutNode.mockReset();
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('builds a multipart body and calls putNode', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/jpeg' },
    });
    mockPutNode.mockResolvedValue({ node: { familyRef: 'fam-img-1' } });

    const result = await uploadImage({
      imageName: 'sunset',
      imageUrl: 'https://example.com/pic.jpg',
      workspace: '/Demo/Images',
      metadata: { caption: 'A sunset' },
    });

    expect(result).toEqual({ node: { familyRef: 'fam-img-1' } });
    const [{ boundary, requestBody }] = mockPutNode.mock.calls[0];
    expect(boundary).toBe('WebKitFormBoundary4B2922fkRo7Alk4m');
    expect(requestBody).toContain('filename="sunset.jpg"');
    expect(requestBody).toContain('Content-Type: image/jpeg');
    expect(requestBody).toContain('"workFolder":"/Demo/Images"');
    expect(requestBody).toContain('<caption>A sunset</caption>');
    expect(requestBody.endsWith('--WebKitFormBoundary4B2922fkRo7Alk4m--')).toBe(true);
  });

  it('throws when the image cannot be fetched', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    await expect(
      uploadImage({ imageName: 'sunset', imageUrl: 'https://example.com/pic.jpg', workspace: '/Demo/Images' })
    ).rejects.toThrow('Failed to fetch image from URL');
  });
});

describe('uploadImageFromStory', () => {
  beforeEach(() => {
    mockPutNode.mockReset();
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns false when the story has no figureUrl', async () => {
    const result = await uploadImageFromStory({ id: 'story-1', tgtWorkspace: '/Demo/Imports' });
    expect(result).toBe(false);
  });

  it('uploads the image derived from figureUrl', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/png' },
    });
    mockPutNode.mockResolvedValue({ node: { familyRef: 'fam-img-2' } });

    const result = await uploadImageFromStory({
      id: 'story-1',
      figureUrl: 'https://example.com/photos/sunset.png',
      tgtWorkspace: '/Demo/Imports',
    });

    expect(result).toEqual({ node: { familyRef: 'fam-img-2' } });
    const [{ requestBody }] = mockPutNode.mock.calls[0];
    expect(requestBody).toContain('filename="sunset.png"');
    expect(requestBody).toContain('"workFolder":"/Demo/Imports"');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run lib/integrations/populator/__tests__/images.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/lib/integrations/populator/images.ts web/lib/integrations/populator/__tests__/images.test.ts
git commit -m "feat: port populator image upload helpers"
```

## Task 4: `web/lib/integrations/populator/service.ts` — story creation + population

**Files:**
- Modify: `web/package.json` (add `dayjs` dependency)
- Create: `web/lib/integrations/populator/service.ts`
- Test: `web/lib/integrations/populator/__tests__/service.test.ts`

Port of `src/stories-populator.js`: `getCreationOptions`, `getOptionsFromData`, `newNodeFromStory` (translate branch removed — always uses `getOptionsFromData`), `populateNeonInstance`. `translateStory`/`testStoryTranslations` (DeepL) are dropped per the approved spec; no `deepl-node` dependency added.

**Deliberate deviations from the original (documented):**
- `newNodeFromStory` is refactored from the `new Promise(async (resolve, reject) => ...)` antipattern to plain `async`/`await`, using `throw`/`return null` instead of `reject`/`resolve` — same external contract (a rejected promise on creation failure, `null` on content-update failure, `familyRef` on success).
- `story.mainImageReference = mainImageReference ?? undefined` (was `... : null`) — `BodyGeneratorOptions.mainImageReference` is `string | undefined`, not nullable; `undefined` and `null` are equally falsy everywhere this value is read.
- `populateNeonInstance` no longer sets `story.translate` (dead now that the translate branch is removed) and uses a local `createdIds` array via a `for...of` loop instead of the module-level mutable `createdIds` + `.reduce(Promise...)` chain.

- [ ] **Step 1: Add the `dayjs` dependency**

Run: `cd web && npm install dayjs`
Expected: `web/package.json` gains `"dayjs": "^1.x.x"` under `dependencies`, `web/package-lock.json` updates.

- [ ] **Step 2: Write `web/lib/integrations/populator/service.ts`**

```typescript
/**
 * Populator service: creates Neon story nodes from generic story data,
 * ported from src/stories-populator.js.
 */
import dayjs from 'dayjs';
import {
  removeNonAlphanumeric,
  removeATags,
  bodyGenerator,
  metadataGenerator,
  normalizePrincipals,
} from '../../core/utils';
import type { BodyGeneratorOptions, MetadataGeneratorOptions } from '../../core/utils';
import {
  createNewStory,
  updateNodeContent,
  updateNodeMetadata,
  unlockNode,
  deleteNode,
  promoteNode,
  promoteNodeEverywhere,
} from '../../core/neon-bo-api-v3';
import type { CreateNewStoryOptions } from '../../core/neon-bo-api-v3';
import { workflowTransitionTo } from '../../core/neon-utils';
import { uploadImageFromStory, mainImageReferenceGenerator } from './images';

export interface StoryInput {
  id?: string;
  title?: string;
  language?: string;
  translation?: string;
  type?: string;
  tgtWorkspace?: string;
  tgtSite?: string;
  tgtSection?: string;
  siteAsChannel?: boolean;
  mainContentHtml?: string;
  mainImageReference?: string;
  figureUrl?: string;
  figureCaption?: string;
  figureCredit?: string;
  overhead?: string;
  headline?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions;
  assignTo?: unknown;
  neon?: { workspace?: string };
}

export function getCreationOptions(itemData: StoryInput): CreateNewStoryOptions {
  const issueDate = dayjs().format('YYYYMMDD');
  const language = itemData.language;
  const translation = itemData.translation;

  const cleanedUpTitle = removeNonAlphanumeric(itemData.id || itemData.title) || '';
  const fileName = `${cleanedUpTitle}_${translation || language}.xml`;

  const type = itemData.type || 'article';

  const options: CreateNewStoryOptions = {
    type,
    name: fileName,
    template: 'story.xml',
    issueDate,
    workFolder: itemData.tgtWorkspace,
    creationMode: 'AUTO_RENAME',
    timeSuffix: false,
    storageFolder: 'SELECTED_WORKFOLDER',
  };

  if (itemData.siteAsChannel) {
    options.outputChannel = itemData.tgtSite;
  } else {
    options.edition = 'English-US';
  }

  return options;
}

export function getOptionsFromData(itemData: StoryInput): BodyGeneratorOptions {
  const mainContentHtml = itemData.mainContentHtml?.replaceAll('<br>', '<br />');
  const textHtml = removeATags(mainContentHtml) ?? undefined;

  return {
    mainImageReference: itemData.mainImageReference,
    caption: itemData.figureCaption,
    credit: itemData.figureCredit,
    overhead: itemData.overhead,
    headline: itemData.headline,
    summary: itemData.summary,
    byline: itemData.byline,
    textHtml,
  };
}

export async function newNodeFromStory(story: StoryInput, publishStory = true): Promise<string | null> {
  const creationOptions = getCreationOptions(story);
  const node = await createNewStory(creationOptions);
  const familyRef = node.familyRef;

  if (!familyRef) {
    throw new Error(`Story node creation failed for "${story.title || story.id}"`);
  }

  const imageUpload = await uploadImageFromStory(story);
  const mainImageReference = imageUpload && imageUpload.node ? mainImageReferenceGenerator(imageUpload.node) : null;
  story.mainImageReference = mainImageReference ?? undefined;

  const bodyOptions = getOptionsFromData(story);
  const principals = normalizePrincipals(story.assignTo);

  console.log(`Created new node with ID ${familyRef}`);
  const updateStatus = await updateNodeContent(familyRef, bodyGenerator(bodyOptions));
  await updateNodeMetadata(familyRef, metadataGenerator(story.metadata));

  if (!updateStatus) {
    console.warn(`Error during content Update, deletion of ${familyRef} in progress...`);
    await deleteNode(familyRef, true);
    return null;
  }

  await unlockNode(familyRef);
  await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', principals });

  if (publishStory) {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready', principals });
    console.log(`${familyRef} updated successfully!`);
    await promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
    await promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
  } else {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision', principals });
  }

  return familyRef;
}

export interface PopulateOptions {
  site: string;
  workspace: string;
  section?: string;
  language?: string;
  siteAsChannel?: boolean;
  type?: string;
  directPublish?: boolean;
}

export async function populateNeonInstance(data: StoryInput[], options: PopulateOptions): Promise<string[] | string> {
  if (!options.site || !options.workspace) {
    const noOptsError = 'No options provided! {site, workspace}';
    console.log(noOptsError);
    return noOptsError;
  }

  const createdIds: string[] = [];

  for (const story of data) {
    console.log(story.id || story.title);

    story.tgtSite = options.site;
    story.tgtWorkspace = options.workspace;
    story.tgtSection = options.section;
    story.language = options.language;
    story.siteAsChannel = options.siteAsChannel;
    story.type = options.type || 'article';

    const familyRef = await newNodeFromStory(story, options.directPublish);
    if (familyRef) {
      createdIds.push(familyRef);
    }
  }

  return createdIds;
}
```

- [ ] **Step 3: Write `web/lib/integrations/populator/__tests__/service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreationOptions, getOptionsFromData, newNodeFromStory, populateNeonInstance } from '../service';
import {
  createNewStory,
  updateNodeContent,
  updateNodeMetadata,
  unlockNode,
  deleteNode,
  promoteNode,
  promoteNodeEverywhere,
} from '../../../core/neon-bo-api-v3';
import { workflowTransitionTo } from '../../../core/neon-utils';
import { uploadImageFromStory, mainImageReferenceGenerator } from '../images';

vi.mock('../../../core/neon-bo-api-v3', () => ({
  createNewStory: vi.fn(),
  updateNodeContent: vi.fn(),
  updateNodeMetadata: vi.fn(),
  unlockNode: vi.fn(),
  deleteNode: vi.fn(),
  promoteNode: vi.fn(),
  promoteNodeEverywhere: vi.fn(),
}));
vi.mock('../../../core/neon-utils', () => ({
  workflowTransitionTo: vi.fn(),
}));
vi.mock('../images', () => ({
  uploadImageFromStory: vi.fn(),
  mainImageReferenceGenerator: vi.fn(),
}));

const mocks = {
  createNewStory: createNewStory as unknown as ReturnType<typeof vi.fn>,
  updateNodeContent: updateNodeContent as unknown as ReturnType<typeof vi.fn>,
  updateNodeMetadata: updateNodeMetadata as unknown as ReturnType<typeof vi.fn>,
  unlockNode: unlockNode as unknown as ReturnType<typeof vi.fn>,
  deleteNode: deleteNode as unknown as ReturnType<typeof vi.fn>,
  promoteNode: promoteNode as unknown as ReturnType<typeof vi.fn>,
  promoteNodeEverywhere: promoteNodeEverywhere as unknown as ReturnType<typeof vi.fn>,
  workflowTransitionTo: workflowTransitionTo as unknown as ReturnType<typeof vi.fn>,
  uploadImageFromStory: uploadImageFromStory as unknown as ReturnType<typeof vi.fn>,
  mainImageReferenceGenerator: mainImageReferenceGenerator as unknown as ReturnType<typeof vi.fn>,
};

describe('getCreationOptions', () => {
  it('builds an edition-based filename when siteAsChannel is falsy', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en' });
    expect(options.name).toBe('my-story_en.xml');
    expect(options.edition).toBe('English-US');
    expect(options.outputChannel).toBeUndefined();
    expect(options.issueDate).toMatch(/^\d{8}$/);
  });

  it('sets outputChannel when siteAsChannel is true', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en', siteAsChannel: true, tgtSite: 'theglobe' });
    expect(options.outputChannel).toBe('theglobe');
    expect(options.edition).toBeUndefined();
  });

  it('prefers translation over language in the filename when present', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en', translation: 'fr' });
    expect(options.name).toBe('my-story_fr.xml');
  });
});

describe('getOptionsFromData', () => {
  it('converts <br> to self-closing and strips <a> tags', () => {
    const options = getOptionsFromData({
      mainContentHtml: '<p>Hello<br>World <a href="x">link</a></p>',
      figureCaption: 'cap',
      figureCredit: 'cred',
    });
    expect(options.textHtml).toBe('<p>Hello<br />World link</p>');
    expect(options.caption).toBe('cap');
    expect(options.credit).toBe('cred');
  });
});

describe('newNodeFromStory', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createNewStory.mockResolvedValue({ familyRef: 'fam-1' });
    mocks.uploadImageFromStory.mockResolvedValue(false);
    mocks.updateNodeContent.mockResolvedValue(true);
    mocks.updateNodeMetadata.mockResolvedValue(true);
  });

  it('throws when story creation does not return a familyRef', async () => {
    mocks.createNewStory.mockResolvedValue({ familyRef: '' });

    await expect(newNodeFromStory({ id: 'story-1' })).rejects.toThrow('Story node creation failed');
  });

  it('publishes via Edit -> Ready and promotes when publishStory is true', async () => {
    const familyRef = await newNodeFromStory({ id: 'story-1', tgtSite: 'theglobe', tgtSection: '/news' }, true);

    expect(familyRef).toBe('fam-1');
    expect(mocks.unlockNode).toHaveBeenCalledWith('fam-1');
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ familyRef: 'fam-1', targetStateName: 'Edit' })
    );
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ familyRef: 'fam-1', targetStateName: 'Ready' })
    );
    expect(mocks.promoteNode).toHaveBeenCalledWith('fam-1', { targetSite: 'theglobe', targetSection: '/news', mode: 'LIVE' });
    expect(mocks.promoteNodeEverywhere).toHaveBeenCalledWith('fam-1', { mode: 'LIVE' });
  });

  it('transitions to Revision and does not promote when publishStory is false', async () => {
    await newNodeFromStory({ id: 'story-1' }, false);

    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Edit' })
    );
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Revision' })
    );
    expect(mocks.workflowTransitionTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Ready' })
    );
    expect(mocks.promoteNode).not.toHaveBeenCalled();
  });

  it('deletes the node and returns null when content update fails', async () => {
    mocks.updateNodeContent.mockResolvedValue(false);

    const result = await newNodeFromStory({ id: 'story-1' }, true);

    expect(result).toBeNull();
    expect(mocks.deleteNode).toHaveBeenCalledWith('fam-1', true);
    expect(mocks.unlockNode).not.toHaveBeenCalled();
  });

  it('sets mainImageReference from the uploaded image when present', async () => {
    mocks.uploadImageFromStory.mockResolvedValue({ node: { familyRef: 'fam-img-1', workspaceLinkInfo: { workspaceUriPath: '/img' } } });
    mocks.mainImageReferenceGenerator.mockReturnValue('/img?uuid=fam-img-1');

    const story = { id: 'story-1', figureUrl: 'https://example.com/a.jpg' };
    await newNodeFromStory(story, true);

    expect(story.mainImageReference).toBe('/img?uuid=fam-img-1');
  });
});

describe('populateNeonInstance', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createNewStory.mockResolvedValue({ familyRef: 'fam-1' });
    mocks.uploadImageFromStory.mockResolvedValue(false);
    mocks.updateNodeContent.mockResolvedValue(true);
    mocks.updateNodeMetadata.mockResolvedValue(true);
  });

  it('returns an error string when site or workspace is missing', async () => {
    const result = await populateNeonInstance([], { site: '', workspace: '' });
    expect(result).toBe('No options provided! {site, workspace}');
  });

  it('creates a node per story and collects the familyRefs', async () => {
    mocks.createNewStory
      .mockResolvedValueOnce({ familyRef: 'fam-1' })
      .mockResolvedValueOnce({ familyRef: 'fam-2' });

    const result = await populateNeonInstance(
      [{ id: 'story-1' }, { id: 'story-2' }],
      { site: 'theglobe', workspace: '/Demo/Imports', directPublish: false }
    );

    expect(result).toEqual(['fam-1', 'fam-2']);
    expect(mocks.createNewStory).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run lib/integrations/populator/__tests__/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/integrations/populator/service.ts web/lib/integrations/populator/__tests__/service.test.ts
git commit -m "feat: port populator story creation service"
```

## Task 5: `web/lib/integrations/delayed-importer/service.ts` — delayed importer job scheduler

**Files:**
- Create: `web/lib/integrations/delayed-importer/service.ts`
- Test: `web/lib/integrations/delayed-importer/__tests__/service.test.ts`

Direct port of `src/delayed-importer.js` (263 lines): `validatePayload`, `createJob`, `getJob`, `listJobs`, `cancelJob`, `dispatchStoryItem`, `dispatchImageItem`, `_reset`, the in-memory `jobs` Map, `setTimeout`-based scheduler, and the 1-hour eviction of finished jobs. Same in-memory/no-persistence model as the original. `test/delayed-importer.test.js`'s `node:test` + `t.mock.timers` tests are ported to vitest's `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync()`.

- [ ] **Step 1: Write `web/lib/integrations/delayed-importer/service.ts`**

```typescript
/**
 * Delayed Importer — simulates a content feed into Neon.
 * Accepts a batch of items (stories/images) and imports them one at a time,
 * spread evenly over a caller-supplied timespan, into a target workfolder.
 *
 * In-memory only: jobs are lost on server restart (documented limitation).
 * Ported from src/delayed-importer.js.
 */
import crypto from 'crypto';
import dayjs from 'dayjs';
import * as storiesPopulator from '../populator/service';
import * as imagesImporter from '../populator/images';
import { getImageNameFromUrl } from '../../core/utils';
import type { MetadataGeneratorOptions } from '../../core/utils';
import type { PutNodeResponse } from '../../core/neon-bo-api-v3';
import type { ImageMetadata } from '../populator/images';

export type ItemType = 'story' | 'image';

export interface JobItem {
  type: ItemType;
  title?: string;
  content?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions & ImageMetadata;
  url?: string;
  name?: string;
  workfolder?: string;
  assignTo?: string | string[];
}

export interface DelayedImportPayload {
  duration: number;
  site: string;
  workspace: string;
  workfolder?: string;
  assignTo?: string | string[];
  publish?: boolean;
  items: JobItem[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ITEM_TYPES: ItemType[] = ['story', 'image'];

export function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Missing request body' };
  }
  const payload = body as Partial<DelayedImportPayload>;

  if (typeof payload.duration !== 'number' || !(payload.duration > 0)) {
    return { valid: false, error: 'duration must be a number of minutes greater than 0' };
  }
  if (!payload.site || typeof payload.site !== 'string') {
    return { valid: false, error: 'site is required' };
  }
  if (!payload.workspace || typeof payload.workspace !== 'string') {
    return { valid: false, error: 'workspace is required' };
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { valid: false, error: 'items must be a non-empty array' };
  }
  if (payload.assignTo !== undefined && !isValidAssignTo(payload.assignTo)) {
    return { valid: false, error: 'assignTo must be a string or an array of strings' };
  }

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i] as Partial<JobItem> | null;
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `items[${i}]: must be an object` };
    }
    if (!item.type || !ITEM_TYPES.includes(item.type)) {
      return { valid: false, error: `items[${i}]: type must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.assignTo !== undefined && !isValidAssignTo(item.assignTo)) {
      return { valid: false, error: `items[${i}]: assignTo must be a string or an array of strings` };
    }
    if (item.type === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.type === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
  }
  return { valid: true };
}

function isValidAssignTo(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.length > 0);
}

export interface JobResult {
  index: number;
  type: ItemType;
  status: 'ok' | 'error';
  familyRef?: string | null;
  error?: string;
  at: string;
}

export type JobState = 'running' | 'completed' | 'cancelled';

interface Job {
  jobId: string;
  state: JobState;
  site: string;
  workspace: string;
  workfolder: string | null;
  assignTo: string | string[] | null;
  publish: boolean;
  items: JobItem[];
  intervalMs: number;
  startedAt: string;
  estimatedEndAt: string;
  nextFireAt: string | null;
  results: JobResult[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface PublicJob {
  jobId: string;
  state: JobState;
  done: number;
  total: number;
  errors: number;
  intervalMs: number;
  startedAt: string;
  estimatedEndAt: string;
  nextFireAt: string | null;
  results: JobResult[];
}

export interface JobSummary {
  jobId: string;
  state: JobState;
  done: number;
  total: number;
  nextFireAt: string | null;
}

export interface SubmitResponse {
  jobId: string;
  itemCount: number;
  intervalMs: number;
  estimatedEndAt: string;
}

export interface DispatchOutcome {
  familyRef: string | null;
}

export type DispatchFn = (item: JobItem, job: Job) => Promise<DispatchOutcome>;

export interface Dispatchers {
  dispatchStory: DispatchFn;
  dispatchImage: DispatchFn;
}

export interface CreateJobDeps {
  dispatchStory?: DispatchFn;
  dispatchImage?: DispatchFn;
}

const EVICTION_MS = 60 * 60 * 1000; // finished jobs evicted after 1 hour

const jobs = new Map<string, Job>();

function resolveWorkfolder(item: JobItem, job: Job): string | undefined {
  return item.workfolder || job.workfolder || job.workspace;
}

function resolveAssignTo(item: JobItem, job: Job): string | string[] | undefined {
  return item.assignTo || job.assignTo || undefined;
}

function publicJob(job: Job): PublicJob {
  return {
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    errors: job.results.filter((r) => r.status === 'error').length,
    intervalMs: job.intervalMs,
    startedAt: job.startedAt,
    estimatedEndAt: job.estimatedEndAt,
    nextFireAt: job.nextFireAt,
    results: job.results,
  };
}

function finishJob(job: Job, state: JobState): void {
  job.state = state;
  job.nextFireAt = null;
  if (job.timer) clearTimeout(job.timer);
  job.timer = null;
  const evictionTimer = setTimeout(() => jobs.delete(job.jobId), EVICTION_MS);
  evictionTimer.unref?.();
}

async function runTick(job: Job, index: number, deps: Dispatchers): Promise<void> {
  if (job.state !== 'running') return;

  const item = job.items[index];
  try {
    const dispatch = item.type === 'story' ? deps.dispatchStory : deps.dispatchImage;
    const outcome = await dispatch(item, job);
    job.results.push({
      index,
      type: item.type,
      status: 'ok',
      familyRef: outcome?.familyRef || null,
      at: new Date().toISOString(),
    });
    console.log(`delayed-import ${job.jobId}: item ${index} (${item.type}) imported`);
  } catch (error) {
    console.error(`❌ delayed-import ${job.jobId}: item ${index} (${item.type}) failed: ${(error as Error).message}`);
    job.results.push({
      index,
      type: item.type,
      status: 'error',
      error: (error as Error).message,
      at: new Date().toISOString(),
    });
  }

  if (job.state !== 'running') return; // cancelled while dispatching

  const next = index + 1;
  if (next >= job.items.length) {
    finishJob(job, 'completed');
    console.log(`delayed-import ${job.jobId}: completed (${job.results.length} items)`);
    return;
  }
  job.nextFireAt = new Date(Date.now() + job.intervalMs).toISOString();
  job.timer = setTimeout(() => void runTick(job, next, deps), job.intervalMs);
}

/**
 * Story item -> storiesPopulator.newNodeFromStory.
 * Deliberately does NOT copy item.type onto the story: getCreationOptions
 * uses story.type as the Neon node type and must default to 'article'.
 * No figureUrl / language: image upload no-ops.
 */
export async function dispatchStoryItem(
  item: JobItem,
  job: Job,
  populator: Pick<typeof storiesPopulator, 'newNodeFromStory'> = storiesPopulator
): Promise<DispatchOutcome> {
  const story: storiesPopulator.StoryInput = {
    title: item.title,
    headline: item.title,
    summary: item.summary || '',
    byline: item.byline || '',
    mainContentHtml: item.content,
    metadata: item.metadata,
    tgtSite: job.site,
    tgtWorkspace: resolveWorkfolder(item, job),
    assignTo: resolveAssignTo(item, job),
  };
  const familyRef = await populator.newNodeFromStory(story, job.publish);
  return { familyRef: familyRef || null };
}

/** Image item -> imagesImporter.uploadImage. Image fetched live at tick time. */
export async function dispatchImageItem(
  item: JobItem,
  job: Job,
  importer: Pick<typeof imagesImporter, 'uploadImage'> = imagesImporter
): Promise<DispatchOutcome> {
  const imageName = item.name || getImageNameFromUrl(item.url || '') || `image-${Date.now()}`;
  const node = (await importer.uploadImage({
    imageName,
    imageUrl: item.url || '',
    workspace: resolveWorkfolder(item, job),
    metadata: item.metadata,
  })) as PutNodeResponse & { familyRef?: string };
  const familyRef = node?.node?.familyRef || node?.familyRef || null;
  return { familyRef };
}

/**
 * Schedules a new job. Payload must already be validated with validatePayload.
 * `deps` is for tests only — production callers use the default dispatchers.
 * Returns the submit response: { jobId, itemCount, intervalMs, estimatedEndAt }.
 */
export function createJob(body: DelayedImportPayload, deps: CreateJobDeps = {}): SubmitResponse {
  const dispatchers: Dispatchers = {
    dispatchStory: deps.dispatchStory || dispatchStoryItem,
    dispatchImage: deps.dispatchImage || dispatchImageItem,
  };

  const itemCount = body.items.length;
  const intervalMs = Math.round((body.duration * 60000) / itemCount);
  const jobId = `dlyimp-${dayjs().format('YYYYMMDD')}-${crypto.randomBytes(3).toString('hex')}`;
  const now = Date.now();

  const job: Job = {
    jobId,
    state: 'running',
    site: body.site,
    workspace: body.workspace,
    workfolder: body.workfolder || null,
    assignTo: body.assignTo || null,
    publish: body.publish === true,
    items: body.items,
    intervalMs,
    startedAt: new Date(now).toISOString(),
    estimatedEndAt: new Date(now + intervalMs * (itemCount - 1)).toISOString(),
    nextFireAt: new Date(now).toISOString(),
    results: [],
    timer: null,
  };
  jobs.set(jobId, job);

  // first item fires immediately (next tick, after the 202 is sent)
  job.timer = setTimeout(() => void runTick(job, 0, dispatchers), 0);

  return { jobId, itemCount, intervalMs, estimatedEndAt: job.estimatedEndAt };
}

export function getJob(jobId: string): PublicJob | null {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function listJobs(): JobSummary[] {
  return Array.from(jobs.values()).map((job) => ({
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    nextFireAt: job.nextFireAt,
  }));
}

/**
 * Returns null if unknown, { error } if already finished,
 * otherwise the cancelled job snapshot. Imported items are not rolled back.
 */
export function cancelJob(jobId: string): PublicJob | { error: string } | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.state !== 'running') return { error: 'Job already finished' };
  finishJob(job, 'cancelled');
  console.log(`delayed-import ${jobId}: cancelled after ${job.results.length} items`);
  return publicJob(job);
}

/** Test helper: clears all jobs and pending timers. */
export function _reset(): void {
  for (const job of jobs.values()) {
    if (job.timer) clearTimeout(job.timer);
  }
  jobs.clear();
}
```

- [ ] **Step 2: Write `web/lib/integrations/delayed-importer/__tests__/service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validatePayload,
  createJob,
  getJob,
  listJobs,
  cancelJob,
  dispatchStoryItem,
  dispatchImageItem,
  _reset,
  type DelayedImportPayload,
  type JobItem,
} from '../service';

function basePayload(overrides: Partial<DelayedImportPayload> = {}): DelayedImportPayload {
  return {
    duration: 1,
    site: 'demo-site',
    workspace: 'Demo Workspace',
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'story', title: 'B', content: '<p>b</p>' },
      { type: 'story', title: 'C', content: '<p>c</p>' },
    ],
    ...overrides,
  };
}

describe('validatePayload', () => {
  it('accepts a valid mixed payload', () => {
    const payload = basePayload({
      items: [
        { type: 'story', title: 'A', content: '<p>a</p>' },
        { type: 'image', url: 'https://example.com/pic.jpg' },
      ],
    });
    expect(validatePayload(payload)).toEqual({ valid: true });
  });

  it('rejects missing body', () => {
    expect(validatePayload(null).valid).toBe(false);
  });

  it('rejects bad duration', () => {
    for (const duration of [undefined, 0, -5, 'ten']) {
      const result = validatePayload(basePayload({ duration: duration as unknown as number }));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/duration/);
    }
  });

  it('rejects missing site or workspace', () => {
    expect(validatePayload(basePayload({ site: undefined as unknown as string })).error).toMatch(/site/);
    expect(validatePayload(basePayload({ workspace: undefined as unknown as string })).error).toMatch(/workspace/);
  });

  it('rejects empty or missing items', () => {
    expect(validatePayload(basePayload({ items: [] })).valid).toBe(false);
    expect(validatePayload(basePayload({ items: undefined as unknown as JobItem[] })).valid).toBe(false);
  });

  it('rejects invalid item type with index in the message', () => {
    const payload = basePayload({
      items: [
        { type: 'story', title: 'A', content: '<p>a</p>' },
        { type: 'video' as unknown as 'story', url: 'https://example.com/x' },
      ],
    });
    const result = validatePayload(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/items\[1\]/);
  });

  it('accepts assignTo as string or array, job-level and per-item', () => {
    expect(validatePayload(basePayload({ assignTo: '62038d84-f161-3579-a5f1-7aba053f999a' }))).toEqual({ valid: true });
    expect(validatePayload(basePayload({ assignTo: ['62038d84-f161-3579-a5f1-7aba053f999a', 'jane.doe'] }))).toEqual({
      valid: true,
    });
    expect(
      validatePayload(basePayload({ items: [{ type: 'story', title: 'A', content: '<p>a</p>', assignTo: 'jane.doe' }] }))
    ).toEqual({ valid: true });
  });

  it('rejects invalid assignTo', () => {
    expect(validatePayload(basePayload({ assignTo: '' })).error).toMatch(/assignTo/);
    expect(validatePayload(basePayload({ assignTo: [] })).error).toMatch(/assignTo/);
    expect(validatePayload(basePayload({ assignTo: 123 as unknown as string })).error).toMatch(/assignTo/);
    expect(
      validatePayload(basePayload({ items: [{ type: 'story', title: 'A', content: '<p>a</p>', assignTo: 5 as unknown as string }] }))
        .error
    ).toMatch(/items\[0\]: assignTo/);
  });

  it('enforces per-type required fields', () => {
    expect(validatePayload(basePayload({ items: [{ type: 'story', content: '<p>a</p>' } as JobItem] })).error).toMatch(
      /items\[0\].*title/
    );
    expect(validatePayload(basePayload({ items: [{ type: 'story', title: 'A' } as JobItem] })).error).toMatch(
      /items\[0\].*content/
    );
    expect(validatePayload(basePayload({ items: [{ type: 'image' } as JobItem] })).error).toMatch(/items\[0\].*url/);
  });
});

describe('createJob scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
  });

  it('fires the first item immediately, then one per interval, then completes', async () => {
    const calls: string[] = [];
    const deps = {
      dispatchStory: async (item: JobItem) => {
        calls.push(item.title!);
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    expect(submitted.jobId).toMatch(/^dlyimp-\d{8}-[0-9a-f]{6}$/);
    expect(submitted.itemCount).toBe(3);
    expect(submitted.intervalMs).toBe(20000); // 1 min / 3 items
    expect(submitted.estimatedEndAt).toBeTruthy();

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['A']);

    const running = getJob(submitted.jobId)!;
    expect(running.state).toBe('running');
    expect(running.done).toBe(1);
    expect(running.total).toBe(3);
    expect(running.nextFireAt).toBeTruthy();
    expect(running.results[0].status).toBe('ok');
    expect(running.results[0].familyRef).toBe('ref-A');

    await vi.advanceTimersByTimeAsync(20000);
    await vi.advanceTimersByTimeAsync(20000);

    expect(calls).toEqual(['A', 'B', 'C']);
    const finished = getJob(submitted.jobId)!;
    expect(finished.state).toBe('completed');
    expect(finished.done).toBe(3);
    expect(finished.nextFireAt).toBeNull();
  });

  it('records per-item errors and continues the job', async () => {
    const deps = {
      dispatchStory: async (item: JobItem) => {
        if (item.title === 'B') throw new Error('neon exploded');
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20000);
    await vi.advanceTimersByTimeAsync(20000);

    const job = getJob(submitted.jobId)!;
    expect(job.state).toBe('completed');
    expect(job.done).toBe(3);
    expect(job.errors).toBe(1);
    expect(job.results[1].status).toBe('error');
    expect(job.results[1].error).toBe('neon exploded');
  });

  it('cancelJob stops pending ticks and keeps completed results', async () => {
    const calls: string[] = [];
    const deps = {
      dispatchStory: async (item: JobItem) => {
        calls.push(item.title!);
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = cancelJob(submitted.jobId) as { state: string; done: number };
    expect(snapshot.state).toBe('cancelled');
    expect(snapshot.done).toBe(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toEqual(['A']); // no further dispatches

    expect(cancelJob(submitted.jobId)).toEqual({ error: 'Job already finished' });
  });

  it('getJob and cancelJob return null for an unknown job', () => {
    expect(getJob('nope')).toBeNull();
    expect(cancelJob('nope')).toBeNull();
  });

  it('listJobs returns summaries without a results array', async () => {
    const deps = { dispatchStory: async () => ({ familyRef: 'x' }) };
    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);

    const list = listJobs();
    expect(list).toHaveLength(1);
    expect(list[0].jobId).toBe(submitted.jobId);
    expect(list[0].state).toBe('running');
    expect(list[0].done).toBe(1);
    expect(list[0].total).toBe(3);
    expect((list[0] as unknown as { results?: unknown }).results).toBeUndefined();
  });

  it('routes image items to dispatchImage', async () => {
    const types: string[] = [];
    const deps = {
      dispatchStory: async () => {
        types.push('story');
        return { familyRef: 's' };
      },
      dispatchImage: async () => {
        types.push('image');
        return { familyRef: 'i' };
      },
    };
    const payload = basePayload({
      items: [
        { type: 'image', url: 'https://example.com/a.jpg' },
        { type: 'story', title: 'A', content: '<p>a</p>' },
      ],
    });
    createJob(payload, deps);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30000);
    expect(types).toEqual(['image', 'story']);
  });
});

describe('dispatchStoryItem', () => {
  it('maps item fields to the populator story shape', async () => {
    let received: { story: unknown; publish: boolean } | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown, publish?: boolean) => {
        received = { story, publish: publish ?? true };
        return 'fam-1';
      },
    };
    const job = {
      site: 'demo-site',
      workspace: 'Demo Workspace',
      workfolder: '/Demo/Imports',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];
    const item: JobItem = {
      type: 'story',
      title: 'Headline',
      content: '<p>body</p>',
      summary: 'Standfirst',
      byline: 'Jane Doe',
      metadata: { seoTitle: 'seo' },
    };

    const out = await dispatchStoryItem(item, job, fakePopulator);

    expect(out.familyRef).toBe('fam-1');
    expect(received?.publish).toBe(false);
    const story = received?.story as Record<string, unknown>;
    expect(story.title).toBe('Headline');
    expect(story.headline).toBe('Headline');
    expect(story.mainContentHtml).toBe('<p>body</p>');
    expect(story.summary).toBe('Standfirst');
    expect(story.byline).toBe('Jane Doe');
    expect(story.metadata).toEqual({ seoTitle: 'seo' });
    expect(story.tgtSite).toBe('demo-site');
    expect(story.tgtWorkspace).toBe('/Demo/Imports');
    expect(story.type).toBeUndefined();
    expect(story.figureUrl).toBeUndefined();
  });

  it('lets item.workfolder override job.workfolder', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = { site: 's', workspace: 'ws', workfolder: '/job-wf', publish: false } as Parameters<
      typeof dispatchStoryItem
    >[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c', workfolder: '/item-wf' }, job, fakePopulator);
    expect(received?.tgtWorkspace).toBe('/item-wf');
  });

  it('passes job-level assignTo through to the populator', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = {
      site: 's',
      workspace: 'ws',
      workfolder: null,
      assignTo: '62038d84-f161-3579-a5f1-7aba053f999a',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c' }, job, fakePopulator);
    expect(received?.assignTo).toBe('62038d84-f161-3579-a5f1-7aba053f999a');
  });

  it('lets item.assignTo override job.assignTo', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = {
      site: 's',
      workspace: 'ws',
      workfolder: null,
      assignTo: '62038d84-f161-3579-a5f1-7aba053f999a',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c', assignTo: 'jane.doe' }, job, fakePopulator);
    expect(received?.assignTo).toBe('jane.doe');
  });
});

describe('dispatchImageItem', () => {
  it('maps item to uploadImage options with a workspace fallback', async () => {
    let received: Record<string, unknown> | undefined;
    const fakeImporter = {
      uploadImage: async (options: unknown) => {
        received = options as Record<string, unknown>;
        return { node: { familyRef: 'img-1' } };
      },
    };
    const job = { site: 's', workspace: 'Demo Workspace', workfolder: null, publish: false } as Parameters<
      typeof dispatchImageItem
    >[1];
    const item: JobItem = {
      type: 'image',
      url: 'https://example.com/photos/sunset.jpg',
      metadata: { caption: 'A sunset', credit: 'Jane' },
    };

    const out = await dispatchImageItem(item, job, fakeImporter);

    expect(out.familyRef).toBe('img-1');
    expect(received?.imageUrl).toBe('https://example.com/photos/sunset.jpg');
    expect(received?.workspace).toBe('Demo Workspace'); // job.workfolder null -> workspace fallback
    expect(received?.imageName).toBe('sunset.jpg'); // derived via getImageNameFromUrl
    expect(received?.metadata).toEqual({ caption: 'A sunset', credit: 'Jane' });
  });

  it('lets an explicit name win over the derived name', async () => {
    let received: Record<string, unknown> | undefined;
    const fakeImporter = {
      uploadImage: async (options: unknown) => {
        received = options as Record<string, unknown>;
        return {};
      },
    };
    const job = { site: 's', workspace: 'ws', workfolder: null, publish: false } as Parameters<
      typeof dispatchImageItem
    >[1];

    const out = await dispatchImageItem(
      { type: 'image', url: 'https://example.com/a.jpg', name: 'custom-name' },
      job,
      fakeImporter
    );
    expect(received?.imageName).toBe('custom-name');
    expect(out.familyRef).toBeNull(); // uploadImage returned no familyRef
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run lib/integrations/delayed-importer/__tests__/service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/lib/integrations/delayed-importer/service.ts web/lib/integrations/delayed-importer/__tests__/service.test.ts
git commit -m "feat: port delayed importer job scheduler"
```

## Task 6: `web/app/api/in/delayed-import/**/route.ts` — API routes

**Files:**
- Create: `web/app/api/in/delayed-import/route.ts`
- Create: `web/app/api/in/delayed-import/[jobId]/route.ts`
- Test: `web/app/api/in/delayed-import/__tests__/route.test.ts`

Thin Next.js adapters over `web/lib/integrations/delayed-importer/service.ts`. No manual auth — `web/proxy.ts` already gates all `/api/:path*` on `apikey`. This replaces the old Fastify handlers in `src/requestHandlers/neon-delayed-import.js`, which called `authenticate()` per handler.

- `POST /api/in/delayed-import` → `validatePayload` (400 on invalid) → `createJob` → 202 with `{ jobId, itemCount, intervalMs, estimatedEndAt }`
- `GET /api/in/delayed-import` → 200 `{ jobs: [...] }` (via `listJobs`)
- `GET /api/in/delayed-import/[jobId]` → 200 job snapshot via `getJob`, or 404 `{ error: 'Job not found' }`
- `DELETE /api/in/delayed-import/[jobId]` → 200 cancelled snapshot via `cancelJob`, 404 `{ error: 'Job not found' }` if unknown, 409 `{ error: 'Job already finished' }` if already finished

- [ ] **Step 1: Write `web/app/api/in/delayed-import/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validatePayload, createJob, listJobs } from '../../../../lib/integrations/delayed-importer/service';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const validation = validatePayload(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = createJob(body);
  return NextResponse.json(result, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
```

- [ ] **Step 2: Write `web/app/api/in/delayed-import/[jobId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getJob, cancelJob } from '../../../../../lib/integrations/delayed-importer/service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const result = cancelJob(jobId);

  if (result === null) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if ('error' in result) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Write `web/app/api/in/delayed-import/__tests__/route.test.ts`**

```typescript
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
      items: [{ type: 'story', title: 'A', content: '<p>a</p>' }],
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
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run app/api/in/delayed-import/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/api/in/delayed-import
git commit -m "feat: add delayed-import API routes"
```

## Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd web && npx vitest run`
Expected: all existing (77) + new tests pass (Tasks 1-6 add tests for `neon-bo-api-v3`, `neon-utils`, populator `images`/`service`, `delayed-importer/service`, and the delayed-import routes).

- [ ] **Step 2: Lint and build**

Run: `cd web && npm run lint && npm run build`
Expected: both clean (no errors, no new warnings).

- [ ] **Step 3: Manual smoke test (request shaping)**

With the dev server running (`cd web && npm run dev`) and `NEON_EXT_APIKEY` set:

```bash
curl -i -X POST -H "apikey: $NEON_EXT_APIKEY" -H "Content-Type: application/json" \
  -d '{"duration":1,"site":"demo-site","workspace":"Demo Workspace","items":[{"type":"story","title":"Test Story","content":"<p>Hello</p>"}]}' \
  http://localhost:3000/api/in/delayed-import
```

Expected: `202` with a JSON body containing `jobId`, `itemCount`, `intervalMs`, `estimatedEndAt`.

```bash
curl -i -H "apikey: $NEON_EXT_APIKEY" http://localhost:3000/api/in/delayed-import/<jobId>
```

Expected: `200` with the job snapshot (`state`, `done`, `total`, `results`, ...).

If `NEON_BO_URL`/`NEON_BO_APIKEY` are not configured locally, the scheduled tick will fail when `NeonClient.makeRequest` can't connect — the job's `results[0].status` will be `"error"`. This is expected and matches the old Fastify app's behavior (the spec documents this as acceptable for request-shaping verification); the 202/200 response shapes themselves are what this step verifies.

- [ ] **Step 4: Confirm the existing Fastify app is untouched**

Run: `git status` and `git diff --stat main -- src/`
Expected: no changes under `src/` — the Fastify app (`main`/`render`) remains deployable as-is.

---
