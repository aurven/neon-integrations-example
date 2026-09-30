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
      { method: 'post', url: `/workflow/instance/task/nextStepAssignment?objRef=${familyRef}`, data: options },
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
