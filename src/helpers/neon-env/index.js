'use strict';
const context = require('./context.js');
const registry = require('./registry.js');
const services = require('./services.js');

function appUrl() {
  return context.currentEnv()?.neon.app.url || '';
}

function insecureTls() {
  return context.currentEnv()?.neon.insecureTls === true;
}

module.exports = {
  run: context.run,
  currentEnv: context.currentEnv,
  requireEnv: context.requireEnv,
  getRegistry: registry.getRegistry,
  appUrl,
  insecureTls,
  serviceConfig: services.serviceConfig,
  requireService: services.requireService,
  missingServiceFields: services.missingServiceFields,
};
