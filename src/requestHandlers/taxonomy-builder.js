'use strict';
/**
 * Taxonomy Builder endpoints: preview (reads only) and create.
 * Spec: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildTaxonomyPlan } = require('../helpers/taxonomy-builder/plan.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor } = require('../helpers/taxonomy-builder/create-taxonomy.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const BAD_BODY = 'body must be { categories: string, tags: string, defaultLanguage?: string }';

let clientProvider = () => neonApi.currentClient();

function readRequest(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return null; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'taxonomy creation requires an admin key' }); return null; }
  const { categories, tags, defaultLanguage } = request.body || {};
  const validLanguage = defaultLanguage === undefined || (typeof defaultLanguage === 'string' && defaultLanguage.trim().length > 0);
  if (typeof categories !== 'string' || typeof tags !== 'string' || !validLanguage || (!categories.trim() && !tags.trim())) {
    reply.status(400).send({ error: BAD_BODY });
    return null;
  }
  if (!request.neonEnv) {
    reply.status(400).send({ errors: ['No Neon environment selected for this request'] });
    return null;
  }
  return { categories, tags, defaultLanguage, env: request.neonEnv, demo: request.query?.demo === 'true' };
}

function newState(plan) {
  return { categories: plan.categories.map(() => ({ status: 'new' })), tags: plan.tags.map(() => ({ status: 'new' })) };
}

async function planWithReads(req) {
  const plan = buildTaxonomyPlan(req);
  if (plan.errors.length || req.demo) return { plan, existing: newState(plan), errors: [...plan.errors] };
  const { existing, errors } = await readExisting(plan, clientProvider(), req.env.id);
  return { plan, existing, errors };
}

async function previewTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req);
  return reply.status(200).send(previewView(plan, existing, req.env.id, errors));
}

async function createTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req);
  if (errors.length) return reply.status(400).send({ errors });
  if (req.demo) return reply.status(200).send(demoReport(plan, req.env.id));
  const report = await createTaxonomy(plan, existing, clientProvider(), req.env.id);
  console.log(`[taxonomy-builder] env=${req.env.id} counts=${JSON.stringify(report.counts)}`);
  return reply.status(httpStatusFor(report)).send(report);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || (() => neonApi.currentClient());
}

module.exports = { previewTaxonomyHandler, createTaxonomyHandler, __setClientProviderForTest };
