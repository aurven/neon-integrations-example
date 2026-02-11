const store = require('../helpers/tag-manager-store');

/**
 * Tag Manager Request Handlers
 * Provides REST API endpoints for managing distribution tags, packages, and customers
 */

// --- Utility ---

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// --- Widget ---

function tagManagerWidgetHandler(request, reply) {
  return reply.view("/src/widgets/tag-manager.hbs", {
    seo: { title: "Tag Manager", description: "Manage distribution tags, packages, and customers" }
  });
}

// --- Tag Families ---

async function listFamilies(request, reply) {
  try {
    const data = await store.getTags();
    return reply.send({ success: true, families: data ? data.families : [] });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function getFamily(request, reply) {
  try {
    const { familyId } = request.params;
    const data = await store.getTags();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No tag data found' });
    }
    const family = data.families.find(f => f.id === familyId);
    if (!family) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }
    return reply.send({ success: true, family });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function createFamily(request, reply) {
  try {
    const { name, description } = request.body;
    if (!name) {
      return reply.status(400).send({ success: false, error: 'Missing required field: name' });
    }

    const data = await store.getTags() || { families: [] };
    const id = slugify(name);

    if (data.families.find(f => f.id === id)) {
      return reply.status(409).send({ success: false, error: 'A family with this name already exists' });
    }

    const family = { id, name, description: description || '', tags: [] };
    data.families.push(family);
    await store.saveTags(data);

    return reply.send({ success: true, family });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function updateFamily(request, reply) {
  try {
    const { familyId } = request.params;
    const { name, description } = request.body;

    const data = await store.getTags();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No tag data found' });
    }

    const family = data.families.find(f => f.id === familyId);
    if (!family) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }

    if (name !== undefined) family.name = name;
    if (description !== undefined) family.description = description;
    await store.saveTags(data);

    return reply.send({ success: true, family });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function deleteFamily(request, reply) {
  try {
    const { familyId } = request.params;

    const data = await store.getTags();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No tag data found' });
    }

    const familyIndex = data.families.findIndex(f => f.id === familyId);
    if (familyIndex === -1) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }

    // Collect tag IDs to clean up from packages
    const tagIds = data.families[familyIndex].tags.map(t => t.id);
    data.families.splice(familyIndex, 1);
    await store.saveTags(data);

    // Cascading cleanup: remove these tags from packages
    if (tagIds.length > 0) {
      const pkgData = await store.getPackages();
      if (pkgData) {
        let changed = false;
        for (const pkg of pkgData.packages) {
          const before = pkg.tagIds.length;
          pkg.tagIds = pkg.tagIds.filter(id => !tagIds.includes(id));
          if (pkg.tagIds.length !== before) changed = true;
        }
        if (changed) await store.savePackages(pkgData);
      }
    }

    return reply.send({ success: true, deleted: familyId });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

// --- Tags within families ---

async function addTag(request, reply) {
  try {
    const { familyId } = request.params;
    const { label } = request.body;

    if (!label) {
      return reply.status(400).send({ success: false, error: 'Missing required field: label' });
    }

    const data = await store.getTags();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No tag data found' });
    }

    const family = data.families.find(f => f.id === familyId);
    if (!family) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }

    const tagId = familyId + '-' + slugify(label);

    if (family.tags.find(t => t.id === tagId)) {
      return reply.status(409).send({ success: false, error: 'Tag already exists in this family' });
    }

    const tag = { id: tagId, label };
    family.tags.push(tag);
    await store.saveTags(data);

    return reply.send({ success: true, tag, family });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function removeTag(request, reply) {
  try {
    const { familyId, tagId } = request.params;

    const data = await store.getTags();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No tag data found' });
    }

    const family = data.families.find(f => f.id === familyId);
    if (!family) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }

    const tagIndex = family.tags.findIndex(t => t.id === tagId);
    if (tagIndex === -1) {
      return reply.status(404).send({ success: false, error: 'Tag not found' });
    }

    family.tags.splice(tagIndex, 1);
    await store.saveTags(data);

    // Cascading cleanup: remove this tag from packages
    const pkgData = await store.getPackages();
    if (pkgData) {
      let changed = false;
      for (const pkg of pkgData.packages) {
        const before = pkg.tagIds.length;
        pkg.tagIds = pkg.tagIds.filter(id => id !== tagId);
        if (pkg.tagIds.length !== before) changed = true;
      }
      if (changed) await store.savePackages(pkgData);
    }

    return reply.send({ success: true, deleted: tagId });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function searchTags(request, reply) {
  try {
    const { familyId } = request.params;
    const { q } = request.query;

    const data = await store.getTags();
    if (!data) {
      return reply.send({ success: true, tags: [] });
    }

    const family = data.families.find(f => f.id === familyId);
    if (!family) {
      return reply.status(404).send({ success: false, error: 'Family not found' });
    }

    let results = family.tags;
    if (q && q.trim()) {
      const query = q.trim().toLowerCase();
      results = family.tags.filter(t => t.label.toLowerCase().includes(query));
    }

    return reply.send({ success: true, tags: results, familyId });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

// --- Input mockup page ---

function tagInputMockupHandler(request, reply) {
  return reply.view("/src/widgets/neon-tags-input.hbs", {
    seo: { title: "Tags Input Component", description: "Mockup page for the NeonTagsInput component" }
  });
}

// --- Packages ---

async function listPackages(request, reply) {
  try {
    const data = await store.getPackages();
    return reply.send({ success: true, packages: data ? data.packages : [] });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function createPackage(request, reply) {
  try {
    const { name, description, tagIds, packageIds } = request.body;

    if (!name) {
      return reply.status(400).send({ success: false, error: 'Missing required field: name' });
    }

    const data = await store.getPackages() || { packages: [] };
    const id = 'pkg-' + slugify(name);

    if (data.packages.find(p => p.id === id)) {
      return reply.status(409).send({ success: false, error: 'A package with this name already exists' });
    }

    const pkg = {
      id,
      name,
      description: description || '',
      tagIds: tagIds || [],
      packageIds: packageIds || [],
      createdAt: new Date().toISOString()
    };
    data.packages.push(pkg);
    await store.savePackages(data);

    return reply.send({ success: true, package: pkg });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function updatePackage(request, reply) {
  try {
    const { packageId } = request.params;
    const { name, description, tagIds, packageIds } = request.body;

    const data = await store.getPackages();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No package data found' });
    }

    const pkg = data.packages.find(p => p.id === packageId);
    if (!pkg) {
      return reply.status(404).send({ success: false, error: 'Package not found' });
    }

    if (name !== undefined) pkg.name = name;
    if (description !== undefined) pkg.description = description;
    if (tagIds !== undefined) pkg.tagIds = tagIds;
    if (packageIds !== undefined) pkg.packageIds = packageIds;
    await store.savePackages(data);

    return reply.send({ success: true, package: pkg });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function deletePackage(request, reply) {
  try {
    const { packageId } = request.params;

    const data = await store.getPackages();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No package data found' });
    }

    const pkgIndex = data.packages.findIndex(p => p.id === packageId);
    if (pkgIndex === -1) {
      return reply.status(404).send({ success: false, error: 'Package not found' });
    }

    data.packages.splice(pkgIndex, 1);

    // Also remove this package from other packages' packageIds
    for (const pkg of data.packages) {
      pkg.packageIds = pkg.packageIds.filter(id => id !== packageId);
    }
    await store.savePackages(data);

    // Cascading cleanup: remove from customers
    const custData = await store.getCustomers();
    if (custData) {
      let changed = false;
      for (const cust of custData.customers) {
        const before = cust.packageIds.length;
        cust.packageIds = cust.packageIds.filter(id => id !== packageId);
        if (cust.packageIds.length !== before) changed = true;
      }
      if (changed) await store.saveCustomers(custData);
    }

    return reply.send({ success: true, deleted: packageId });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

// --- Customers ---

async function listCustomers(request, reply) {
  try {
    const data = await store.getCustomers();
    return reply.send({ success: true, customers: data ? data.customers : [] });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function getCustomersByPackage(request, reply) {
  try {
    const { packageId } = request.params;
    const data = await store.getCustomers();
    if (!data) {
      return reply.send({ success: true, customers: [], packageId });
    }
    const customers = data.customers.filter(c => c.packageIds.includes(packageId));
    return reply.send({ success: true, customers, packageId, count: customers.length });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function createCustomer(request, reply) {
  try {
    const { name, contact, packageIds } = request.body;

    if (!name) {
      return reply.status(400).send({ success: false, error: 'Missing required field: name' });
    }

    const data = await store.getCustomers() || { customers: [] };
    const id = 'cust-' + slugify(name);

    if (data.customers.find(c => c.id === id)) {
      return reply.status(409).send({ success: false, error: 'A customer with this name already exists' });
    }

    const customer = {
      id,
      name,
      contact: contact || '',
      packageIds: packageIds || [],
      createdAt: new Date().toISOString()
    };
    data.customers.push(customer);
    await store.saveCustomers(data);

    return reply.send({ success: true, customer });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function updateCustomer(request, reply) {
  try {
    const { customerId } = request.params;
    const { name, contact, packageIds } = request.body;

    const data = await store.getCustomers();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No customer data found' });
    }

    const customer = data.customers.find(c => c.id === customerId);
    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    if (name !== undefined) customer.name = name;
    if (contact !== undefined) customer.contact = contact;
    if (packageIds !== undefined) customer.packageIds = packageIds;
    await store.saveCustomers(data);

    return reply.send({ success: true, customer });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

async function deleteCustomer(request, reply) {
  try {
    const { customerId } = request.params;

    const data = await store.getCustomers();
    if (!data) {
      return reply.status(404).send({ success: false, error: 'No customer data found' });
    }

    const custIndex = data.customers.findIndex(c => c.id === customerId);
    if (custIndex === -1) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    data.customers.splice(custIndex, 1);
    await store.saveCustomers(data);

    return reply.send({ success: true, deleted: customerId });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
}

// --- Route Registration ---

async function registerRoutes(fastify, options) {
  const { apikey } = options;

  const authenticate = async (request, reply) => {
    const requestApiKey = request.headers['apikey'] || request.query.apikey || request.cookies?.apikey;
    if (!requestApiKey || requestApiKey !== apikey) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    // Set cookie so subsequent browser fetch calls authenticate automatically
    reply.setCookie('apikey', requestApiKey, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60
    });
  };

  fastify.addHook('preHandler', authenticate);

  // Widget page
  fastify.get('/tags/widget', tagManagerWidgetHandler);

  // Tag families
  fastify.get('/tags/families', listFamilies);
  fastify.get('/tags/families/:familyId', getFamily);
  fastify.post('/tags/families', createFamily);
  fastify.put('/tags/families/:familyId', updateFamily);
  fastify.delete('/tags/families/:familyId', deleteFamily);

  // Tags within families
  fastify.post('/tags/families/:familyId/tags', addTag);
  fastify.delete('/tags/families/:familyId/tags/:tagId', removeTag);
  fastify.get('/tags/families/:familyId/search', searchTags);

  // Tags input component mockup
  fastify.get('/tags/input-mockup', tagInputMockupHandler);

  // Packages
  fastify.get('/tags/packages', listPackages);
  fastify.post('/tags/packages', createPackage);
  fastify.put('/tags/packages/:packageId', updatePackage);
  fastify.delete('/tags/packages/:packageId', deletePackage);

  // Customers
  fastify.get('/tags/customers', listCustomers);
  fastify.get('/tags/customers/by-package/:packageId', getCustomersByPackage);
  fastify.post('/tags/customers', createCustomer);
  fastify.put('/tags/customers/:customerId', updateCustomer);
  fastify.delete('/tags/customers/:customerId', deleteCustomer);
}

module.exports = { registerRoutes };
