const {
    getConfig,
    getAvailableConfigs,
    loadFromCache,
    refreshAll,
    refreshConfig
} = require('../connectors/neon-config-connector');

const VALID_TYPES = ['usersGroups', 'workflows', 'contentTypes', 'workfolders'];

function buildStats(type, data) {
    if (type === 'usersGroups') {
        return {
            userCount:  Array.isArray(data.users)  ? data.users.length  : 0,
            groupCount: Array.isArray(data.groups) ? data.groups.length : 0
        };
    }
    if (type === 'workflows') {
        const wf = data.workflows || {};
        return { workflowCount: Object.keys(wf).length, workflows: Object.keys(wf) };
    }
    if (type === 'contentTypes') {
        return { typeCount: Array.isArray(data.types) ? data.types.length : 0 };
    }
    if (type === 'workfolders') {
        return { workfolderCount: Array.isArray(data.workfolders) ? data.workfolders.length : 0 };
    }
    return {};
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /neon/config
 * Lists all config types with cache status and stats.
 */
async function listConfigs(request, reply) {
    try {
        const available = getAvailableConfigs();
        const configs = {};

        for (const [type, meta] of Object.entries(available)) {
            try {
                const cached = await loadFromCache(type);
                configs[type] = {
                    ...meta,
                    cached:      !!cached,
                    lastUpdated: cached?.lastUpdated || null,
                    stats:       cached ? buildStats(type, cached) : null
                };
            } catch (_) {
                configs[type] = { ...meta, cached: false, lastUpdated: null, stats: null };
            }
        }

        return reply.send({ success: true, configs });
    } catch (error) {
        return reply.status(500).send({ success: false, error: error.message });
    }
}

/**
 * GET /neon/config/:type
 * Returns full cached data for a single config type.
 */
async function getConfigData(request, reply) {
    try {
        const { type } = request.params;

        if (!VALID_TYPES.includes(type)) {
            return reply.status(400).send({
                success: false,
                error: `Invalid config type '${type}'. Valid types: ${VALID_TYPES.join(', ')}`
            });
        }

        const data = await getConfig(type);

        return reply.send({
            success:     true,
            type,
            lastUpdated: data.lastUpdated,
            source:      data.source,
            data
        });
    } catch (error) {
        return reply.status(500).send({ success: false, error: error.message });
    }
}

/**
 * POST /neon/config/refresh
 * Force re-fetches all config types from Neon BO.
 */
async function refreshAllConfigs(request, reply) {
    try {
        const results = await refreshAll();
        return reply.send({
            success:  true,
            message:  'Neon config refresh completed',
            refreshed: results.refreshed,
            errors:    results.errors
        });
    } catch (error) {
        return reply.status(500).send({ success: false, error: error.message });
    }
}

/**
 * POST /neon/config/refresh/:type
 * Force re-fetches a single config type from Neon BO.
 */
async function refreshSingleConfig(request, reply) {
    try {
        const { type } = request.params;

        if (!VALID_TYPES.includes(type)) {
            return reply.status(400).send({
                success: false,
                error: `Invalid config type '${type}'. Valid types: ${VALID_TYPES.join(', ')}`
            });
        }

        await refreshConfig(type);

        return reply.send({ success: true, type, refreshed: true });
    } catch (error) {
        return reply.status(500).send({ success: false, error: error.message });
    }
}

// ── Route registration ────────────────────────────────────────────────────────

async function registerRoutes(fastify, options) {
    const { apikey } = options;

    // Auth preHandler — scoped to this plugin instance only
    fastify.addHook('preHandler', async (request, reply) => {
        const requestApiKey = request.headers['apikey'];
        if (!requestApiKey || requestApiKey !== apikey) {
            return reply.status(401).send({
                success: false,
                error:   'Unauthorized: Invalid or missing API key'
            });
        }
    });

    fastify.get('/neon/config',                listConfigs);
    fastify.get('/neon/config/:type',          getConfigData);
    fastify.post('/neon/config/refresh',       refreshAllConfigs);
    fastify.post('/neon/config/refresh/:type', refreshSingleConfig);
}

module.exports = {
    registerRoutes,
    listConfigs,
    getConfigData,
    refreshAllConfigs,
    refreshSingleConfig
};
