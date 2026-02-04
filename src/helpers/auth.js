/**
 * Authentication helper for API endpoints
 * Checks for API key in headers, query params, or cookies
 * Sets a cookie if authentication is successful
 * Supports multiple API keys with different access levels
 *
 * @param {Object} request - Fastify request object
 * @param {Object} reply - Fastify reply object
 * @returns {Object} - { authenticated: boolean, apikey: string|null, role: 'admin'|'limited'|null }
 */
function authenticate(request, reply) {
  const apikey = request.headers.apikey || request.query.apikey || request.cookies.apikey;

  // Admin key (full access)
  if (apikey && apikey === process.env.NEON_EXT_APIKEY) {
    reply.setCookie('apikey', apikey, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 // 24 hours in seconds
    });
    return { authenticated: true, apikey, role: 'admin' };
  }

  // Limited key (restricted access)
  if (apikey && process.env.NEON_EXT_APIKEY_LIMITED && apikey === process.env.NEON_EXT_APIKEY_LIMITED) {
    reply.setCookie('apikey', apikey, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 // 24 hours in seconds
    });
    return { authenticated: true, apikey, role: 'limited' };
  }

  return { authenticated: false, apikey: null, role: null };
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
  shouldShowMaintenance,
  RESTRICTED_PANELS
};
