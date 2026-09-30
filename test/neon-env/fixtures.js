'use strict';
function envJson(id, overrides = {}) {
  return {
    id,
    label: `Label ${id}`,
    hosts: [`neon-app-${id}.example.com`],
    extApiKey: `key-${id}`,
    neon: {
      app: { url: `https://neon-app-${id}.example.com` },
      bo: { url: `https://neon-bo-${id}.example.com/api`, apiKey: `bo-${id}`, userApiKey: `user-${id}` },
      fo: { apiKey: `fo-${id}`, sites: { theglobe: { live: `https://fo-${id}.example.com` } } },
    },
    ...overrides,
  };
}
function registryJson(envs, extra = {}) {
  return { version: 1, adminApiKey: 'admin-key', environments: envs, ...extra };
}
module.exports = { envJson, registryJson };
