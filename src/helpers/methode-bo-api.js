const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

/**
 * Méthode BO API Client - Refactored for better session management and less repetition
 * 
 * Features:
 * - Multiple concurrent sessions support
 * - Reduced code repetition with generic request handler
 * - Better error handling and logging
 * - Simplified structure
 */

class MethodeClient {
    constructor(options = {}) {
        this.server = options.server || process.env.EDAPI_SERVER;
        this.restEndpoint = options.restEndpoint || process.env.EDAPI_REST_ENDPOINT;
        this.baseUrl = this.server + this.restEndpoint;
        this.connectionId = options.connectionId || process.env.EDAPI_CONNECTIONID;
        this.databaseId = options.databaseId || process.env.EDAPI_DATABASEID;
        this.sessionId = options.sessionId || `methode-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Create individual cookie jar for this session
        this.jar = new CookieJar();
        
        // Configure conditional SSL handling for local development
        if (process.env.NEON_EXT_LOCATION === 'Local') {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        
        // Create client with session-specific cookie jar
        this.client = wrapper(axios.create({ jar: this.jar }));
        this.isLoggedIn = false;
        this.currentToken = null;
        
        console.log(`📱 Méthode Client initialized [${this.sessionId}]`);
    }

    /**
     * Generic request handler to reduce repetition
     */
    async makeRequest(config, successMessage = null, returnData = false) {
        const requestConfig = {
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                ...config.headers
            },
            maxBodyLength: Infinity,
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
    async login({ username, password }) {
        if (this.isLoggedIn) {
            console.log(`⚠️ [${this.sessionId}] Already logged in`);
            return this.currentToken;
        }

        const authPayload = {
            applicationId: 'neonToMethodeApp',
            connectionId: this.connectionId,
            username,
            password,
            options: {
                showJSON: false,
                showUserInfo: false,
            },
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: '/v3/auth/login',
                data: authPayload
            }, null, true);

            const token = response.result.token.value;
            this.currentToken = token;
            this.isLoggedIn = true;
            this.username = username;
            
            console.log(`🔐 [${this.sessionId}] Authenticated as ${username}. Token: ${token.substring(0, 8)}...`);
            return token;
        } catch (error) {
            console.error(`Authentication failed for ${username}:`, error.message);
            throw error;
        }
    }

    async logout() {
        if (!this.isLoggedIn) {
            console.log(`⚠️ [${this.sessionId}] Not logged in`);
            return;
        }

        try {
            await this.makeRequest({
                method: 'get',
                url: '/v3/auth/logout'
            }, 'Session terminated');

            this.isLoggedIn = false;
            this.currentToken = null;
            this.username = null;
        } catch (error) {
            console.error('Error during logout:', error.message);
            // Reset state even if logout fails
            this.isLoggedIn = false;
            this.currentToken = null;
            this.username = null;
        }
    }

    /**
     * Object Management
     */
    async getObjects(loids) {
        if (!Array.isArray(loids) || loids.length === 0) {
            throw new Error('loids must be a non-empty array');
        }

        const options = {
            sources: loids,
            options: {
                showAdditionalInfo: true,
                showSystemAttributes: true,
                showAttributes: true,
                showUsageTickets: true,
                showVirtualAttributes: true,
                showXml: true,
                showJson: true,
                showUniquenessString: true,
                showPath: true,
            },
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: '/v3/object',
                data: options
            }, `Fetched ${loids.length} object(s)`, true);

            return response.result;
        } catch (error) {
            console.error('Get objects failed:', error.message);
            throw error;
        }
    }

    async getObject(loid) {
        if (!loid) {
            throw new Error('loid is required');
        }

        const objectsInfo = await this.getObjects([loid]);
        return objectsInfo?.items?.[0] || null;
    }

    async getObjectLinked(id, roleType = null) {
        if (!id) {
            throw new Error('id parameter is required');
        }

        // Build query parameters
        const queryParams = new URLSearchParams({ id });
        if (roleType) {
            queryParams.append('roleType', roleType);
        }

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: `/object/linked?${queryParams}`
            }, `Fetched linked objects for ID: ${id}${roleType ? ` with role type: ${roleType}` : ''}`, true);

            return response.result || response;
        } catch (error) {
            console.error(`Get object linked failed for ID ${id}:`, error.message);
            throw error;
        }
    }

    async createObject(form) {
        if (!form || typeof form.getHeaders !== 'function') {
            throw new Error('form must be a FormData object');
        }

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: '/v3/object/create',
                headers: {
                    ...form.getHeaders()
                },
                data: form,
                maxContentLength: Infinity
            }, null, true);

            const objectLoid = response.result.id;
            console.log(`📄 [${this.sessionId}] Created object with LOID: ${objectLoid}`);
            return response.result;
        } catch (error) {
            console.error('Object creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Story Management
     */
    async createStory({ name, issueDate, channel, template, workFolder, attributes = null }) {
        if (!name || !issueDate || !template || !workFolder) {
            console.log('Missing parameters:', { name, issueDate, channel, template, workFolder });
            throw new Error('Missing required parameters: name, issueDate, channel, template, workFolder');
        }

        const options = {
            name,
            workFolder,
            issueDate,
            attributes,
            type: 'EOM::CompoundStory',
            application: 'neonToMethodeApp',
            databaseId: this.databaseId,
            edition: '',
            product: channel,
            options: {
                showSystemAttribute: true,
                showPath: true,
                createMode: 'NEW_VERSION',
                useDefaultProduct: false,
                issueDateDefaultStrategy: 'CALENDAR',
                timeSuffix: false,
                checkinAction: true,
                unlock: true,
                keepCheckedOut: false
            }
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: `/v3/object/create/from/template/path?path=${encodeURIComponent(template)}`,
                data: options
            }, null, true);

            const storyLoid = response.result.id;
            console.log(`📰 [${this.sessionId}] Created story '${name}' with LOID: ${storyLoid}`);
            return storyLoid;
        } catch (error) {
            console.error(`Story creation failed for '${name}':`, error.message);
            throw error;
        }
    }

    /**
     * Content Management
     */
    async readContent(token, loid) {
        if (!token || !loid) {
            throw new Error('Both token and loid are required');
        }

        try {
            // Use direct axios for this endpoint as it may not need session cookies
            const response = await axios.get(`${this.baseUrl}/v3/object/loid/content`, {
                params: {
                    loid,
                    showDtd: true,
                    token
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`📖 [${this.sessionId}] Read content for LOID: ${loid}`);
            return response.data;
        } catch (error) {
            console.error(`Read content failed for LOID ${loid}:`, error.message);
            throw error;
        }
    }

    async getBinaryContent(loid, format = 'lowres', maxSize = 4) {
        if (!loid) {
            throw new Error('loid is required');
        }

        // Build query parameters
        const queryParams = new URLSearchParams({ maxSize: maxSize.toString() });

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: `/v3/object/${loid}/content/${format}?${queryParams}`,
                responseType: 'arraybuffer'
            }, `Fetched ${format} content for LOID: ${loid}`, false);

            console.log(`🖼️ [${this.sessionId}] Retrieved ${format} content for LOID: ${loid} with maxSize: ${maxSize}`);
            return response.data;
        } catch (error) {
            console.error(`Get ${format} content failed for LOID ${loid}:`, error.message);
            throw error;
        }
    }

    async putContentToStory(loid, content) {
        if (!loid || !content) {
            throw new Error('Both loid and content are required');
        }

        const queryParams = new URLSearchParams({
            loid,
            checkIn: 'true',
            checkOut: 'true',
            keepCheckedOut: 'false',
            checkOutClean: 'false'
        });

        try {
            await this.makeRequest({
                method: 'put',
                url: `/v3/object/loid/content?${queryParams}`,
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                data: content
            }, `Content updated for LOID: ${loid}`);

            return true;
        } catch (error) {
            console.error(`Content update failed for LOID ${loid}:`, error.message);
            throw error;
        }
    }

    /**
     * Shape and Preview Management
     */
    async getStoryShape(loid, options = {}) {
        if (!loid) {
            throw new Error('loid is required');
        }

        // Build query parameters object, only including non-empty values
        const queryParams = {};
        if (options.channel) queryParams.channel = options.channel;
        if (options.workFolder) queryParams.workFolder = options.workFolder;
        if (options.pageId) queryParams.pageId = options.pageId;

        // Convert to URL search params if any parameters exist
        const queryString = Object.keys(queryParams).length > 0 
            ? '?' + new URLSearchParams(queryParams).toString()
            : '';

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: `/v3/shape/story/${loid}${queryString}`
            }, `Fetched story shape for LOID: ${loid}`, true);

            return response.result;
        } catch (error) {
            console.error(`Get story shape failed for LOID ${loid}:`, error.message);
            throw error;
        }
    }

    async createChannelCopy(loid, channel = 'Tabloid', inheritFrom = 'Neutral') {
        if (!loid) {
            throw new Error('loid is required');
        }

        const payload = {
            showAdditionalInfo: true,
            showPath: true,
            showSystemAttributes: true,
            showAttributes: true,
            showUsageTickets: true,
            showVirtualAttributes: true,
            showXml: true,
            showUniquenessString: true,
            checkIn: true,
            unlock: true,
            channel,
            inheritFrom,
            source: loid,
            keepCheckedOut: false
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: `/v3/container/bundle/${loid}/channelcopy`,
                data: payload
            }, `Channel copy created for LOID: ${loid} (channel: ${channel})`, true);

            return response.result || response;
        } catch (error) {
            console.error(`Create channel copy failed for LOID ${loid}:`, error.message);
            throw error;
        }
    }

    async sendMessage({ subject, body, recipients, priority = '1', attachments = [] }) {
        if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0) {
            throw new Error('subject, body, and recipients are required');
        }

        const payload = { subject, body, recipients, priority, attachments };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: '/message',
                data: payload
            }, `Message sent to: ${recipients.join(', ')}`, true);

            return response.result || response;
        } catch (error) {
            console.error('Send message failed:', error.message);
            throw error;
        }
    }

    async createStoryPreview(id, payload, getPdf = false) {
        if (!id || !payload) {
            throw new Error('id and payload are required');
        }

        // Build query parameters
        const queryParams = new URLSearchParams({
            id,
            getPdf: getPdf.toString()
        });

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: `/v3/printService/createStoryPreview?${queryParams}`,
                data: payload
            }, `Story preview created for ID: ${id}`, true);

            return response.result || response;
        } catch (error) {
            console.error(`Create story preview failed for ID ${id}:`, error.message);
            throw error;
        }
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

    getCurrentToken() {
        return this.currentToken;
    }

    getCurrentUser() {
        return this.username;
    }

    getConnectionId() {
        return this.connectionId;
    }

    getDatabaseId() {
        return this.databaseId;
    }

    /**
     * Cleanup
     */
    async cleanup() {
        if (this.isLoggedIn) {
            await this.logout();
        }
        console.log(`🧹 [${this.sessionId}] Méthode client cleaned up`);
    }
}

/**
 * Session Manager for handling multiple concurrent Méthode sessions
 */
class MethodeSessionManager {
    constructor() {
        this.sessions = new Map();
    }

    createSession(sessionId = null, options = {}) {
        const id = sessionId || `methode-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const client = new MethodeClient({ ...options, sessionId: id });
        this.sessions.set(id, client);
        console.log(`🚀 Méthode Session Manager: Created session [${id}]`);
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
            console.log(`🗑️ Méthode Session Manager: Removed session [${sessionId}]`);
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
        console.log('🧹 Méthode Session Manager: All sessions cleaned up');
    }

    getActiveSessionsCount() {
        return Array.from(this.sessions.values()).filter(session => session.isSessionActive()).length;
    }

    /**
     * Helper method to create and login a session in one call
     */
    async createAndLogin({ username, password, sessionId = null, ...options }) {
        const client = this.createSession(sessionId, options);
        await client.login({ username, password });
        return client;
    }
}

/**
 * Backwards compatibility - Default single session instance
 */
const defaultClient = new MethodeClient();

// Create session manager instance
const sessionManager = new MethodeSessionManager();

module.exports = {
    // New API
    MethodeClient,
    MethodeSessionManager,
    sessionManager,

    // Backwards compatibility - delegate to default client
    login: (credentials) => defaultClient.login(credentials),
    logout: () => defaultClient.logout(),
    getObjects: (loids) => defaultClient.getObjects(loids),
    getObject: (loid) => defaultClient.getObject(loid),
    getObjectLinked: (id, roleType) => defaultClient.getObjectLinked(id, roleType),
    createStory: (options) => defaultClient.createStory(options),
    createObject: (form) => defaultClient.createObject(form),
    readContent: (token, loid) => defaultClient.readContent(token, loid),
    getBinaryContent: (loid, format, maxSize) => defaultClient.getBinaryContent(loid, format, maxSize),
    putContentToStory: (loid, content) => defaultClient.putContentToStory(loid, content),
    getStoryShape: (loid, options) => defaultClient.getStoryShape(loid, options),
    createStoryPreview: (id, payload, getPdf) => defaultClient.createStoryPreview(id, payload, getPdf),
    createChannelCopy: (loid, channel, inheritFrom) => defaultClient.createChannelCopy(loid, channel, inheritFrom),
    sendMessage: (options) => defaultClient.sendMessage(options)
};