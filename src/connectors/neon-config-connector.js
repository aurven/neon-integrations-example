const fs = require('fs').promises;
const path = require('path');
const { NeonClient } = require('../helpers/neon-bo-api-v3');

const CACHE_DIR = path.join(process.cwd(), 'data', 'neon-config');

/**
 * Registry of all cacheable Neon BO configuration types.
 * Mirrors the TAXONOMIES registry in iab-taxonomies-connector.js.
 */
const CONFIGS = {
    usersGroups: {
        label:     'Users & Groups',
        cacheFile: 'users-groups.json'
    },
    workflows: {
        label:     'Workflow Definitions',
        cacheFile: 'workflows.json'
    },
    contentTypes: {
        label:     'Content Types',
        cacheFile: 'content-types.json'
    },
    workfolders: {
        label:     'Workfolders',
        cacheFile: 'workfolders.json'
    }
};

// Fallback labels used until contentTypes config is cached (or for types missing from it)
const DEFAULT_TYPE_LABELS = {
    'article': 'Article',
    'article/gallery': 'Gallery'
};

let typeLabels = null;

// ── File I/O ──────────────────────────────────────────────────────────────────

async function saveToCache(type, data) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheFile = path.join(CACHE_DIR, CONFIGS[type].cacheFile);
    await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Neon Config] Saved ${type} to cache`);
}

function isCacheUsable(type, data) {
    if (!data) return false;
    if (type === 'workflows')   return data.workflows  && Object.keys(data.workflows).length > 0;
    if (type === 'workfolders') return data.workfolders && data.workfolders.length > 0;
    if (type === 'usersGroups') return (data.users && data.users.length > 0) || (data.groups && data.groups.length > 0);
    if (type === 'contentTypes') return data.types && data.types.length > 0;
    return true;
}

async function loadFromCache(type) {
    try {
        const cacheFile = path.join(CACHE_DIR, CONFIGS[type].cacheFile);
        const content = await fs.readFile(cacheFile, 'utf8');
        const data = JSON.parse(content);
        if (!isCacheUsable(type, data)) {
            console.log(`[Neon Config] Cache for ${type} is empty — treating as miss`);
            return null;
        }
        console.log(`[Neon Config] Loaded ${type} from cache`);
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error(`Failed to load cache for ${type}: ${error.message}`);
    }
}

async function cacheExists(type) {
    try {
        await fs.access(path.join(CACHE_DIR, CONFIGS[type].cacheFile));
        return true;
    } catch {
        return false;
    }
}

/**
 * Flatten the hierarchical /contents/types tree into a flat list.
 * Each node in the tree carries its own composedTypeName (the full
 * dot-path-free hierarchy, e.g. "article/gallery"), which is what
 * shows up as a node's typeName in search results.
 */
function flattenContentTypes(node, list = []) {
    if (!node) return list;

    if (node.typeInfo) {
        list.push({
            typeName: node.typeInfo.typeName,
            typeId: node.typeInfo.typeId,
            contentType: node.typeInfo.contentType ?? node.contentType ?? null,
            typeMeta: node.typeInfo.typeMeta ?? null,
            composedTypeName: node.composedTypeName ?? node.typeInfo.typeName
        });
    }

    if (node.hierarchicalSubTypes) {
        for (const sub of Object.values(node.hierarchicalSubTypes)) {
            flattenContentTypes(sub, list);
        }
    }

    return list;
}

// ── Neon BO fetching ──────────────────────────────────────────────────────────

/**
 * Fetch configuration data from Neon BO and return a shaped cache object.
 * Creates a dedicated NeonClient per call (same pattern as panels.js).
 */
async function fetchFromNeon(type) {
    if (!CONFIGS[type]) {
        throw new Error(`Unknown config type: ${type}. Valid types: ${Object.keys(CONFIGS).join(', ')}`);
    }

    console.log(`[Neon Config] Fetching ${CONFIGS[type].label} from Neon BO...`);

    const client = new NeonClient();

    if (type === 'usersGroups') {
        const [usersSettled, groupsSettled] = await Promise.allSettled([
            client.getUsers(),
            client.getGroups()
        ]);

        if (usersSettled.status === 'rejected') {
            console.warn(`[Neon Config] getUsers() failed: ${usersSettled.reason?.message}`);
        }
        if (groupsSettled.status === 'rejected') {
            console.warn(`[Neon Config] getGroups() failed: ${groupsSettled.reason?.message}`);
        }

        const usersResult  = usersSettled.status  === 'fulfilled' ? usersSettled.value  : null;
        const groupsResult = groupsSettled.status === 'fulfilled' ? groupsSettled.value : null;

        return {
            lastUpdated: new Date().toISOString(),
            source: 'neon-bo',
            users:  usersResult?.result  || usersResult?.users  || [],
            groups: groupsResult?.result || groupsResult?.groups || []
        };
    }

    if (type === 'workflows') {
        const fs = require('fs');
        const cfgPath = path.join(process.cwd(), 'conf', 'neon-config', 'workflows.json');
        let workflowNames = [];
        try {
            workflowNames = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).workflows || [];
        } catch (e) {
            console.warn(`[Neon Config] Could not read workflows config: ${e.message}`);
        }

        // Fetch each configured workflow graph and build a step lookup map.
        // Shape: { "Story": { version, steps: { "Edit": { id, color, description, initialState, endState, transitions[] } } } }
        const byName = {};
        for (const entry of workflowNames) {
            const wfName = typeof entry === 'string' ? entry : entry.name;
            const version = entry.version ?? undefined;
            try {
                const graph = await client.getWorkflowGraph(wfName, version);
                const steps = {};
                for (const step of (graph.steps || [])) {
                    steps[step.name] = {
                        id:           step.id,
                        color:        step.color || null,
                        description:  step.description || null,
                        initialState: !!step.initialState,
                        endState:     !!step.endState,
                        transitions:  (step.transitions || []).map(t => t.name)
                    };
                }
                byName[wfName] = {
                    version: graph.process?.version ?? null,
                    steps
                };
            } catch (e) {
                console.error(`[Neon Config] Failed to fetch workflow graph "${wfName}": ${e.message}`);
            }
        }

        return {
            lastUpdated: new Date().toISOString(),
            source: 'neon-bo',
            workflows: byName
        };
    }

    if (type === 'contentTypes') {
        const typesResult = await client.getContentTypesConfig();

        return {
            lastUpdated: new Date().toISOString(),
            source: 'neon-bo',
            types: flattenContentTypes(typesResult)
        };
    }

    if (type === 'workfolders') {
        // Workfolders are statically configured — the Neon BO endpoint for this
        // does not exist on all versions. Edit conf/neon-config/workfolders.json to update.
        const fsSync = require('fs');
        const cfgPath = path.join(process.cwd(), 'conf', 'neon-config', 'workfolders.json');
        let workfolders = [];
        try {
            workfolders = JSON.parse(fsSync.readFileSync(cfgPath, 'utf8')).workfolders || [];
        } catch (e) {
            console.warn(`[Neon Config] Could not read workfolders config: ${e.message}`);
        }
        return { lastUpdated: new Date().toISOString(), source: 'conf', workfolders };
    }
}

async function fetchAndCache(type) {
    const data = await fetchFromNeon(type);
    await saveToCache(type, data);
    return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a configuration, loading from cache or fetching from Neon BO as needed.
 */
async function getConfig(type, forceRefresh = false) {
    if (!forceRefresh) {
        const cached = await loadFromCache(type);
        if (cached) return cached;
    }
    return await fetchAndCache(type);
}

/**
 * Initialize all config types on startup.
 * Skips types that are already cached; only fetches missing ones.
 * Returns { initialized: [], cached: [], errors: [] }
 */
async function initializeAll() {
    const results = { initialized: [], cached: [], errors: [] };

    for (const type of Object.keys(CONFIGS)) {
        try {
            if (await cacheExists(type)) {
                results.cached.push(type);
                console.log(`[Neon Config] ${type} already cached`);
            } else {
                await fetchAndCache(type);
                results.initialized.push(type);
            }
        } catch (error) {
            console.error(`[Neon Config] Error initializing ${type}:`, error.message);
            results.errors.push({ type, error: error.message });
        }
    }

    return results;
}

/**
 * Force re-fetch all config types from Neon BO.
 * Returns { refreshed: [], errors: [] }
 */
async function refreshAll() {
    const results = { refreshed: [], errors: [] };

    for (const type of Object.keys(CONFIGS)) {
        try {
            await fetchAndCache(type);
            results.refreshed.push(type);
        } catch (error) {
            console.error(`[Neon Config] Error refreshing ${type}:`, error.message);
            results.errors.push({ type, error: error.message });
        }
    }

    return results;
}

/**
 * Force re-fetch a single config type from Neon BO.
 */
async function refreshConfig(type) {
    if (!CONFIGS[type]) {
        throw new Error(`Unknown config type: ${type}. Valid types: ${Object.keys(CONFIGS).join(', ')}`);
    }
    await fetchAndCache(type);
    return true;
}

/**
 * Load (cache or fetch) the contentTypes config and build the in-memory
 * composedTypeName -> label lookup used by getTypeLabel().
 */
async function loadContentTypesConfig() {
    try {
        const config = await getConfig('contentTypes');
        const types = config?.types || [];
        typeLabels = types.reduce((acc, t) => {
            if (t?.composedTypeName) acc[t.composedTypeName] = t.typeMeta?.label || t.typeName;
            return acc;
        }, { ...DEFAULT_TYPE_LABELS });
    } catch (error) {
        console.warn(`⚠️ loadContentTypesConfig(): failed to load, keeping defaults (${error.message})`);
    }
    return typeLabels || DEFAULT_TYPE_LABELS;
}

/**
 * Translate a node's typeName (= composedTypeName, e.g. "article/gallery")
 * into a display label using the cached contentTypes config (falls back to
 * defaults / the raw composedTypeName).
 */
function getTypeLabel(composedTypeName) {
    if (!composedTypeName) return null;
    const labels = typeLabels || DEFAULT_TYPE_LABELS;
    return labels[composedTypeName] || composedTypeName;
}

/**
 * Load (cache or fetch) the workflows config.
 * Returns { "Story": { version, steps: { stepName: { color, description, transitions[] } } } }
 */
async function loadWorkflowsConfig(forceRefresh = false) {
    try {
        const config = await getConfig('workflows', forceRefresh);
        return config?.workflows || {};
    } catch (error) {
        console.warn(`⚠️ loadWorkflowsConfig(): failed to load (${error.message})`);
        return {};
    }
}

/**
 * Load (cache or fetch) the workfolders config and return the flat list.
 */
async function loadWorkfoldersConfig(forceRefresh = false) {
    try {
        const config = await getConfig('workfolders', forceRefresh);
        return config?.workfolders || [];
    } catch (error) {
        console.warn(`⚠️ loadWorkfoldersConfig(): failed to load (${error.message})`);
        return [];
    }
}

function getAvailableConfigs() {
    return Object.entries(CONFIGS).reduce((acc, [type, config]) => {
        acc[type] = { label: config.label, cacheFile: config.cacheFile };
        return acc;
    }, {});
}

module.exports = {
    getConfig,
    fetchAndCache,
    loadFromCache,
    cacheExists,
    saveToCache,
    initializeAll,
    refreshAll,
    refreshConfig,
    getAvailableConfigs,
    loadContentTypesConfig,
    loadWorkflowsConfig,
    loadWorkfoldersConfig,
    getTypeLabel,
    CONFIGS
};
