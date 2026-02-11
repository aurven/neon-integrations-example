const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'tag-manager');

const DEFAULTS = {
  tags: {
    families: [
      {
        id: 'geo', name: 'Geography', description: 'Geographic distribution tags',
        tags: [
          { id: 'geo-europe', label: 'Europe' },
          { id: 'geo-north-america', label: 'North America' },
          { id: 'geo-italy', label: 'Italy' }
        ]
      },
      {
        id: 'topic', name: 'Topics', description: 'Content topic tags',
        tags: [
          { id: 'topic-sport', label: 'Sport' },
          { id: 'topic-politics', label: 'Politics' },
          { id: 'topic-technology', label: 'Technology' }
        ]
      }
    ],
    lastUpdated: new Date().toISOString()
  },
  packages: {
    packages: [
      {
        id: 'pkg-premium-sport', name: 'Premium Sport',
        description: 'Full sport content distribution for European markets',
        tagIds: ['topic-sport', 'geo-europe'], packageIds: [],
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
        createdAt: new Date().toISOString()
      }
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
  getPackages, savePackages,
  getCustomers, saveCustomers,
  initializeDefaults
};
