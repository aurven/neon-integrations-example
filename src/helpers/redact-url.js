'use strict';
/**
 * Redacts `apikey=<value>` query params from a request URL/path before it is logged.
 * Env-bound Neon apikeys are otherwise plainly visible in access logs (Fastify request
 * logger, reverse proxy logs, etc.) whenever they're passed as `?apikey=`.
 */
const APIKEY_PARAM_RE = /([?&]apikey=)[^&#]*/gi;

function redactApikeyParam(url) {
  if (typeof url !== 'string') return url;
  return url.replace(APIKEY_PARAM_RE, '$1[redacted]');
}

module.exports = { redactApikeyParam };
