const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

/**
 * Neon BO API Client v2 - Refactored for better session management and less repetition
 * 
 * Features:
 * - Multiple concurrent sessions support
 * - Reduced code repetition with generic request handler
 * - Better error handling and logging
 * - Simplified structure
 */

class NeonClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.NEON_BO_URL;
        this.username = options.username || process.env.NEON_USERNAME;
        this.password = options.password || process.env.NEON_PASSWORD;
        this.apiKey = options.apiKey || process.env.NEON_BO_APIKEY;
        this.sessionId = options.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create individual cookie jar for this session
        this.jar = new CookieJar();
        
        // Configure conditional SSL handling for local development
        if (process.env.NEON_EXT_LOCATION === 'Local') {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        
        // Create client with session-specific cookie jar
        this.client = wrapper(axios.create({ jar: this.jar }));
        this.isLoggedIn = false;
        
        console.log(`📱 Neon Client initialized [${this.sessionId}]`);
    }

    /**
     * Generic request handler to reduce repetition
     */
    async makeRequest(config, successMessage = null, returnData = false) {
        const requestConfig = {
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'neon-bo-access-key': this.apiKey,
                ...config.headers
            },
            ...config
        };

        try {
            const response = await this.client.request(requestConfig);
            
            if (successMessage) {
                console.log(`✅ [${this.sessionId}] ${successMessage}`);
            }
            
            return returnData ? response.data : response;
        } catch (error) {
            const errorMsg = `❌ [${this.sessionId}] ${config.method?.toUpperCase() || 'REQUEST'} ${config.url} failed: ${error.response?.status || error.code}`;
            console.error(errorMsg);
            
            if (error.response?.data) {
                console.error('Error details:', JSON.stringify(error.response.data, null, 2));
            }
            
            throw error;
        }
    }

    /**
     * Session Management
     */
    async login() {
        if (this.isLoggedIn) {
            console.log(`⚠️ [${this.sessionId}] Already logged in`);
            return;
        }

        const response = await this.makeRequest({
            method: 'post',
            url: '/directory/sessions/login?rememberMe=true',
            data: {
                name: this.username,
                password: this.password
            }
        }, null, true);

        const { user } = response;
        this.isLoggedIn = true;
        this.currentUser = user;
        
        console.log(`🔐 [${this.sessionId}] Logged in as ${user.name} [${user.id}]`);
        return user;
    }

    async logout(all = false) {
        if (!this.isLoggedIn) {
            console.log(`⚠️ [${this.sessionId}] Not logged in`);
            return;
        }

        await this.makeRequest({
            method: 'post',
            url: `/directory/sessions/logout?all=${all}`,
            data: {}
        }, `Session terminated`);

        this.isLoggedIn = false;
        this.currentUser = null;
    }

    /**
     * Node Operations
     */
    async getNode(familyRef) {
        return await this.makeRequest({
            method: 'get',
            url: `/contents/nodes/${familyRef}`
        }, `Node ${familyRef} retrieved successfully`, true);
    }

    async deleteNode(familyRef, force = false) {
        return await this.makeRequest({
            method: 'delete',
            url: `/contents/nodes?familyRefs=${familyRef}&unpublish=${force}`
        }, `Node ${familyRef} deleted successfully`);
    }

    async lockNode(familyRef) {
        return await this.makeRequest({
            method: 'put',
            url: '/contents/nodes/lock',
            data: [familyRef]
        }, `Node ${familyRef} locked successfully`, true);
    }

    async unlockNode(familyRef, unlockMode = 'MAJOR') {
        return await this.makeRequest({
            method: 'put',
            url: `/contents/nodes/unlock?unlockMode=${unlockMode}`,
            data: [familyRef]
        }, `Node ${familyRef} unlocked successfully`);
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
        }, `Node content for ${familyRef} updated successfully`);

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
        }, `Node metadata for ${familyRef} updated successfully`);

        return !!result;
    }

    async searchContents(queryPayload, numberOfNodes = 0, numberOfIds = 10) {
        return await this.makeRequest({
            method: 'post',
            url: `/contents/search?numberOfNodes=${numberOfNodes}&numberOfIds=${numberOfIds}`,
            data: queryPayload
        }, `Content search completed (${numberOfIds} ids requested)`, true);
    }

    /**
     * Content Creation
     */
    async createNewStory(options) {
        const response = await this.makeRequest({
            method: 'post',
            url: '/contents/story',
            data: options
        }, null, true);

        const { node } = response;
        console.log(`📝 [${this.sessionId}] Created new Story: ${node.familyRef}`);
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
        }, 'Asset uploaded successfully', true);
    }

    /**
     * Site Management
     */
    async getSites() {
        const response = await this.makeRequest({
            method: 'get',
            url: '/core/sites'
        }, 'Sites retrieved successfully', true);

        return response.result;
    }

    async createNewSiteNode(options, realm = 'default') {
        const response = await this.makeRequest({
            method: 'post',
            url: `/core/sites/nodes/create?realm=${realm}`,
            data: options
        }, null, true);

        console.log(`🏗️ [${this.sessionId}] Created new Site! Id: ${response.id}`);
        return response.id;
    }

    async publishSiteNode(options, realm = 'default', viewStatus = 'LIVE') {
        return await this.makeRequest({
            method: 'post',
            url: `/core/sites/nodes/publish?realm=${realm}&viewStatus=${viewStatus}`,
            data: options
        }, 'Site Node published successfully', true);
    }

    /**
     * User & Group Management
     */
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
            console.warn(`⚠️ [${this.sessionId}] getGroups(): endpoint unavailable (${error.response?.status || error.code}), returning stub`);
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

    /**
     * Workspace Management
     */
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

    /**
     * Workflow Management
     */
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
            console.warn(`⚠️ [${this.sessionId}] getWorkflowDefinitions(): endpoint unavailable (${error.response?.status || error.code}), returning stub`);
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

    /**
     * Promotion
     */
    async promoteNode(familyRef, { targetSite, targetSection, mode = 'PREVIEW' }) {
        if (!familyRef) return null;

        const siteDetails = [{
            siteName: targetSite,
            sitePath: targetSection
        }];

        try {
            const result = await this.makeRequest({
                method: 'post',
                url: `/contents/nodes/${familyRef}/promote/${mode}`,
                data: { siteDetails }
            }, `Node ${familyRef} promoted to ${targetSite}${targetSection}`, true);

            return result;
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

    /**
     * Discovery
     */
    async discoveryServices() {
        return await this.makeRequest({
            method: 'get',
            url: '/discovery/services'
        }, 'Discovery services retrieved', true);
    }

    /**
     * Metrics & Analytics
     */
    async getMetricsReports() {
        return await this.makeRequest({
            method: 'get',
            url: '/core/metrics'
        }, 'Available metrics reports retrieved', true);
    }

    async getMetricsData(reportId, queryParams = {}) {
        if (!reportId) {
            throw new Error('Report ID is required');
        }
        return await this.makeRequest({
            method: 'get',
            url: `/core/metrics/${reportId}`,
            params: queryParams
        }, `Metrics data for ${reportId} retrieved`, true);
    }

    /**
     * Session utilities
     */
    getSessionId() {
        return this.sessionId;
    }

    isSessionActive() {
        return this.isLoggedIn;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Cleanup
     */
    async cleanup() {
        if (this.isLoggedIn) {
            await this.logout();
        }
        console.log(`🧹 [${this.sessionId}] Client cleaned up`);
    }
}

/**
 * Session Manager for handling multiple concurrent sessions
 */
class NeonSessionManager {
    constructor() {
        this.sessions = new Map();
    }

    createSession(sessionId = null, options = {}) {
        const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const client = new NeonClient({ ...options, sessionId: id });
        this.sessions.set(id, client);
        console.log(`🚀 Session Manager: Created session [${id}]`);
        return client;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    async removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.cleanup();
            this.sessions.delete(sessionId);
            console.log(`🗑️ Session Manager: Removed session [${sessionId}]`);
        }
    }

    listSessions() {
        return Array.from(this.sessions.keys());
    }

    async cleanupAll() {
        for (const [sessionId, session] of this.sessions) {
            await session.cleanup();
            this.sessions.delete(sessionId);
        }
        console.log('🧹 Session Manager: All sessions cleaned up');
    }

    getActiveSessionsCount() {
        return Array.from(this.sessions.values()).filter(session => session.isSessionActive()).length;
    }
}

/**
 * Backwards compatibility - Default single session instance
 */
const defaultClient = new NeonClient();

// Create session manager instance
const sessionManager = new NeonSessionManager();

module.exports = {
    // New API
    NeonClient,
    NeonSessionManager,
    sessionManager,

    // Backwards compatibility - delegate to default client
    login: () => defaultClient.login(),
    logout: (all) => defaultClient.logout(all),
    getNode: (familyRef) => defaultClient.getNode(familyRef),
    deleteNode: (familyRef, force) => defaultClient.deleteNode(familyRef, force),
    lockNode: (familyRef) => defaultClient.lockNode(familyRef),
    unlockNode: (familyRef, unlockMode) => defaultClient.unlockNode(familyRef, unlockMode),
    updateNodeContent: (familyRef, xmlBodyString) => defaultClient.updateNodeContent(familyRef, xmlBodyString),
    updateNodeMetadata: (familyRef, xmlBodyString) => defaultClient.updateNodeMetadata(familyRef, xmlBodyString),
    createNewStory: (options) => defaultClient.createNewStory(options),
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
    putNode: (params) => defaultClient.putNode(params),
    promoteNode: (familyRef, params) => defaultClient.promoteNode(familyRef, params),
    promoteNodeEverywhere: (familyRef, params) => defaultClient.promoteNodeEverywhere(familyRef, params),
    discoveryServices: () => defaultClient.discoveryServices(),
    searchContents: (queryPayload, numberOfNodes, numberOfIds) => defaultClient.searchContents(queryPayload, numberOfNodes, numberOfIds),
    getMetricsReports: () => defaultClient.getMetricsReports(),
    getMetricsData: (reportId, queryParams) => defaultClient.getMetricsData(reportId, queryParams)
};