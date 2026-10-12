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
      fo: { url: `https://neon-fo-${id}.example.com`, apiKey: `fo-${id}` },
    },
    ...overrides,
  };
}
function registryJson(envs, extra = {}) {
  return { version: 1, adminApiKey: 'admin-key', environments: envs, ...extra };
}
module.exports = { envJson, registryJson };
