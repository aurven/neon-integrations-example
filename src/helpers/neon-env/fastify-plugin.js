'use strict';
/**
 * Resolves every request to a Neon environment and runs the rest of the
 * request lifecycle inside that environment's AsyncLocalStorage context.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §2-§4
 */
const fp = require('fastify-plugin');
const { resolveRequest } = require('./resolve.js');
const context = require('./context.js');
const { getRegistry } = require('./registry.js');
const { injectBanner } = require('./page-banner.js');

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60,
};

async function neonEnvPlugin(fastify, opts) {
  const registryOf = opts.getRegistry || getRegistry;

  fastify.decorateRequest('neonAuth', null);
  fastify.decorateRequest('neonEnv', null);

  // Callback-style hook: context.run(env, done) makes the rest of the lifecycle run inside the env context
  fastify.addHook('onRequest', (request, reply, done) => {
    const r = resolveRequest(request, registryOf());
    request.neonAuth = r.auth;
    request.neonEnv = r.env;

    if (r.error) {
      if (r.error.log) console.warn(r.error.log);
      reply.code(r.error.status).send({ error: r.error.message });
      return;
    }
    if (r.setEnvCookie) reply.setCookie('neonEnv', r.setEnvCookie, COOKIE_OPTS);
    if (r.clearEnvCookie) reply.clearCookie('neonEnv', { path: '/' });
    if (r.env) {
      reply.header('X-Neon-Env', r.env.id);
      reply.header('X-Neon-Env-Bo', r.env.neon.bo.host || '');
    }
    context.run(r.env, done);
  });

  fastify.addHook('onSend', (request, reply, payload, done) => {
    const type = String(reply.getHeader('content-type') || '');
    if (typeof payload !== 'string' || !type.includes('text/html')) return done(null, payload);
    done(null, injectBanner(payload, request.neonEnv));
  });
}

module.exports = fp(neonEnvPlugin, { name: 'neon-env', dependencies: ['@fastify/cookie'] });
