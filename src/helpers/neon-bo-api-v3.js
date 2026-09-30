const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const context = require('./neon-env/context.js');

const NEON_CALLS_LOG_DIR = path.join(process.cwd(), 'logs', 'neon-calls');

// Caller name = first NeonClient.* frame above makeRequest in the stack
function getCallerName() {
    const stack = new Error().stack?.split('\n') || [];
    const frame = stack.find(line => line.includes('NeonClient.') && !line.includes('makeRequest') && !line.includes('getCallerName'));
    const match = frame?.match(/NeonClient\.(\w+)/);
    return match ? match[1] : 'unknown';
}

function logNeonCall({ callerName, requestConfig, response, error, envId }) {
    if (process.env.NEON_EXT_LOCATION !== 'Local') return;

    try {
        fs.mkdirSync(NEON_CALLS_LOG_DIR, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${envId}_${timestamp}_${callerName}.json`;

        const entry = {
            env: envId,
            caller: callerName,
            timestamp: new Date().toISOString(),
            request: {
                method: requestConfig.method,
                url: requestConfig.url,
                baseURL: requestConfig.baseURL,
                params: requestConfig.params,
                data: requestConfig.data,
                updateContextId: requestConfig.headers?.['update-context-id']
            },
            response: response ? {
                status: response.status,
                data: response.data
            } : null,
            error: error ? {
                status: error.response?.status,
                code: error.code,
                data: error.response?.data
            } : null
        };

        fs.writeFileSync(path.join(NEON_CALLS_LOG_DIR, filename), JSON.stringify(entry, null, 2));
    } catch (logError) {
        console.warn(`⚠️ Failed to write Neon call log: ${logError.message}`);
    }
}

class NeonClient {
    constructor(options = {}) {
        // Explicit baseUrl = caller-managed client (tests/tools); otherwise bind to the request's env
        const env = options.env || (options.baseUrl ? null : context.requireEnv());
        this.envId = env?.id || 'custom';
        this.baseUrl = options.baseUrl || env?.neon.bo.url;
        this.apiKey = options.apiKey || env?.neon.bo.apiKey;
        this.userApiKey = options.userApiKey || env?.neon.bo.userApiKey;
        this.updateContextId = `neon-integration-${Date.now()}`;

        const insecure = options.insecureTls ?? env?.neon.insecureTls ?? false;
        this.client = axios.create(insecure ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {});
    }

    async makeRequest(config, successMessage = null, returnData = false) {
        const { headers: configHeaders, ...restConfig } = config;
        const requestConfig = {
            ...restConfig,
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'neon-bo-access-key': this.apiKey,
                'Authorization': `Bearer api:${this.userApiKey}`,
                'update-context-id': this.updateContextId,
                ...configHeaders
            }
        };

        const callerName = getCallerName();

        console.log(`➡️  [env=${this.envId}] ${config.method?.toUpperCase() || 'REQUEST'} ${config.url} called by ${callerName} with config:`, '\n', JSON.stringify({ baseURL: this.baseUrl, ...restConfig }, null, 2));

        try {
            const response = await this.client.request(requestConfig);
            if (successMessage) {
                console.log(`✅ ${successMessage}`);
            }
            logNeonCall({ callerName, requestConfig, response, envId: this.envId });
            return returnData ? response.data : response;
        } catch (error) {
            const errorMsg = `❌ ${config.method?.toUpperCase() || 'REQUEST'} ${config.url} failed: ${error.response?.status || error.code}`;
            console.error(errorMsg);
            if (error.response?.data) {
                console.error('Error details:', JSON.stringify(error.response.data, null, 2));
            }
            logNeonCall({ callerName, requestConfig, error, envId: this.envId });
            throw error;
        }
    }

    async getNode(familyRef) {
        return await this.makeRequest({
            method: 'get',
            url: `/contents/nodes/${familyRef}`
        }, `Node ${familyRef} retrieved`, true);
    }

    async getNodeMetadata(familyRef) {
        return await this.makeRequest({
            method: 'get',
            url: `/contents/nodes/${familyRef}/metadata`,
        }, `Node metadata for ${familyRef} retrieved`, true);
    }

    async deleteNode(familyRef, force = false) {
        return await this.makeRequest({
            method: 'delete',
            url: `/contents/nodes?familyRefs=${familyRef}&unpublish=${force}`
        }, `Node ${familyRef} deleted`);
    }

    async lockNode(familyRef) {
        return await this.makeRequest({
            method: 'put',
            url: '/contents/nodes/lock',
            data: [familyRef]
        }, `Node ${familyRef} locked`, true);
    }

    async unlockNode(familyRef, unlockMode = 'MAJOR', force = false, updateContextId = null) {
        const originalContextId = this.updateContextId;
        if (updateContextId) this.updateContextId = updateContextId;
        try {
            return await this.makeRequest({
                method: 'put',
                url: `/contents/nodes/unlock?unlockMode=${unlockMode}${force ? '&force=true' : ''}`,
                data: [familyRef]
            }, `Node ${familyRef} unlocked`);
        } finally {
            this.updateContextId = originalContextId;
        }
    }

    async updateNodeContent(familyRef, xmlBodyString) {
        const result = await this.makeRequest({
            method: 'put',
            url: `/contents/story/${familyRef}?saveMode=UPDATE_ONLY&keepCheckedout=false`,
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'text/xml'
            },
            data: xmlBodyString
        }, `Node content for ${familyRef} updated`);
        return !!result;
    }

    async updateNodeMetadata(familyRef, xmlBodyString) {
        const result = await this.makeRequest({
            method: 'put',
            url: `/contents/nodes/${familyRef}/metadata`,
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'text/xml'
            },
            data: xmlBodyString
        }, `Node metadata for ${familyRef} updated`);
        return !!result;
    }

    async searchContents(queryPayload, numberOfNodes = 0, numberOfIds = 10) {
        return await this.makeRequest({
            method: 'post',
            url: `/contents/search?numberOfNodes=${numberOfNodes}&numberOfIds=${numberOfIds}`,
            data: queryPayload
        }, `Content search completed`, true);
    }

    async createNewStory(options) {
        const response = await this.makeRequest({
            method: 'post',
            url: '/contents/story',
            data: options
        }, null, true);
        const { node } = response;
        console.log(`📝 Created new Story: ${node.familyRef}`);
        return node;
    }

    async putNode({ boundary, requestBody }) {
        return await this.makeRequest({
            method: 'put',
            url: '/contents/nodes',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            data: requestBody
        }, 'Asset uploaded', true);
    }

    async getSites() {
        const response = await this.makeRequest({
            method: 'get',
            url: '/core/sites'
        }, 'Sites retrieved', true);
        return response.result;
    }

    async createNewSiteNode(options, realm = 'default') {
        const response = await this.makeRequest({
            method: 'post',
            url: `/core/sites/nodes/create?realm=${realm}`,
            data: options
        }, null, true);
        console.log(`🏗️ Created new Site! Id: ${response.id}`);
        return response.id;
    }

    async publishSiteNode(options, realm = 'default', viewStatus = 'LIVE') {
        return await this.makeRequest({
            method: 'post',
            url: `/core/sites/nodes/publish?realm=${realm}&viewStatus=${viewStatus}`,
            data: options
        }, 'Site Node published', true);
    }

    async createUser(options) {
        return await this.makeRequest({
            method: 'post',
            url: '/directory/users/create',
            data: options
        }, 'New user created', true);
    }

    async getUsers() {
        return await this.makeRequest({
            method: 'get',
            url: '/directory/users?limit=100'
        }, 'Users retrieved', true);
    }

    async getGroups() {
        try {
            return await this.makeRequest({
                method: 'get',
                url: '/directory/groups?limit=100'
            }, 'Groups retrieved', true);
        } catch (error) {
            console.warn(`⚠️ getGroups(): endpoint unavailable (${error.response?.status || error.code}), returning stub`);
            // TODO: remove stub when /directory/groups is confirmed available on this Neon BO version
            return {
                groups: [
                    { name: 'editors',      realm: 'default' },
                    { name: 'admins',       realm: 'default' },
                    { name: 'contributors', realm: 'default' },
                    { name: 'readers',      realm: 'default' }
                ]
            };
        }
    }

    async addUserToGroup(userId, groupName) {
        return await this.makeRequest({
            method: 'post',
            url: '/directory/users/groups/add?realm=default',
            data: { id: userId, group: groupName }
        }, `User ${userId} added to ${groupName}`);
    }

    async createGroup(options) {
        return await this.makeRequest({
            method: 'post',
            url: '/directory/groups/create',
            data: options
        }, 'New group created', true);
    }

    async updateGroup(options) {
        return await this.makeRequest({
            method: 'post',
            url: '/directory/groups/update',
            data: options
        }, 'Group updated', true);
    }

    async updateWorkspace({ parentWorkspaceName, targetWorkspaceId, options }) {
        return await this.makeRequest({
            method: 'put',
            url: `/contents/folders/config/${parentWorkspaceName}/${targetWorkspaceId}`,
            data: options
        }, 'Workspace updated', true);
    }

    async updateWorkspaceTemplates({ targetWorkspaceId, options }) {
        return await this.makeRequest({
            method: 'put',
            url: `/contents/folders/templates/${targetWorkspaceId}`,
            data: options
        }, 'Workspace templates updated', true);
    }

    async createBasefolder(options) {
        return await this.makeRequest({
            method: 'post',
            url: '/contents/folders',
            data: options
        }, 'Base folder created', true);
    }

    async getNextSteps(familyRef) {
        if (!familyRef) return null;
        return await this.makeRequest({
            method: 'get',
            url: `/contents/nodes/${familyRef}/workflow/nextsteps`
        }, `Got next workflow steps for ${familyRef}`);
    }

    async nextStepAssignment(familyRef, options) {
        if (!familyRef) return null;
        return await this.makeRequest({
            method: 'post',
            url: `/workflow/instance/task/nextStepAssignment?objRef=${familyRef}`,
            data: options
        }, `Assigned new workflow step to ${familyRef}`);
    }

    async getWorkflowGraph(name, version) {
        const params = { name };
        if (version != null) params.version = version;
        return await this.makeRequest({
            method: 'get',
            url: '/workflow/process/graph',
            params
        }, `Workflow graph for "${name}" retrieved`, true);
    }

    async getContentTypesConfig() {
        try {
            return await this.makeRequest({
                method: 'get',
                url: '/contents/types'
            }, 'Content types config retrieved', true);
        } catch (error) {
            console.warn(`⚠️ getContentTypesConfig(): endpoint unavailable (${error.response?.status || error.code}), returning stub`);
            // TODO: remove stub when the real content-types-config endpoint is confirmed on this Neon BO version
            return {
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
                                contentType: 'gallery'
                            }
                        }
                    }
                }
            };
        }
    }

    async promoteNode(familyRef, { targetSite, targetSection, mode = 'PREVIEW' }) {
        if (!familyRef) return null;
        const siteDetails = [{ siteName: targetSite, sitePath: targetSection }];
        try {
            return await this.makeRequest({
                method: 'post',
                url: `/contents/nodes/${familyRef}/promote/${mode}`,
                data: { siteDetails }
            }, `Node ${familyRef} promoted to ${targetSite}${targetSection}`, true);
        } catch (error) {
            return error.response?.data || null;
        }
    }

    async promoteNodeEverywhere(familyRef, { mode = 'PREVIEW' }) {
        if (!familyRef) return null;
        return await this.makeRequest({
            method: 'post',
            url: `/contents/nodes/${familyRef}/promote/${mode}`,
            data: {}
        }, `Node ${familyRef} promoted everywhere`, true);
    }

    async discoveryServices() {
        return await this.makeRequest({
            method: 'get',
            url: '/discovery/services'
        }, 'Discovery services retrieved', true);
    }

    async getMetricsReports() {
        return await this.makeRequest({
            method: 'get',
            url: '/core/metrics'
        }, 'Available metrics reports retrieved', true);
    }

    async getMetricsData(reportId, queryParams = {}) {
        if (!reportId) throw new Error('Report ID is required');
        return await this.makeRequest({
            method: 'get',
            url: `/core/metrics/${reportId}`,
            params: queryParams
        }, `Metrics data for ${reportId} retrieved`, true);
    }

    async getWorkfolders(types = []) {
        return await this.makeRequest({
            method: 'post',
            url: '/contents/conf/workfolder',
            data: { types }
        }, 'Workfolders retrieved', true);
    }

    async duplicateNode(familyRef, { name, workFolder, type, issueDate }) {
        if (!familyRef) throw new Error('familyRef is required');
        return await this.makeRequest({
            method: 'post',
            url: `/contents/nodes/${familyRef}/duplicate`,
            data: { name, workFolder, type, issueDate, retrieveOptions: {} }
        }, `Node ${familyRef} duplicated to ${workFolder}`, true);
    }
}

const clientCache = new Map();

function clientFor(env) {
    const cached = clientCache.get(env.id);
    if (cached && cached.envRef === env) return cached;
    const client = new NeonClient({ env });
    client.envRef = env;
    clientCache.set(env.id, client);
    return client;
}

function currentClient() {
    return clientFor(context.requireEnv());
}

module.exports = {
    NeonClient,
    clientFor,
    currentClient,

    // Flat API delegating to current client
    getNode: (familyRef) => currentClient().getNode(familyRef),
    getNodeMetadata: (familyRef) => currentClient().getNodeMetadata(familyRef),
    deleteNode: (familyRef, force) => currentClient().deleteNode(familyRef, force),
    lockNode: (familyRef) => currentClient().lockNode(familyRef),
    unlockNode: (familyRef, unlockMode, force, updateContextId) => currentClient().unlockNode(familyRef, unlockMode, force, updateContextId),
    updateNodeContent: (familyRef, xmlBodyString) => currentClient().updateNodeContent(familyRef, xmlBodyString),
    updateNodeMetadata: (familyRef, xmlBodyString) => currentClient().updateNodeMetadata(familyRef, xmlBodyString),
    createNewStory: (options) => currentClient().createNewStory(options),
    putNode: (params) => currentClient().putNode(params),
    getSites: () => currentClient().getSites(),
    createNewSiteNode: (options, realm) => currentClient().createNewSiteNode(options, realm),
    publishSiteNode: (options, realm, viewStatus) => currentClient().publishSiteNode(options, realm, viewStatus),
    createUser: (options) => currentClient().createUser(options),
    getUsers: () => currentClient().getUsers(),
    getGroups: () => currentClient().getGroups(),
    addUserToGroup: (userId, groupName) => currentClient().addUserToGroup(userId, groupName),
    createGroup: (options) => currentClient().createGroup(options),
    updateGroup: (options) => currentClient().updateGroup(options),
    updateWorkspace: (params) => currentClient().updateWorkspace(params),
    updateWorkspaceTemplates: (params) => currentClient().updateWorkspaceTemplates(params),
    createBasefolder: (options) => currentClient().createBasefolder(options),
    getNextSteps: (familyRef) => currentClient().getNextSteps(familyRef),
    nextStepAssignment: (familyRef, options) => currentClient().nextStepAssignment(familyRef, options),
    getWorkflowGraph: (name, version) => currentClient().getWorkflowGraph(name, version),
    getContentTypesConfig: () => currentClient().getContentTypesConfig(),
    promoteNode: (familyRef, params) => currentClient().promoteNode(familyRef, params),
    promoteNodeEverywhere: (familyRef, params) => currentClient().promoteNodeEverywhere(familyRef, params),
    discoveryServices: () => currentClient().discoveryServices(),
    searchContents: (queryPayload, numberOfNodes, numberOfIds) => currentClient().searchContents(queryPayload, numberOfNodes, numberOfIds),
    getMetricsReports: () => currentClient().getMetricsReports(),
    getMetricsData: (reportId, queryParams) => currentClient().getMetricsData(reportId, queryParams),
    getWorkfolders: (types) => currentClient().getWorkfolders(types),
    duplicateNode: (familyRef, payload) => currentClient().duplicateNode(familyRef, payload)
};
