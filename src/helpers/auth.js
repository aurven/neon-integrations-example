/**
 * Authentication helper for API endpoints
 * Checks for API key in headers, query params, or cookies
 * Sets a cookie if authentication is successful
 *
 * @param {Object} request - Fastify request object
 * @param {Object} reply - Fastify reply object
 * @returns {Object} - { authenticated: boolean, apikey: string|null }
 */
function authenticate(request, reply) {
  const apikey = request.headers.apikey || request.query.apikey || request.cookies.apikey;

  if (!apikey || apikey !== process.env.NEON_EXT_APIKEY) {
    return { authenticated: false, apikey: null };
  }

  // Set cookie for future requests (24 hours expiry)
  reply.setCookie('apikey', apikey, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 // 24 hours in seconds
  });

  return { authenticated: true, apikey };
}

module.exports = {
  authenticate
};
