'use strict';
const context = require('./context.js');
const registry = require('./registry.js');

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
};
