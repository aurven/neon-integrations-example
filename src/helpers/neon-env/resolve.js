'use strict';
/**
 * Request -> Neon environment resolution.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §2 (+ Amendments)
 */

// Headers that can reveal the calling Neon host. Settle after the /debug/headers probe (Task 13).
const HOST_HEADERS = ['origin', 'referer', 'x-forwarded-host'];

const UNAUTH = Object.freeze({ authenticated: false, apikey: null, role: null, global: false });

function pickApiKey(req) {
  return req.headers?.apikey || req.query?.apikey || req.cookies?.apikey || null;
}

function pickExplicitEnv(req) {
  if (req.headers?.['x-neon-env']) return { id: String(req.headers['x-neon-env']), from: 'header' };
  if (req.query?.env) return { id: String(req.query.env), from: 'query' };
  if (req.cookies?.neonEnv) return { id: String(req.cookies.neonEnv), from: 'cookie' };
  return null;
}

function hostFromHeaderValue(value) {
  if (!value) return null;
  const first = String(value).split(',')[0].trim();
  if (!first || first === 'null') return null;
  try {
    return new URL(first.includes('://') ? first : `https://${first}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function defaultSelfHosts(req) {
  const hosts = [req.headers?.host];
  if (process.env.PROJECT_DOMAIN) hosts.push(hostFromHeaderValue(process.env.PROJECT_DOMAIN));
  return hosts;
}

function callerHosts(req, selfHosts) {
  const self = new Set(selfHosts.filter(Boolean).map((h) => String(h).toLowerCase()));
  const out = new Set();
  for (const name of HOST_HEADERS) {
    const h = hostFromHeaderValue(req.headers?.[name]);
    if (h && !self.has(h)) out.add(h);
  }
  return [...out];
}

function result(auth, env, extra = {}) {
  return { auth, env: env || null, error: null, setEnvCookie: null, clearEnvCookie: false, ...extra };
}

function resolveRequest(req, registry, { selfHosts } = {}) {
  const hosts = callerHosts(req, selfHosts || defaultSelfHosts(req));
  const apikey = pickApiKey(req);
  let auth;
  let env = null;
  const extra = {};

  const bound = apikey ? registry.byKey(apikey) : null;
  if (bound) {
    auth = { authenticated: true, apikey, role: bound.role, global: false };
    env = bound.env;
  } else if (apikey && registry.isAdminKey(apikey)) {
    auth = { authenticated: true, apikey, role: 'admin', global: true };
    const explicit = pickExplicitEnv(req);
    if (explicit) {
      env = registry.get(explicit.id);
      if (!env && explicit.from !== 'cookie') {
        return result(auth, null, {
          error: { status: 400, message: `Unknown Neon environment '${explicit.id}'. Valid: ${registry.ids().join(', ')}` },
        });
      }
      if (!env) extra.clearEnvCookie = true;
      else if (explicit.from !== 'cookie') extra.setEnvCookie = env.id;
    }
    if (!env) env = hosts.map((h) => registry.byHost(h)).find(Boolean) || registry.getDefault();
  } else {
    auth = { ...UNAUTH };
    // Legacy mode keeps today's behaviour: keyless routes (e.g. webhooks) still reach the single Neon.
    env = registry.source === 'legacy' ? registry.getDefault() : null;
  }

  if (env && env.hosts.length) {
    // Only reject a caller host that belongs to a *different* registered environment.
    // An unrecognized host (e.g. a Referer from Notion/Slack/Google on a standalone link)
    // is ignored rather than rejected.
    const foreign = hosts.filter((h) => {
      if (env.hosts.includes(h)) return false;
      const other = registry.byHost(h);
      return other && other.id !== env.id;
    });
    if (foreign.length) {
      return result(auth, null, {
        error: {
          status: 403,
          message: `Request host ${foreign.join(', ')} does not belong to Neon environment '${env.id}'`,
          log: `[neon-env] host mismatch env=${env.id} host=${foreign.join(',')}`,
        },
      });
    }
  }

  return result(auth, env, extra);
}

module.exports = { resolveRequest, callerHosts, HOST_HEADERS, pickApiKey };
