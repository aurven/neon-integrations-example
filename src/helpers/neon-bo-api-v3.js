const axios = require('axios');
const fs = require('fs');
const path = require('path');

const NEON_CALLS_LOG_DIR = path.join(process.cwd(), 'logs', 'neon-calls');

// Caller name = first NeonClient.* frame above makeRequest in the stack
function getCallerName() {
    const stack = new Error().stack?.split('\n') || [];
    const frame = stack.find(line => line.includes('NeonClient.') && !line.includes('makeRequest') && !line.includes('getCallerName'));
    const match = frame?.match(/NeonClient\.(\w+)/);
    return match ? match[1] : 'unknown';
}

function logNeonCall({ callerName, requestConfig, response, error }) {
    if (process.env.NEON_EXT_LOCATION !== 'Local') return;

    try {
        fs.mkdirSync(NEON_CALLS_LOG_DIR, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${timestamp}_${callerName}.json`;

        const entry = {
            caller: callerName,
            timestamp: new Date().toISOString(),
            request: {
                method: requestConfig.method,
                url: requestConfig.url,
                baseURL: requestConfig.baseURL,
                params: requestConfig.params,
                data: requestConfig.data
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
        this.baseUrl = options.baseUrl || process.env.NEON_BO_URL;
        this.apiKey = options.apiKey || process.env.NEON_BO_APIKEY;
        this.userApiKey = options.userApiKey || process.env.NEON_USER_API_KEY;
        this.updateContextId = `neon-integration-${Date.now()}`;

        if (process.env.NEON_EXT_LOCATION === 'Local') {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }

        this.client = axios.create();
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

        try {
            const response = await this.client.request(requestConfig);
            if (successMessage) {
                console.log(`✅ ${successMessage}`);
            }
            logNeonCall({ callerName, requestConfig, response });
            return returnData ? response.data : response;
        } catch (error) {
            const errorMsg = `❌ ${config.method?.toUpperCase() || 'REQUEST'} ${config.url} failed: ${error.response?.status || error.code}`;
            console.error(errorMsg);
            if (error.response?.data) {
                console.error('Error details:', JSON.stringify(error.response.data, null, 2));
            }
            logNeonCall({ callerName, requestConfig, error });
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

    async unlockNode(familyRef, unlockMode = 'MAJOR') {
        return await this.makeRequest({
            method: 'put',
            url: `/contents/nodes/unlock?unlockMode=${unlockMode}`,
            data: [familyRef]
        }, `Node ${familyRef} unlocked`);
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

    async getWorkflowDefinitions() {
        try {
            return await this.makeRequest({
                method: 'get',
                url: '/workflow/definitions'
            }, 'Workflow definitions retrieved', true);
        } catch (error) {
            console.warn(`⚠️ getWorkflowDefinitions(): endpoint unavailable (${error.response?.status || error.code}), returning stub`);
            // TODO: remove stub when a real workflow-list endpoint is confirmed on this Neon BO version
            return {
                workflows: [
                    { name: 'Story/Created'   },
                    { name: 'Story/Edit'      },
                    { name: 'Story/Ready'     },
                    { name: 'Story/Published' },
                    { name: 'Story/Archived'  }
                ]
            };
        }
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
}

const defaultClient = new NeonClient();

module.exports = {
    NeonClient,

    // Flat API delegating to default client
    getNode: (familyRef) => defaultClient.getNode(familyRef),
    getNodeMetadata: (familyRef) => defaultClient.getNodeMetadata(familyRef),
    deleteNode: (familyRef, force) => defaultClient.deleteNode(familyRef, force),
    lockNode: (familyRef) => defaultClient.lockNode(familyRef),
    unlockNode: (familyRef, unlockMode) => defaultClient.unlockNode(familyRef, unlockMode),
    updateNodeContent: (familyRef, xmlBodyString) => defaultClient.updateNodeContent(familyRef, xmlBodyString),
    updateNodeMetadata: (familyRef, xmlBodyString) => defaultClient.updateNodeMetadata(familyRef, xmlBodyString),
    createNewStory: (options) => defaultClient.createNewStory(options),
    putNode: (params) => defaultClient.putNode(params),
    getSites: () => defaultClient.getSites(),
    createNewSiteNode: (options, realm) => defaultClient.createNewSiteNode(options, realm),
    publishSiteNode: (options, realm, viewStatus) => defaultClient.publishSiteNode(options, realm, viewStatus),
    createUser: (options) => defaultClient.createUser(options),
    getUsers: () => defaultClient.getUsers(),
    getGroups: () => defaultClient.getGroups(),
    addUserToGroup: (userId, groupName) => defaultClient.addUserToGroup(userId, groupName),
    createGroup: (options) => defaultClient.createGroup(options),
    updateGroup: (options) => defaultClient.updateGroup(options),
    updateWorkspace: (params) => defaultClient.updateWorkspace(params),
    updateWorkspaceTemplates: (params) => defaultClient.updateWorkspaceTemplates(params),
    createBasefolder: (options) => defaultClient.createBasefolder(options),
    getNextSteps: (familyRef) => defaultClient.getNextSteps(familyRef),
    nextStepAssignment: (familyRef, options) => defaultClient.nextStepAssignment(familyRef, options),
    getWorkflowDefinitions: () => defaultClient.getWorkflowDefinitions(),
    getContentTypesConfig: () => defaultClient.getContentTypesConfig(),
    promoteNode: (familyRef, params) => defaultClient.promoteNode(familyRef, params),
    promoteNodeEverywhere: (familyRef, params) => defaultClient.promoteNodeEverywhere(familyRef, params),
    discoveryServices: () => defaultClient.discoveryServices(),
    searchContents: (queryPayload, numberOfNodes, numberOfIds) => defaultClient.searchContents(queryPayload, numberOfNodes, numberOfIds),
    getMetricsReports: () => defaultClient.getMetricsReports(),
    getMetricsData: (reportId, queryParams) => defaultClient.getMetricsData(reportId, queryParams)
};
