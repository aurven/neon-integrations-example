'use strict';
/**
 * Site Builder endpoints: preview (no side effects) and create.
 * Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildPlan } = require('../helpers/site-builder/plan.js');
const { checkPlan, createSiteFromPlan, demoReport } = require('../helpers/site-builder/create-site.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const DEMO_SITE_HOST_SUFFIX = '-demo.neon.example';

let clientProvider = () => neonApi.currentClient();

function readRequest(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return null; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'site creation requires an admin key' }); return null; }
  const { title, outline } = request.body || {};
  if (typeof title !== 'string' || typeof outline !== 'string') {
    reply.status(400).send({ error: 'body must be { title: string, outline: string }' });
    return null;
  }
  if (!request.neonEnv) {
    reply.status(400).send({ errors: ['No Neon environment selected for this request'] });
    return null;
  }
  return { title, outline, env: request.neonEnv, demo: request.query?.demo === 'true' };
}

// Demo mode works on any env: a missing siteHostSuffix is replaced by a placeholder
function planEnv(env, demo) {
  if (!demo || env.neon?.fo?.siteHostSuffix) return env;
  return { ...env, neon: { ...env.neon, fo: { ...(env.neon?.fo || {}), siteHostSuffix: DEMO_SITE_HOST_SUFFIX } } };
}

async function planWithChecks({ title, outline, env, demo }) {
  const plan = buildPlan({ title, outline }, planEnv(env, demo));
  const errors = [...plan.errors];
  if (!demo && plan.site.name) errors.push(...await checkPlan(plan, clientProvider(), env.id));
  return { plan, errors };
}

async function previewSiteHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, errors } = await planWithChecks(req);
  return reply.status(200).send({
    env: req.env.id,
    site: { name: plan.site.name, title: plan.site.title, liveHostname: plan.site.liveHostname },
    sections: plan.sections.map(({ path, title, depth, name }) => ({ path, title, depth, name })),
    errors,
  });
}

async function createSiteHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, errors } = await planWithChecks(req);
  if (errors.length) return reply.status(400).send({ errors });
  if (req.demo) return reply.status(200).send(demoReport(plan, req.env.id));
  const report = await createSiteFromPlan(plan, clientProvider(), req.env.id);
  console.log(`[site-builder] env=${req.env.id} site=${plan.site.name} status=${report.site.status} counts=${JSON.stringify(report.counts)}`);
  return reply.status(report.site.status === 'created' ? 200 : 502).send(report);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || (() => neonApi.currentClient());
}

module.exports = { previewSiteHandler, createSiteHandler, __setClientProviderForTest };
