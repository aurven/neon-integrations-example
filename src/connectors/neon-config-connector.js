const fs = require('fs').promises;
const path = require('path');
const { NeonClient } = require('../helpers/neon-bo-api-v3');

const CACHE_DIR = path.join(process.cwd(), 'data', 'neon-config');

/**
 * Registry of all cacheable Neon BO configuration types.
 * Mirrors the TAXONOMIES registry in iab-taxonomies-connector.js.
 */
const WORKFOLDER_TYPES = [
    'article', 'wirestory', 'wirestory/extcontributions', 'wirestory/afpwirestory',
    'article/take', 'article/longform', 'article/poll', 'hero'
];

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

async function loadFromCache(type) {
    try {
        const cacheFile = path.join(CACHE_DIR, CONFIGS[type].cacheFile);
        const content = await fs.readFile(cacheFile, 'utf8');
        console.log(`[Neon Config] Loaded ${type} from cache`);
        return JSON.parse(content);
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
        const [usersResult, groupsResult] = await Promise.all([
            client.getUsers(),
            client.getGroups()
        ]);

        return {
            lastUpdated: new Date().toISOString(),
            source: 'neon-bo',
            users:  usersResult?.users  || (Array.isArray(usersResult)  ? usersResult  : []),
            groups: groupsResult?.groups || (Array.isArray(groupsResult) ? groupsResult : [])
        };
    }

    if (type === 'workflows') {
        const workflowsResult = await client.getWorkflowDefinitions();

        return {
            lastUpdated: new Date().toISOString(),
            source: 'neon-bo',
            workflows: workflowsResult?.workflows || (Array.isArray(workflowsResult) ? workflowsResult : [])
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
        const result = await client.getWorkfolders(WORKFOLDER_TYPES);
        const workfolders = [];
        for (const ws of (result.workfolders || [])) {
            const wsPath = ws.workspaceLinkInfo?.workspaceUriPath;
            if (wsPath) workfolders.push({ path: wsPath, label: ws.workspaceLinkInfo?.name || wsPath, isWorkspace: true });
            for (const folder of (ws.workspaceFolders || [])) {
                const folderPath = folder.workspaceLinkInfo?.workspaceUriPath;
                if (folderPath) workfolders.push({ path: folderPath, label: folder.workspaceLinkInfo?.name || folderPath, workspace: ws.workspaceLinkInfo?.name });
            }
        }
        return { lastUpdated: new Date().toISOString(), source: 'neon-bo', workfolders };
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
    loadWorkfoldersConfig,
    getTypeLabel,
    CONFIGS
};
