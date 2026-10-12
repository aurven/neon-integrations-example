'use strict';
/**
 * Taxonomy Builder endpoints: preview (reads only), sync create (≤500 items) and background jobs (≤50,000 items).
 * Specs: docs/superpowers/specs/2026-10-12-taxonomy-builder-design.md §4,
 *        docs/superpowers/specs/2026-10-13-taxonomy-builder-jobs-design.md §1, §2, §4
 */
const { authenticate } = require('../helpers/auth.js');
const { buildTaxonomyPlan, JOB_MAX_ITEMS } = require('../helpers/taxonomy-builder/plan.js');
const { readExisting, previewView, createTaxonomy, demoReport, httpStatusFor, PREVIEW_CAP } = require('../helpers/taxonomy-builder/create-taxonomy.js');
const jobs = require('../helpers/taxonomy-builder/jobs.js');
const neonApi = require('../helpers/neon-bo-api-v3.js');

const BAD_BODY = 'body must be { categories: string, tags: string, defaultLanguage?: string }';
const BODY_LIMIT = 5 * 1024 * 1024;

const JOB_CALL_TIMEOUT_MS = 60 * 1000;

const defaultClientProvider = () => neonApi.currentClient();
const defaultJobClientProvider = (env) => new neonApi.NeonClient({ env, quiet: true, timeoutMs: JOB_CALL_TIMEOUT_MS });
let clientProvider = defaultClientProvider;
let jobClientProvider = defaultJobClientProvider;

function requireAdmin(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) { reply.status(401).send({ error: 'Unauthorized' }); return false; }
  if (auth.role !== 'admin') { reply.status(403).send({ error: 'taxonomy creation requires an admin key' }); return false; }
  return true;
}

// Global admin sees every env's jobs; any other key only its env's ('' when unresolved matches nothing).
function scopeOf(request) {
  return { envId: request.neonAuth?.global ? null : (request.neonEnv?.id || '') };
}

function readRequest(request, reply) {
  if (!requireAdmin(request, reply)) return null;
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

async function planWithReads(req, maxItems) {
  const plan = buildTaxonomyPlan({ categories: req.categories, tags: req.tags, defaultLanguage: req.defaultLanguage, maxItems });
  if (plan.errors.length || req.demo) return { plan, existing: newState(plan), errors: [...plan.errors] };
  const { existing, errors } = await readExisting(plan, clientProvider(), req.env.id);
  return { plan, existing, errors };
}

async function previewTaxonomyHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const { plan, existing, errors } = await planWithReads(req, JOB_MAX_ITEMS);
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

function conflict(reply, envId, jobId) {
  return reply.status(409).send({ error: `a taxonomy job is already running in env ${envId}`, jobId });
}

async function startTaxonomyJobHandler(request, reply) {
  const req = readRequest(request, reply);
  if (!req) return reply;
  const running = jobs.runningJobId(req.env.id);
  if (running) return conflict(reply, req.env.id, running);
  const { plan, existing, errors } = await planWithReads(req, JOB_MAX_ITEMS);
  if (errors.length) return reply.status(400).send({ errors: errors.slice(0, PREVIEW_CAP), errorCount: errors.length });
  try {
    const job = req.demo
      ? jobs.startDemoJob({ plan, envId: req.env.id })
      : jobs.startJob({ plan, existing, env: req.env, client: jobClientProvider(req.env) });
    const toCreate = [...existing.categories, ...existing.tags].filter((m) => m.status !== 'exists').length;
    return reply.status(202).send({ jobId: job.jobId, total: job.total, toCreate });
  } catch (error) {
    if (error instanceof jobs.JobConflictError) return conflict(reply, req.env.id, error.jobId);
    throw error;
  }
}

function notFound(reply) {
  return reply.status(404).send({ error: 'job not found' });
}

async function listTaxonomyJobsHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  return reply.status(200).send({ jobs: jobs.listJobs(scopeOf(request)) });
}

async function getTaxonomyJobHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const job = jobs.getJob(request.params.id, scopeOf(request));
  return job ? reply.status(200).send(job) : notFound(reply);
}

async function taxonomyJobReportHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const report = jobs.getReport(request.params.id, scopeOf(request));
  if (!report) return notFound(reply);
  if (report.error) return reply.status(410).send(report);
  return reply
    .status(200)
    .header('Content-Disposition', `attachment; filename="${report.jobId}-report.json"`)
    .send(report);
}

async function cancelTaxonomyJobHandler(request, reply) {
  if (!requireAdmin(request, reply)) return reply;
  const result = jobs.cancelJob(request.params.id, scopeOf(request));
  if (!result) return notFound(reply);
  if (result.error) return reply.status(409).send(result);
  return reply.status(200).send(result);
}

function __setClientProviderForTest(fn) {
  clientProvider = fn || defaultClientProvider;
  jobClientProvider = fn ? () => fn() : defaultJobClientProvider;
}

module.exports = {
  previewTaxonomyHandler, createTaxonomyHandler,
  startTaxonomyJobHandler, listTaxonomyJobsHandler, getTaxonomyJobHandler, taxonomyJobReportHandler, cancelTaxonomyJobHandler,
  BODY_LIMIT, __setClientProviderForTest,
};
