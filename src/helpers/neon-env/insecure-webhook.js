'use strict';
/**
 * Known-insecure fallback for Neon webhooks, which cannot send custom headers:
 * POST /in/neon/webhook/legacy?env=<id> is accepted WITHOUT an apikey, but only for
 * environments that opt in with "insecureWebhook": true in the registry.
 * Prefer /in/neon/webhook?apikey=<extApiKey>.
 */
const context = require('./context.js');
const { getRegistry } = require('./registry.js');

const DENIED = { error: 'insecure webhook not enabled for this environment' };

function withInsecureEnvParam(handler, { getRegistry: registryOf = getRegistry } = {}) {
  return async function insecureEnvParamHandler(request, reply) {
    if (request.neonAuth?.authenticated && request.neonEnv) {
      return handler.call(this, request, reply);
    }
    const id = request.query?.env;
    if (!id) return reply.status(400).send({ error: 'env query parameter required' });

    const env = registryOf().get(String(id));
    if (!env || env.insecureWebhook !== true) return reply.status(403).send(DENIED);

    console.warn(`[neon-env] ⚠️ insecure webhook accepted env=${env.id} (env from query, no apikey)`);
    request.neonEnv = env;
    reply.header('X-Neon-Env', env.id);
    reply.header('X-Neon-Env-Bo', env.neon.bo.host || '');
    return context.run(env, () => handler.call(this, request, reply));
  };
}

module.exports = { withInsecureEnvParam };
