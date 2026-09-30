'use strict';
/**
 * Third-party service config: per-environment block, else global env vars.
 * Fallback is per block, never per field (credentials from different accounts never mix).
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §5
 */
const { currentEnv } = require('./context.js');
const { NeonEnvConfigError } = require('./errors.js');

const GLOBAL_SERVICES = {
  anthropic: { apiKey: 'ANTHROPIC_API_KEY', chatModel: 'CLAUDE_CHAT_MODEL' },
  openai: { apiKey: 'OPENAI_APIKEY' },
  pexels: { apiKey: 'PEXELS_APIKEY' },
  youtube: { apiKey: 'YOUTUBE_APIKEY' },
  dailymotion: { apiKey: 'DAILYMOTION_APIKEY', apiSecret: 'DAILYMOTION_APISECRET' },
  trello: { apiKey: 'TRELLO_APIKEY', token: 'TRELLO_TOKEN', organizationId: 'TRELLO_ORGANIZATION_ID', panelDraggable: 'TRELLO_PANEL_DRAGGABLE' },
  guardian: { apiKey: 'GUARDIAN_APIKEY' },
  deepl: { apiKey: 'DEEPL_APIKEY' },
  sendgrid: { apiKey: 'SENDGRID_APIKEY' },
  mailjet: { apiKey: 'MAILJET_APIKEY', apiSecret: 'MAILJET_APISECRET' },
  telegram: { botToken: 'TELEGRAM_BOT_TOKEN', chatIds: { default: 'TELEGRAM_CHAT_ID', theglobe: 'TELEGRAM_THEGLOBE_CHAT_ID' } },
  methode: {
    server: 'EDAPI_SERVER', restEndpoint: 'EDAPI_REST_ENDPOINT', connectionId: 'EDAPI_CONNECTIONID', databaseId: 'EDAPI_DATABASEID',
    username: 'EDAPI_USERNAME', password: 'EDAPI_PASSWORD', swingHost: 'SWING_HOST', swingAppUrl: 'SWING_APP_URL',
  },
  bluesky: { handle: 'BLUESKY_HANDLE', appPassword: 'BLUESKY_APP_PASSWORD' },
  twitter: { apiKey: 'TWITTER_API_KEY', apiSecret: 'TWITTER_API_SECRET', accessToken: 'TWITTER_ACCESS_TOKEN', accessSecret: 'TWITTER_ACCESS_SECRET' },
  facebook: { pageId: 'FACEBOOK_PAGE_ID', pageAccessToken: 'FACEBOOK_PAGE_ACCESS_TOKEN' },
  instagram: { accountId: 'INSTAGRAM_ACCOUNT_ID', accessToken: 'INSTAGRAM_ACCESS_TOKEN' },
  threads: { userId: 'THREADS_USER_ID', accessToken: 'THREADS_ACCESS_TOKEN' },
};

function fromEnvVars(map, envVars) {
  const out = {};
  for (const [field, source] of Object.entries(map)) {
    out[field] = typeof source === 'object' ? fromEnvVars(source, envVars) : envVars[source];
  }
  return out;
}

function serviceConfig(name, { envVars = process.env } = {}) {
  if (!GLOBAL_SERVICES[name]) throw new Error(`Unknown service '${name}'`);
  const env = currentEnv();
  const block = env?.services?.[name];
  if (block) return { ...block, source: `env:${env.id}` };
  return { ...fromEnvVars(GLOBAL_SERVICES[name], envVars), source: 'global' };
}

function missingServiceFields(name, fields, opts = {}) {
  const cfg = serviceConfig(name, opts);
  const missing = fields.filter((f) => !cfg[f]);
  if (cfg.source === 'global') return missing.map((f) => GLOBAL_SERVICES[name][f]);
  return missing.map((f) => `services.${name}.${f}`);
}

function requireService(name, fields, opts = {}) {
  const cfg = serviceConfig(name, opts);
  const missing = missingServiceFields(name, fields, opts);
  if (missing.length) {
    const where = cfg.source === 'global' ? 'not configured' : `incomplete for env ${cfg.source.slice(4)}`;
    throw new NeonEnvConfigError(`${name} ${where}: missing ${missing.join(', ')}`);
  }
  return cfg;
}

module.exports = { GLOBAL_SERVICES, serviceConfig, requireService, missingServiceFields };
