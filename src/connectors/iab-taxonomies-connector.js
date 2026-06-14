const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * IAB Taxonomies Connector
 * Downloads and parses IAB Taxonomies from GitHub repository
 * Supports Content, Audience, and Ad Product Taxonomies
 */

const CACHE_DIR = path.join(process.cwd(), 'data', 'iab-taxonomies');

// GitHub raw content base URL
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/InteractiveAdvertisingBureau/Taxonomies/main';

// Taxonomy configurations with latest versions
const TAXONOMIES = {
  content: {
    version: '3.1',
    filename: 'Content Taxonomy 3.1.tsv',
    url: `${GITHUB_BASE_URL}/Content Taxonomies/Content Taxonomy 3.1.tsv`,
    cacheFile: 'content-taxonomy-v3.1.json'
  },
  audience: {
    version: '1.1',
    filename: 'Audience Taxonomy 1.1.tsv',
    url: `${GITHUB_BASE_URL}/Audience Taxonomies/Audience Taxonomy 1.1.tsv`,
    cacheFile: 'audience-taxonomy-v1.1.json'
  },
  adproduct: {
    version: '2.0',
    filename: 'Ad Product Taxonomy 2.0.tsv',
    url: `${GITHUB_BASE_URL}/Ad Product Taxonomies/Ad Product Taxonomy 2.0.tsv`,
    cacheFile: 'adproduct-taxonomy-v2.0.json'
  }
};

/**
 * Download TSV file from GitHub
 * @param {string} url - URL of the TSV file
 * @returns {Promise<string>} TSV content
 */
async function downloadTSV(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to download taxonomy from ${url}: ${error.message}`);
  }
}

/**
 * Parse TSV content to JSON structure
 * @param {string} tsvContent - TSV file content
 * @param {string} type - Taxonomy type (content, audience, adproduct)
 * @returns {Object} Parsed taxonomy object
 */
function parseTSV(tsvContent, type) {
  const lines = tsvContent.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    throw new Error('Empty TSV file');
  }

  // IAB TSV files have a descriptive first row, the actual column headers are on the second row
  // Skip the first line and use the second line as headers
  let headerLineIndex = 0;
  let dataStartIndex = 1;

  // Check if first line looks like a descriptive header (contains descriptive text)
  const firstLine = lines[0];
  if (firstLine.includes('Relational ID System') || firstLine.includes('IAB') || firstLine.includes('Taxonomy')) {
    // First line is descriptive, use second line as headers
    headerLineIndex = 1;
    dataStartIndex = 2;
  }

  // Parse header and filter out empty columns
  const rawHeaders = lines[headerLineIndex].split('\t').map(h => h.trim());
  const headers = [];
  const headerIndexMap = []; // Map filtered index to original index

  rawHeaders.forEach((header, idx) => {
    if (header) { // Only keep non-empty headers
      headers.push(header);
      headerIndexMap.push(idx);
    }
  });

  // Parse data rows
  const categories = [];
  const index = {};

  for (let i = dataStartIndex; i < lines.length; i++) {
    const values = lines[i].split('\t');

    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, idx) => {
      const originalIdx = headerIndexMap[idx];
      row[header] = values[originalIdx] ? values[originalIdx].trim() : null;
    });

    // Skip rows where all values are empty
    const hasContent = Object.values(row).some(v => v && v !== '');
    if (!hasContent) continue;

    // Normalize structure based on taxonomy type
    const category = normalizeCategoryStructure(row, type);

    if (category.id) {
      categories.push(category);

      // Build index for fast lookup
      index[category.id] = {
        name: category.name,
        path: buildPath(category, type),
        parentId: category.parentId
      };
    }
  }

  return {
    version: TAXONOMIES[type].version,
    taxonomy: type,
    lastUpdated: new Date().toISOString(),
    totalCategories: categories.length,
    categories,
    index
  };
}

/**
 * Normalize category structure based on taxonomy type
 * @param {Object} row - Raw parsed row
 * @param {string} type - Taxonomy type
 * @returns {Object} Normalized category
 */
function normalizeCategoryStructure(row, type) {
  // Find the name field - it could have different column names
  let name = row['Name'];
  if (!name) {
    // Look for "Condensed Name" with any suffix
    for (const key in row) {
      if (key.startsWith('Condensed Name')) {
        name = row[key];
        break;
      }
    }
  }

  const category = {
    id: row['Unique ID'] || row['UniqueID'],
    name: name,
    parentId: row['Parent'] || row['Parent ID'] || null
  };

  // Handle empty parent values
  if (category.parentId === '' || category.parentId === category.id) {
    category.parentId = null;
  }

  // Add tier information
  const maxTiers = type === 'audience' ? 6 : (type === 'content' ? 4 : 3);
  category.tiers = [];

  for (let i = 1; i <= maxTiers; i++) {
    const tierValue = row[`Tier ${i}`];
    if (tierValue && tierValue.trim()) {
      category.tiers.push(tierValue.trim());
    }
  }

  // Add extension if available
  if (row['Extension'] || row['Extension Notes']) {
    category.extension = row['Extension'] || row['Extension Notes'];
  }

  return category;
}

/**
 * Build hierarchical path for a category
 * @param {Object} category - Category object
 * @param {string} type - Taxonomy type
 * @returns {string} Hierarchical path (e.g., "Automotive > Auto Body Styles > Sedan")
 */
function buildPath(category, type) {
  if (category.tiers && category.tiers.length > 0) {
    return category.tiers.join(' > ');
  }
  return category.name;
}

/**
 * Save taxonomy to cache file
 * @param {string} type - Taxonomy type
 * @param {Object} data - Taxonomy data to save
 */
async function saveToCache(type, data) {
  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    const cacheFile = path.join(CACHE_DIR, TAXONOMIES[type].cacheFile);
    await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');

    console.log(`[IAB Taxonomies] Saved ${type} taxonomy to cache (${data.totalCategories} categories)`);
  } catch (error) {
    throw new Error(`Failed to save cache for ${type}: ${error.message}`);
  }
}

/**
 * Load taxonomy from cache file
 * @param {string} type - Taxonomy type
 * @returns {Promise<Object|null>} Cached taxonomy or null if not found
 */
async function loadFromCache(type) {
  try {
    const cacheFile = path.join(CACHE_DIR, TAXONOMIES[type].cacheFile);
    const content = await fs.readFile(cacheFile, 'utf8');
    const data = JSON.parse(content);

    console.log(`[IAB Taxonomies] Loaded ${type} taxonomy from cache (${data.totalCategories} categories)`);
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // Cache file doesn't exist
    }
    throw new Error(`Failed to load cache for ${type}: ${error.message}`);
  }
}

/**
 * Check if cache exists for a taxonomy type
 * @param {string} type - Taxonomy type
 * @returns {Promise<boolean>}
 */
async function cacheExists(type) {
  try {
    const cacheFile = path.join(CACHE_DIR, TAXONOMIES[type].cacheFile);
    await fs.access(cacheFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and cache a taxonomy
 * @param {string} type - Taxonomy type (content, audience, adproduct)
 * @returns {Promise<Object>} Taxonomy data
 */
async function downloadAndCache(type) {
  if (!TAXONOMIES[type]) {
    throw new Error(`Unknown taxonomy type: ${type}. Valid types: ${Object.keys(TAXONOMIES).join(', ')}`);
  }

  console.log(`[IAB Taxonomies] Downloading ${type} taxonomy v${TAXONOMIES[type].version}...`);

  const tsvContent = await downloadTSV(TAXONOMIES[type].url);
  const taxonomyData = parseTSV(tsvContent, type);

  await saveToCache(type, taxonomyData);

  return taxonomyData;
}

/**
 * Get taxonomy data (from cache or download if needed)
 * @param {string} type - Taxonomy type
 * @param {boolean} forceRefresh - Force download even if cache exists
 * @returns {Promise<Object>} Taxonomy data
 */
async function getTaxonomy(type, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await loadFromCache(type);
    if (cached) {
      return cached;
    }
  }

  return await downloadAndCache(type);
}

/**
 * Initialize all taxonomies (download if cache doesn't exist)
 * @returns {Promise<Object>} Status of initialization
 */
async function initializeAll() {
  const results = {
    initialized: [],
    cached: [],
    errors: []
  };

  for (const type of Object.keys(TAXONOMIES)) {
    try {
      const exists = await cacheExists(type);

      if (exists) {
        results.cached.push(type);
        console.log(`[IAB Taxonomies] ${type} taxonomy already cached`);
      } else {
        await downloadAndCache(type);
        results.initialized.push(type);
      }
    } catch (error) {
      console.error(`[IAB Taxonomies] Error initializing ${type}:`, error.message);
      results.errors.push({ type, error: error.message });
    }
  }

  return results;
}

/**
 * Refresh all taxonomies (force download)
 * @returns {Promise<Object>} Status of refresh
 */
async function refreshAll() {
  const results = {
    refreshed: [],
    errors: []
  };

  for (const type of Object.keys(TAXONOMIES)) {
    try {
      await downloadAndCache(type);
      results.refreshed.push(type);
    } catch (error) {
      console.error(`[IAB Taxonomies] Error refreshing ${type}:`, error.message);
      results.errors.push({ type, error: error.message });
    }
  }

  return results;
}

/**
 * Get list of available taxonomies
 * @returns {Object} Available taxonomies with metadata
 */
function getAvailableTaxonomies() {
  return Object.entries(TAXONOMIES).reduce((acc, [type, config]) => {
    acc[type] = {
      version: config.version,
      filename: config.filename
    };
    return acc;
  }, {});
}

module.exports = {
  getTaxonomy,
  downloadAndCache,
  loadFromCache,
  cacheExists,
  initializeAll,
  refreshAll,
  getAvailableTaxonomies,
  TAXONOMIES
};
