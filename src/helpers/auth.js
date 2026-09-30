const { resolveRequest } = require('./neon-env/resolve.js');
const { getRegistry } = require('./neon-env/registry.js');

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 // 24 hours in seconds
};

/**
 * Authentication helper for API endpoints.
 * Uses the result resolved by the neon-env Fastify plugin (request.neonAuth);
 * falls back to resolving on the spot when the plugin is not registered.
 * Sets the apikey cookie on success.
 *
 * @returns {Object} - { authenticated, apikey, role: 'admin'|'limited'|null, env: Env|null }
 */
function authenticate(request, reply) {
  const auth = request.neonAuth || resolveRequest(request, getRegistry()).auth;
  if (!auth.authenticated) {
    return { authenticated: false, apikey: null, role: null, env: null };
  }
  reply.setCookie('apikey', auth.apikey, COOKIE_OPTS);
  return { authenticated: true, apikey: auth.apikey, role: auth.role, env: request.neonEnv || null };
}

/** True when the request carries an admin-role key (global admin or env-bound admin). */
function isAdminRequest(request) {
  const auth = request.neonAuth || resolveRequest(request, getRegistry()).auth;
  return auth.authenticated && auth.role === 'admin';
}

// Panels that require admin access
const RESTRICTED_PANELS = ['methode', 'social-media', 'trello', 'smartocto'];

/**
 * Check if a panel should show maintenance page
 * @param {Object} request - Fastify request object
 * @param {Object} auth - Authentication result from authenticate()
 * @param {string} panelName - Name of the panel being accessed
 * @returns {boolean} - true if maintenance page should be shown
 */
function shouldShowMaintenance(request, auth, panelName) {
  // Query param for testing maintenance view
  if (request.query.demo === 'maintenance') {
    return true;
  }
  // Limited users cannot access restricted panels
  if (auth.role === 'limited' && RESTRICTED_PANELS.includes(panelName)) {
    return true;
  }
  return false;
}

module.exports = {
  authenticate,
  isAdminRequest,
  shouldShowMaintenance,
  RESTRICTED_PANELS
};
