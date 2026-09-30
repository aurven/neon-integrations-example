'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const { NoNeonEnvError } = require('./errors.js');

const als = new AsyncLocalStorage();

function run(env, fn) {
  return als.run({ env: env || null }, fn);
}

function currentEnv() {
  return als.getStore()?.env || null;
}

function requireEnv() {
  const env = currentEnv();
  if (env) return env;
  const { getRegistry } = require('./registry.js');
  throw new NoNeonEnvError(getRegistry().ids());
}

module.exports = { run, currentEnv, requireEnv };
