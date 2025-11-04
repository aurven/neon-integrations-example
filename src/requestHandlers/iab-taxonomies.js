const {
  getTaxonomy,
  getAvailableTaxonomies,
  refreshAll
} = require('../connectors/iab-taxonomies-connector');

const {
  getLabel,
  getLabels,
  getHierarchy,
  searchCategories,
  validateIds,
  getChildren,
  getTaxonomyStats,
  getTaxonomyTree
} = require('../helpers/iab-taxonomies-helper');

/**
 * IAB Taxonomies Request Handlers
 * Provides REST API endpoints for IAB taxonomies
 */

/**
 * GET /iab/taxonomies
 * List all available taxonomies with versions
 */
async function listTaxonomies(request, reply) {
  try {
    const taxonomies = getAvailableTaxonomies();

    // Get stats for each taxonomy if available
    const taxonomiesWithStats = {};

    for (const [type, config] of Object.entries(taxonomies)) {
      try {
        const stats = await getTaxonomyStats(type);
        taxonomiesWithStats[type] = {
          ...config,
          stats: {
            totalCategories: stats.totalCategories,
            rootCategories: stats.rootCategories,
            maxDepth: stats.maxDepth,
            lastUpdated: stats.lastUpdated
          }
        };
      } catch (error) {
        // If taxonomy not cached yet, just show basic info
        taxonomiesWithStats[type] = {
          ...config,
          cached: false
        };
      }
    }

    return reply.send({
      success: true,
      taxonomies: taxonomiesWithStats
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /iab/:type
 * Get full taxonomy data
 * Query params:
 *   - format: 'flat' (default) or 'tree'
 *   - maxDepth: number (for tree format)
 */
async function getTaxonomyData(request, reply) {
  try {
    const { type } = request.params;
    const { format = 'flat', maxDepth } = request.query;

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    if (format === 'tree') {
      const tree = await getTaxonomyTree(type, maxDepth ? parseInt(maxDepth) : null);
      const stats = await getTaxonomyStats(type);

      return reply.send({
        success: true,
        type,
        version: stats.version,
        format: 'tree',
        data: tree,
        stats
      });
    } else {
      const taxonomy = await getTaxonomy(type);

      return reply.send({
        success: true,
        type,
        version: taxonomy.version,
        format: 'flat',
        data: taxonomy.categories,
        index: taxonomy.index,
        totalCategories: taxonomy.totalCategories,
        lastUpdated: taxonomy.lastUpdated
      });
    }
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /iab/lookup
 * Lookup labels for one or more IDs
 * Body: { type: string, ids: string|array, hierarchy: boolean }
 */
async function lookupLabels(request, reply) {
  try {
    const { type, ids, hierarchy = false } = request.body;

    if (!type) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required field: type'
      });
    }

    if (!ids) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required field: ids'
      });
    }

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    // Handle single ID or array of IDs
    const idArray = Array.isArray(ids) ? ids : [ids];

    if (idArray.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'IDs array cannot be empty'
      });
    }

    // If hierarchy requested, get full hierarchy for each ID
    if (hierarchy) {
      const results = [];

      for (const id of idArray) {
        const hierarchyData = await getHierarchy(type, id);
        if (hierarchyData) {
          results.push(hierarchyData);
        }
      }

      return reply.send({
        success: true,
        type,
        hierarchy: true,
        results,
        totalRequested: idArray.length,
        totalFound: results.length
      });
    } else {
      // Simple label lookup
      const result = await getLabels(type, idArray);

      return reply.send({
        success: true,
        type,
        hierarchy: false,
        ...result
      });
    }
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /iab/search
 * Search categories by name or path
 * Query params:
 *   - type: taxonomy type (required)
 *   - q: search query (required)
 *   - limit: max results (default: 50)
 *   - caseSensitive: boolean (default: false)
 */
async function searchTaxonomy(request, reply) {
  try {
    const { type, q, limit = 50, caseSensitive = false } = request.query;

    if (!type) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required parameter: type'
      });
    }

    if (!q) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required parameter: q (query)'
      });
    }

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    const results = await searchCategories(type, q, {
      caseSensitive: caseSensitive === 'true',
      limit: parseInt(limit)
    });

    return reply.send({
      success: true,
      type,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /iab/validate
 * Validate if IDs exist in a taxonomy
 * Body: { type: string, ids: array }
 */
async function validateTaxonomyIds(request, reply) {
  try {
    const { type, ids } = request.body;

    if (!type) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required field: type'
      });
    }

    if (!ids || !Array.isArray(ids)) {
      return reply.status(400).send({
        success: false,
        error: 'Missing or invalid field: ids (must be an array)'
      });
    }

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    const validation = await validateIds(type, ids);

    return reply.send({
      success: true,
      type,
      ...validation
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /iab/:type/children
 * Get children categories for a parent ID
 * Query params:
 *   - parentId: parent category ID (optional, defaults to root)
 */
async function getChildrenCategories(request, reply) {
  try {
    const { type } = request.params;
    const { parentId } = request.query;

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    const children = await getChildren(type, parentId || null);

    return reply.send({
      success: true,
      type,
      parentId: parentId || null,
      children,
      count: children.length
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /iab/:type/stats
 * Get taxonomy statistics
 */
async function getTaxonomyStatistics(request, reply) {
  try {
    const { type } = request.params;

    const validTypes = ['content', 'audience', 'adproduct'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid taxonomy type. Valid types: ${validTypes.join(', ')}`
      });
    }

    const stats = await getTaxonomyStats(type);

    return reply.send({
      success: true,
      ...stats
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /iab/refresh
 * Force refresh all taxonomies from GitHub
 */
async function refreshTaxonomies(request, reply) {
  try {
    const results = await refreshAll();

    return reply.send({
      success: true,
      message: 'Taxonomies refresh completed',
      ...results
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error.message
    });
  }
}

/**
 * Register all IAB taxonomy routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function registerRoutes(fastify, options) {
  const { apikey } = options;

  // Middleware for API key authentication
  const authenticate = async (request, reply) => {
    const requestApiKey = request.headers['apikey'];

    if (!requestApiKey || requestApiKey !== apikey) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized: Invalid or missing API key'
      });
    }
  };

  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  // Register routes
  fastify.get('/iab/taxonomies', listTaxonomies);
  fastify.get('/iab/:type', getTaxonomyData);
  fastify.get('/iab/:type/stats', getTaxonomyStatistics);
  fastify.get('/iab/:type/children', getChildrenCategories);
  fastify.get('/iab/search', searchTaxonomy);
  fastify.post('/iab/lookup', lookupLabels);
  fastify.post('/iab/validate', validateTaxonomyIds);
  fastify.post('/iab/refresh', refreshTaxonomies);
}

module.exports = {
  registerRoutes,
  // Export individual handlers for testing
  listTaxonomies,
  getTaxonomyData,
  lookupLabels,
  searchTaxonomy,
  validateTaxonomyIds,
  getChildrenCategories,
  getTaxonomyStatistics,
  refreshTaxonomies
};
