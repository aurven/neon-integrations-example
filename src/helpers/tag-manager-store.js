const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'tag-manager');

const DEFAULTS = {
  tags: {
    families: [
      {
        id: 'geo', name: 'Geography', description: 'Geographic distribution tags',
        type: 'categorization',
        tags: [
          { id: 'geo-europe', label: 'Europe' },
          { id: 'geo-north-america', label: 'North America' },
          { id: 'geo-italy', label: 'Italy' }
        ]
      },
      {
        id: 'topic', name: 'Topics', description: 'Content topic tags',
        type: 'categorization',
        tags: [
          { id: 'topic-sport', label: 'Sport' },
          { id: 'topic-politics', label: 'Politics' },
          { id: 'topic-technology', label: 'Technology' }
        ]
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  products: {
    products: [
      {
        id: 'prod-premium-sport', name: 'Premium Sport',
        description: 'Full sport content distribution for European markets',
        tagIds: ['topic-sport', 'geo-europe'],
        createdAt: new Date().toISOString()
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  packages: {
    packages: [
      {
        id: 'pkg-premium-sport', name: 'Premium Sport',
        description: 'Premium Sport package',
        productIds: ['prod-premium-sport'],
        createdAt: new Date().toISOString()
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  customers: {
    customers: [
      {
        id: 'cust-acme-corp', name: 'Acme Corp', contact: 'editor@acme.com',
        packageIds: ['pkg-premium-sport'],
        streams: [],
        createdAt: new Date().toISOString()
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  transformers: {
    transformers: [
      { id: 'format-newsml', name: 'Format: NewsML-G2', description: 'Convert to NewsML-G2 format', category: 'format' },
      { id: 'format-nitf', name: 'Format: NITF', description: 'Convert to NITF format', category: 'format' },
      { id: 'format-json-ld', name: 'Format: JSON-LD', description: 'Convert to JSON-LD structured data', category: 'format' },
      { id: 'strip-metadata', name: 'Strip Metadata', description: 'Remove internal metadata fields', category: 'cleanup' },
      { id: 'enrich-seo', name: 'Enrich SEO', description: 'Add SEO metadata and keywords', category: 'enrichment' },
      { id: 'compress-gzip', name: 'Compress (gzip)', description: 'Compress payload with gzip', category: 'delivery' },
      { id: 'filter-embargo', name: 'Filter Embargo', description: 'Filter embargoed content', category: 'filter' },
      { id: 'translate-en', name: 'Translate to English', description: 'Translate content to English', category: 'enrichment' },
      { id: 'thumbnail-gen', name: 'Generate Thumbnails', description: 'Generate thumbnail images', category: 'media' },
      { id: 'watermark', name: 'Add Watermark', description: 'Add watermark to images', category: 'media' }
    ],
    lastUpdated: new Date().toISOString()
  }
};

async function readJsonFile(filename) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, filename);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

async function writeJsonFile(filename, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, filename);
  data.lastUpdated = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function getTags() {
  return await readJsonFile('tags.json');
}

async function saveTags(data) {
  await writeJsonFile('tags.json', data);
}

async function getProducts() {
  return await readJsonFile('products.json');
}

async function saveProducts(data) {
  await writeJsonFile('products.json', data);
}

async function getPackages() {
  return await readJsonFile('packages.json');
}

async function savePackages(data) {
  await writeJsonFile('packages.json', data);
}

async function getCustomers() {
  return await readJsonFile('customers.json');
}

async function saveCustomers(data) {
  await writeJsonFile('customers.json', data);
}

async function getTransformers() {
  return await readJsonFile('transformers.json');
}

// --- Secret masking utilities ---

function maskSecretValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function maskSecrets(secrets, type) {
  if (!secrets || typeof secrets !== 'object') return null;
  const masked = { ...secrets };

  if (type === 'sftp') {
    if (masked.password) masked.password = maskSecretValue(masked.password);
    if (masked.sshKeyPath) masked.sshKeyPath = maskSecretValue(masked.sshKeyPath);
  } else if (type === 's3') {
    if (masked.secretAccessKey) masked.secretAccessKey = maskSecretValue(masked.secretAccessKey);
  } else if (type === 'api') {
    if (masked.apiKey) masked.apiKey = maskSecretValue(masked.apiKey);
    if (masked.bearerToken) masked.bearerToken = maskSecretValue(masked.bearerToken);
    if (masked.password) masked.password = maskSecretValue(masked.password);
    if (masked.clientSecret) masked.clientSecret = maskSecretValue(masked.clientSecret);
    if (masked.headerValue) masked.headerValue = maskSecretValue(masked.headerValue);
  } else if (type === 'other') {
    if (masked.entries && Array.isArray(masked.entries)) {
      masked.entries = masked.entries.map(e => ({ ...e, value: maskSecretValue(e.value) }));
    }
  }

  return masked;
}

async function initializeDefaults() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  for (const [name, defaultData] of Object.entries(DEFAULTS)) {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
      console.log(`[Tag Manager] Created default ${name}.json`);
    }
  }
}

module.exports = {
  getTags, saveTags,
  getProducts, saveProducts,
  getPackages, savePackages,
  getCustomers, saveCustomers,
  getTransformers,
  maskSecrets,
  initializeDefaults
};
