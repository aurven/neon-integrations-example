const { getTaxonomy } = require('../connectors/iab-taxonomies-connector');

/**
 * IAB Taxonomies Helper Functions
 * Provides utility functions for working with IAB taxonomies
 */

/**
 * Get label for a single ID
 * @param {string} type - Taxonomy type (content, audience, adproduct)
 * @param {string|number} id - Category ID
 * @returns {Promise<Object|null>} Category info with name and path, or null if not found
 */
async function getLabel(type, id) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const categoryInfo = taxonomy.index[idStr];

    if (!categoryInfo) {
      return null;
    }

    return {
      id: idStr,
      name: categoryInfo.name,
      path: categoryInfo.path,
      parentId: categoryInfo.parentId
    };
  } catch (error) {
    throw new Error(`Failed to get label for ${type}/${id}: ${error.message}`);
  }
}

/**
 * Get labels for multiple IDs (batch lookup)
 * @param {string} type - Taxonomy type
 * @param {Array<string|number>} ids - Array of category IDs
 * @returns {Promise<Object>} Object with found and notFound arrays
 */
async function getLabels(type, ids) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const found = [];
    const notFound = [];

    for (const id of ids) {
      const idStr = String(id);
      const categoryInfo = taxonomy.index[idStr];

      if (categoryInfo) {
        found.push({
          id: idStr,
          name: categoryInfo.name,
          path: categoryInfo.path,
          parentId: categoryInfo.parentId
        });
      } else {
        notFound.push(idStr);
      }
    }

    return {
      found,
      notFound,
      total: ids.length,
      foundCount: found.length,
      notFoundCount: notFound.length
    };
  } catch (error) {
    throw new Error(`Failed to get labels for ${type}: ${error.message}`);
  }
}

/**
 * Get full hierarchy for a category ID
 * @param {string} type - Taxonomy type
 * @param {string|number} id - Category ID
 * @returns {Promise<Object|null>} Full category details with hierarchy
 */
async function getHierarchy(type, id) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const category = taxonomy.categories.find(cat => String(cat.id) === idStr);

    if (!category) {
      return null;
    }

    // Build full hierarchy path
    const hierarchy = [];
    let currentId = category.id;

    // Prevent infinite loops with a max depth counter
    let maxDepth = 10;

    while (currentId && maxDepth > 0) {
      const current = taxonomy.categories.find(cat => String(cat.id) === String(currentId));

      if (!current) break;

      hierarchy.unshift({
        id: current.id,
        name: current.name,
        level: hierarchy.length
      });

      currentId = current.parentId;
      maxDepth--;
    }

    return {
      id: category.id,
      name: category.name,
      path: taxonomy.index[idStr].path,
      parentId: category.parentId,
      tiers: category.tiers,
      extension: category.extension,
      hierarchy,
      depth: hierarchy.length
    };
  } catch (error) {
    throw new Error(`Failed to get hierarchy for ${type}/${id}: ${error.message}`);
  }
}

/**
 * Search categories by name or path
 * @param {string} type - Taxonomy type
 * @param {string} query - Search query
 * @param {Object} options - Search options (caseSensitive, limit)
 * @returns {Promise<Array>} Array of matching categories
 */
async function searchCategories(type, query, options = {}) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const {
      caseSensitive = false,
      limit = 50
    } = options;

    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const results = [];

    for (const category of taxonomy.categories) {
      const categoryName = caseSensitive ? category.name : category.name.toLowerCase();
      const categoryPath = taxonomy.index[category.id].path;
      const categoryPathLower = caseSensitive ? categoryPath : categoryPath.toLowerCase();

      if (categoryName.includes(searchQuery) || categoryPathLower.includes(searchQuery)) {
        results.push({
          id: category.id,
          name: category.name,
          path: categoryPath,
          parentId: category.parentId,
          tiers: category.tiers
        });

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to search ${type} taxonomy: ${error.message}`);
  }
}

/**
 * Validate if IDs exist in a taxonomy
 * @param {string} type - Taxonomy type
 * @param {Array<string|number>} ids - Array of category IDs to validate
 * @returns {Promise<Object>} Validation result with valid and invalid IDs
 */
async function validateIds(type, ids) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const valid = [];
    const invalid = [];

    for (const id of ids) {
      const idStr = String(id);

      if (taxonomy.index[idStr]) {
        valid.push(idStr);
      } else {
        invalid.push(idStr);
      }
    }

    return {
      valid,
      invalid,
      isValid: invalid.length === 0,
      validCount: valid.length,
      invalidCount: invalid.length
    };
  } catch (error) {
    throw new Error(`Failed to validate IDs for ${type}: ${error.message}`);
  }
}

/**
 * Get children categories for a parent ID
 * @param {string} type - Taxonomy type
 * @param {string|number} parentId - Parent category ID (null for root categories)
 * @returns {Promise<Array>} Array of child categories
 */
async function getChildren(type, parentId = null) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const parentIdStr = parentId ? String(parentId) : null;

    const children = taxonomy.categories.filter(cat => {
      if (parentIdStr === null) {
        return cat.parentId === null || cat.parentId === '';
      }
      return String(cat.parentId) === parentIdStr;
    });

    return children.map(cat => ({
      id: cat.id,
      name: cat.name,
      path: taxonomy.index[cat.id].path,
      parentId: cat.parentId,
      hasChildren: taxonomy.categories.some(c => String(c.parentId) === String(cat.id))
    }));
  } catch (error) {
    throw new Error(`Failed to get children for ${type}/${parentId}: ${error.message}`);
  }
}

/**
 * Get taxonomy statistics
 * @param {string} type - Taxonomy type
 * @returns {Promise<Object>} Statistics about the taxonomy
 */
async function getTaxonomyStats(type) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    // Count root categories (no parent)
    const rootCount = taxonomy.categories.filter(cat => !cat.parentId || cat.parentId === '').length;

    // Find max depth
    let maxDepth = 0;
    for (const cat of taxonomy.categories) {
      if (cat.tiers && cat.tiers.length > maxDepth) {
        maxDepth = cat.tiers.length;
      }
    }

    return {
      version: taxonomy.version,
      type: taxonomy.taxonomy,
      totalCategories: taxonomy.totalCategories,
      rootCategories: rootCount,
      maxDepth,
      lastUpdated: taxonomy.lastUpdated
    };
  } catch (error) {
    throw new Error(`Failed to get stats for ${type}: ${error.message}`);
  }
}

/**
 * Get full taxonomy tree structure (for UI rendering)
 * @param {string} type - Taxonomy type
 * @param {number} maxDepth - Maximum depth to retrieve (default: all)
 * @returns {Promise<Array>} Tree structure with nested children
 */
async function getTaxonomyTree(type, maxDepth = null) {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    // Build a map for quick lookup
    const categoryMap = new Map();
    taxonomy.categories.forEach(cat => {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        path: taxonomy.index[cat.id].path,
        parentId: cat.parentId,
        depth: cat.tiers ? cat.tiers.length : 0,
        children: []
      });
    });

    // Build tree structure
    const rootNodes = [];

    categoryMap.forEach((node, id) => {
      if (maxDepth !== null && node.depth > maxDepth) {
        return; // Skip nodes beyond max depth
      }

      if (!node.parentId || node.parentId === '') {
        rootNodes.push(node);
      } else {
        const parent = categoryMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    return rootNodes;
  } catch (error) {
    throw new Error(`Failed to get tree for ${type}: ${error.message}`);
  }
}

module.exports = {
  getLabel,
  getLabels,
  getHierarchy,
  searchCategories,
  validateIds,
  getChildren,
  getTaxonomyStats,
  getTaxonomyTree
};
