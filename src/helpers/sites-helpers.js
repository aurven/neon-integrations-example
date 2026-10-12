'use strict';
/**
 * Front Office helpers. Sites, public hostnames and per-stage API hosts come from the
 * env's FO site catalog (src/helpers/neon-env/fo-sites.js), never from hard-coded URLs.
 * Spec: docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md §3
 */
const { requireEnv } = require('./neon-env/context.js');
const { getSite, apiUrl, foRequest } = require('./neon-env/fo-sites.js');

function logFoError(where, error) {
  console.error(`[${where}] ❌ ERROR: ${(error.response && error.response.status) || error.code || error.message}`);
  if (error.response && error.response.data) console.error(JSON.stringify(error.response.data));
}

/**
 * Public hostname (with scheme) of a site, e.g. https://theglobe-demorc.sites.neap.eidosmedia.io.
 * Only live public hostnames are exposed by the FO; other stages return the live one.
 */
async function getSiteHostname(siteName, environment = 'live') {
  if (String(environment).toLowerCase() !== 'live') {
    console.warn(`[getSiteHostname] only live public hostnames are exposed; returning live hostname for ${siteName} (${environment} requested)`);
  }
  const site = await getSite(siteName);
  console.log(`[getSiteHostname] env=${requireEnv().id} site=${site.name} -> ${site.publicUrl}`);
  return site.publicUrl;
}

async function getNodeById({ siteName, targetId, environment = 'live' }) {
  const base = await apiUrl(siteName, environment);
  console.log(`[getNodeById] env=${requireEnv().id} site=${siteName} stage=${environment} id=${targetId}`);
  try {
    const response = await foRequest({
      method: 'get',
      url: `${base}/api/nodes/${targetId}`,
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    logFoError('getNodeById', error);
    return undefined;
  }
}

async function getResource({ siteName, url, environment = 'live' }) {
  const base = await apiUrl(siteName, environment);
  console.log(`[getResource] env=${requireEnv().id} site=${siteName} stage=${environment} url=${url}`);
  try {
    const response = await foRequest({
      method: 'get',
      url: `${base}${url}`,
      responseType: 'stream',
      headers: { Accept: 'image/*' },
    });
    return response.data;
  } catch (error) {
    logFoError('getResource', error);
    return undefined;
  }
}

async function getResourceById({ siteName, targetId, environment = 'live' }) {
  const node = await getNodeById({ siteName, targetId, environment });
  if (!node) throw new Error(`node ${targetId} not found on site ${siteName} (${environment})`);
  return {
    node,
    data: await getResource({ siteName, url: node.resourceUrl, environment }),
  };
}

module.exports = {
  getSiteHostname,
  getNodeById,
  getResource,
  getResourceById,
};
