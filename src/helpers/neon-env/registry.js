'use strict';
/**
 * Neon environment registry.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §1
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RegistryFormatError } = require('./errors.js');

const DEFAULT_PATHS = [
  '/etc/secrets/neon-environments.json',
  path.join(process.cwd(), 'config', 'neon-environments.json'),
];
const ID_RE = /^[a-z0-9-]+$/;
const LEGACY_VARS = ['NEON_BO_URL', 'NEON_BO_APIKEY', 'NEON_USER_API_KEY', 'NEON_APP_URL', 'NEON_FO_APIKEY'];
const LEGACY_FO_RE = /^NEON_FO_(.+)_(LIVE|PREVIEW|STAGE)_URL$/;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

function resolveRefs(value, envVars, missing) {
  if (typeof value === 'string' && value.startsWith('env:')) {
    const name = value.slice(4);
    if (envVars[name] === undefined || envVars[name] === '') {
      missing.push(name);
      return undefined;
    }
    return envVars[name];
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, envVars, missing));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, envVars, missing);
    return out;
  }
  return value;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function validateEntry(raw) {
  if (!raw || typeof raw !== 'object') return ['entry must be an object'];
  const errors = [];
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errors.push('id must match ^[a-z0-9-]+$');
  if (!isNonEmptyString(raw.label)) errors.push('label is required');
  if (!Array.isArray(raw.hosts) || raw.hosts.length === 0 || !raw.hosts.every(isNonEmptyString)) {
    errors.push('hosts must be a non-empty array of strings');
  }
  if (!isNonEmptyString(raw.extApiKey)) errors.push('extApiKey is required');
  if (raw.extApiKeyLimited !== undefined) {
    if (!isNonEmptyString(raw.extApiKeyLimited)) errors.push('extApiKeyLimited must be a non-empty string');
    else if (raw.extApiKeyLimited === raw.extApiKey) errors.push('extApiKeyLimited must differ from extApiKey');
  }
  const neon = raw.neon || {};
  if (!neon.app || !hostOf(neon.app.url)) errors.push('neon.app.url must be a URL');
  if (!neon.bo || !hostOf(neon.bo.url)) errors.push('neon.bo.url must be a URL');
  if (!neon.bo || !isNonEmptyString(neon.bo.apiKey)) errors.push('neon.bo.apiKey is required');
  if (!neon.bo || !isNonEmptyString(neon.bo.userApiKey)) errors.push('neon.bo.userApiKey is required');
  if (neon.fo !== undefined) {
    if (!isNonEmptyString(neon.fo?.apiKey)) errors.push('neon.fo.apiKey is required when neon.fo is set');
    if (!neon.fo?.sites || typeof neon.fo.sites !== 'object') errors.push('neon.fo.sites must be an object when neon.fo is set');
  }
  if (raw.services !== undefined && (typeof raw.services !== 'object' || Array.isArray(raw.services) || raw.services === null)) {
    errors.push('services must be an object');
  }
  if (raw.insecureWebhook !== undefined && typeof raw.insecureWebhook !== 'boolean') errors.push('insecureWebhook must be a boolean');
  return errors;
}

function lowerKeys(sites) {
  const out = {};
  for (const [site, envs] of Object.entries(sites || {})) {
    out[site.toLowerCase()] = {};
    for (const [stage, url] of Object.entries(envs || {})) out[site.toLowerCase()][stage.toLowerCase()] = url;
  }
  return out;
}

function normalize(raw, keySource) {
  return {
    id: raw.id,
    label: raw.label,
    isDefault: raw.default === true,
    hosts: raw.hosts.map((h) => h.toLowerCase()),
    extApiKey: raw.extApiKey,
    extApiKeyLimited: raw.extApiKeyLimited || null,
    warmup: raw.warmup !== false,
    insecureWebhook: raw.insecureWebhook === true,
    keySource,
    neon: {
      insecureTls: raw.neon.insecureTls === true,
      app: { url: raw.neon.app.url },
      bo: { url: raw.neon.bo.url, apiKey: raw.neon.bo.apiKey, userApiKey: raw.neon.bo.userApiKey, host: hostOf(raw.neon.bo.url) },
      fo: raw.neon.fo ? { apiKey: raw.neon.fo.apiKey, sites: lowerKeys(raw.neon.fo.sites) } : null,
    },
    services: raw.services || {},
  };
}

function rejectCollisions(envs, keysOf, reason, skipped) {
  const owners = new Map();
  envs.forEach((e, idx) => {
    for (const k of new Set(keysOf(e))) owners.set(k, (owners.get(k) || []).concat(idx));
  });
  const bad = new Set();
  for (const idxs of owners.values()) if (idxs.length > 1) idxs.forEach((i) => bad.add(i));
  return envs.filter((e, idx) => {
    if (!bad.has(idx)) return true;
    skipped.push({ id: e.id, reason });
    return false;
  });
}

function buildLegacyEnv(envVars) {
  const sites = {};
  for (const [name, value] of Object.entries(envVars)) {
    const m = name.match(LEGACY_FO_RE);
    if (m && value) {
      const site = m[1].toLowerCase();
      sites[site] = sites[site] || {};
      sites[site][m[2].toLowerCase()] = value;
    }
  }
  const hasFo = !!envVars.NEON_FO_APIKEY || Object.keys(sites).length > 0;
  return {
    id: 'legacy',
    label: envVars.NEON_EXT_LOCATION || 'Legacy',
    isDefault: true,
    hosts: [],
    extApiKey: envVars.NEON_EXT_APIKEY || null,
    extApiKeyLimited: envVars.NEON_EXT_APIKEY_LIMITED || null,
    warmup: true,
    insecureWebhook: true, // legacy mode: keyless webhooks keep working as today
    keySource: 'legacy',
    neon: {
      insecureTls: envVars.NEON_EXT_LOCATION === 'Local',
      app: { url: envVars.NEON_APP_URL || '' },
      bo: {
        url: envVars.NEON_BO_URL || '',
        apiKey: envVars.NEON_BO_APIKEY || '',
        userApiKey: envVars.NEON_USER_API_KEY || '',
        host: hostOf(envVars.NEON_BO_URL),
      },
      fo: hasFo ? { apiKey: envVars.NEON_FO_APIKEY || '', sites } : null,
    },
    services: {},
  };
}

class Registry {
  constructor({ environments, adminApiKey, source, skipped = [], warnings = [] }) {
    this.environments = environments;
    this.adminApiKey = adminApiKey || null;
    this.source = source;
    this.skipped = skipped;
    this.warnings = warnings;
    this._byId = new Map(environments.map((e) => [e.id, e]));
  }
  list() { return this.environments; }
  ids() { return this.environments.map((e) => e.id); }
  get(id) { return this._byId.get(id) || null; }
  getDefault() { return this.environments.find((e) => e.isDefault) || null; }
  byKey(key) {
    for (const env of this.environments) {
      if (safeEqual(key, env.extApiKey)) return { env, role: 'admin' };
      if (safeEqual(key, env.extApiKeyLimited)) return { env, role: 'limited' };
    }
    return null;
  }
  byHost(host) {
    const h = String(host || '').toLowerCase();
    return this.environments.find((e) => e.hosts.includes(h)) || null;
  }
  isAdminKey(key) { return safeEqual(key, this.adminApiKey); }
}

function buildRegistry({ json, envVars = process.env }) {
  if (json === null || json === undefined) {
    return new Registry({
      environments: [buildLegacyEnv(envVars)],
      adminApiKey: envVars.NEON_EXT_APIKEY || null,
      source: 'legacy',
    });
  }
  if (typeof json !== 'object' || !Array.isArray(json.environments)) {
    throw new RegistryFormatError('registry must be an object with an "environments" array');
  }
  if (json.version !== 1) throw new RegistryFormatError(`unsupported registry version: ${json.version}`);

  const skipped = [];
  const warnings = [];
  const adminMissing = [];
  const adminApiKey = resolveRefs(json.adminApiKey, envVars, adminMissing) || null;
  if (adminMissing.length) {
    warnings.push(`adminApiKey references missing env var(s) ${adminMissing.join(', ')}: admin key disabled`);
  }

  let envs = [];
  json.environments.forEach((raw, i) => {
    const name = raw && typeof raw.id === 'string' ? raw.id : `#${i}`;
    const keySource = typeof raw?.extApiKey === 'string' && raw.extApiKey.startsWith('env:') ? 'env' : 'file';
    const missing = [];
    const resolved = resolveRefs(raw, envVars, missing);
    if (missing.length) {
      skipped.push({ id: name, reason: `missing env var(s): ${missing.join(', ')}` });
      return;
    }
    const errors = validateEntry(resolved);
    if (errors.length) {
      skipped.push({ id: name, reason: errors.join('; ') });
      return;
    }
    envs.push(normalize(resolved, keySource));
  });

  envs = rejectCollisions(envs, (e) => [e.id], 'duplicate id', skipped);
  envs = rejectCollisions(envs, (e) => [e.extApiKey, e.extApiKeyLimited].filter(Boolean), 'apikey shared with another environment', skipped);
  envs = rejectCollisions(envs, (e) => e.hosts, 'host shared with another environment', skipped);
  if (adminApiKey) {
    envs = envs.filter((e) => {
      if (e.extApiKey !== adminApiKey && e.extApiKeyLimited !== adminApiKey) return true;
      skipped.push({ id: e.id, reason: 'apikey equals adminApiKey' });
      return false;
    });
  }

  const defaults = envs.filter((e) => e.isDefault);
  if (defaults.length > 1) {
    warnings.push(`multiple default environments (${defaults.map((e) => e.id).join(', ')}): none will be default`);
    defaults.forEach((e) => { e.isDefault = false; });
  }
  if (LEGACY_VARS.some((v) => envVars[v])) {
    warnings.push('registry file present: legacy NEON_* env vars are ignored for Neon config');
  }

  return new Registry({ environments: envs, adminApiKey, source: 'file', skipped, warnings });
}

function loadRegistry({ paths = DEFAULT_PATHS, envVars = process.env, fsImpl = fs } = {}) {
  const file = paths.find((p) => fsImpl.existsSync(p));
  if (!file) return buildRegistry({ json: null, envVars });
  try {
    const reg = buildRegistry({ json: JSON.parse(fsImpl.readFileSync(file, 'utf8')), envVars });
    reg.file = file;
    return reg;
  } catch (error) {
    const reg = buildRegistry({ json: null, envVars });
    reg.file = file;
    reg.loadError = `${file}: ${error.message}`;
    reg.warnings.push(`registry file unusable, falling back to legacy: ${reg.loadError}`);
    return reg;
  }
}

let current = null;
function getRegistry() {
  if (!current) current = loadRegistry();
  return current;
}
function setRegistry(reg) {
  current = reg;
}

function printRegistrySummary(reg, log = console.log) {
  log(`[neon-env] registry source: ${reg.source}${reg.file ? ` (${reg.file})` : ''}`);
  for (const e of reg.list()) {
    log(`[neon-env]   ${e.isDefault ? '*' : ' '} ${e.id.padEnd(16)} ${e.label.padEnd(20)} bo=${e.neon.bo.host || '(none)'} key=${e.keySource} warmup=${e.warmup}`);
  }
  for (const s of reg.skipped) log(`[neon-env]   ✗ skipped ${s.id}: ${s.reason}`);
  for (const w of reg.warnings) log(`[neon-env]   ⚠️  ${w}`);
}

module.exports = {
  DEFAULT_PATHS,
  Registry,
  buildRegistry,
  loadRegistry,
  getRegistry,
  setRegistry,
  printRegistrySummary,
  safeEqual,
};
