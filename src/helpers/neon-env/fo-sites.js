'use strict';
/**
 * Front Office site catalog, discovered from GET <fo.url>/api/sites/live?siteMap=false.
 * Spec: docs/superpowers/specs/2026-10-12-fo-site-catalog-design.md §2
 */
const https = require('https');
const axios = require('axios');
const { requireEnv } = require('./context.js');
const { NeonEnvConfigError } = require('./errors.js');

const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10000;
const STAGES = ['live', 'stage', 'preview'];

const cache = new Map(); // envId -> { at, sites }

function buildAxiosConfig(config, env) {
  const out = { ...config };
  if (env.neon.insecureTls === true) out.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  return out;
}

function defaultHttp(config, env) {
  return axios.request(buildAxiosConfig(config, env));
}

let http = defaultHttp;
let now = () => Date.now();

function foConfig(env) {
  if (!env.neon.fo) throw new NeonEnvConfigError(`FO not configured for env ${env.id}`, 501);
  return env.neon.fo;
}

function trimSlash(url) {
  return String(url).replace(/\/+$/, '');
}

function foRequest(config) {
  const env = requireEnv();
  const fo = foConfig(env);
  return http({
    timeout: TIMEOUT_MS,
    ...config,
    headers: { ...(config.headers || {}), 'neon-fo-access-key': fo.apiKey },
  }, env);
}

function withScheme(host) {
  if (!host) return undefined;
  const h = trimSlash(host);
  return /^https?:\/\//i.test(h) ? h : `https://${h}`;
}

function normalizeSite(item) {
  const root = item && item.root;
  if (!root || !root.name) return null;
  const api = item.apiHostnames || {};
  const apiUrls = {};
  for (const stage of STAGES) {
    const url = withScheme(api[`${stage}Hostname`]);
    if (url) apiUrls[stage] = url;
  }
  return {
    name: root.name,
    label: (root.staticAttributes && root.staticAttributes.sitelabel) || root.title || root.name,
    id: root.id,
    publicUrl: root.hostname ? trimSlash(root.hostname) : undefined,
    apiUrls,
  };
}

async function listSites({ refresh = false } = {}) {
  const env = requireEnv();
  const fo = foConfig(env);
  const hit = cache.get(env.id);
  if (!refresh && hit && now() - hit.at < CACHE_TTL_MS) return hit.sites;

  let res;
  try {
    res = await foRequest({ method: 'get', url: `${trimSlash(fo.url)}/api/sites/live`, params: { siteMap: false } });
  } catch (error) {
    const reason = (error.response && error.response.status) || error.code || error.message;
    throw new NeonEnvConfigError(`FO site list unavailable for env ${env.id}: ${reason}`, 502);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new NeonEnvConfigError(`FO site list unavailable for env ${env.id}: ${res.status}`, 502);
  }
  if (!Array.isArray(res.data)) {
    throw new NeonEnvConfigError(`FO site list for env ${env.id} has unexpected shape`, 502);
  }
  const sites = res.data.map(normalizeSite).filter(Boolean);
  cache.set(env.id, { at: now(), sites });
  return sites;
}

function findSite(sites, name) {
  const wanted = String(name || '').toLowerCase();
  return sites.find((s) => s.name.toLowerCase() === wanted) || null;
}

function names(sites) {
  return sites.map((s) => s.name).join(', ');
}

async function getSite(name) {
  const env = requireEnv();
  let sites = await listSites();
  let site = findSite(sites, name);
  if (!site) {
    sites = await listSites({ refresh: true });
    site = findSite(sites, name);
  }
  if (!site) throw new NeonEnvConfigError(`site '${name}' not found in env ${env.id} (available: ${names(sites)})`, 404);
  return site;
}

async function apiUrl(siteName, stage = 'live') {
  const env = requireEnv();
  const site = await getSite(siteName);
  const key = String(stage).toLowerCase();
  const url = site.apiUrls[key];
  if (!url) throw new NeonEnvConfigError(`site '${site.name}' in env ${env.id} has no ${key} API host`, 404);
  return url;
}

async function siteFromModel(neonModel) {
  const env = requireEnv();
  const m = neonModel || {};
  const direct = [m.rootData?.pubInfo?.siteName, m.model?.pubInfo?.siteName, m.pubInfo?.siteName]
    .find((v) => typeof v === 'string' && v.length > 0);
  if (direct) return direct;

  const ex = m.rootData?.pubInfoEx;
  if (ex && typeof ex === 'object') {
    const keys = Object.keys(ex);
    if (keys.length === 1) return keys[0];
  }

  const sites = await listSites();
  if (sites.length === 1) return sites[0].name;
  throw new NeonEnvConfigError(`cannot determine site for env ${env.id}: payload has no pubInfo.siteName (available: ${names(sites)})`, 400);
}

function clearSiteCache() {
  cache.clear();
}

function __setHttpForTest(fn) {
  http = fn || defaultHttp;
}

function __setNowForTest(fn) {
  now = fn || (() => Date.now());
}

module.exports = {
  CACHE_TTL_MS,
  listSites,
  getSite,
  apiUrl,
  siteFromModel,
  foRequest,
  buildAxiosConfig,
  clearSiteCache,
  __setHttpForTest,
  __setNowForTest,
};
