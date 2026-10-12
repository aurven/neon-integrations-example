'use strict';
/**
 * Site Builder: check a plan against Neon, then create the site and its sections
 * parent-first, continuing past failures (failed section → descendants skipped).
 * Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §3
 */
const { sectionPayload } = require('./plan.js');

const SITES_LOOKUP_LIMIT = 1000;
const ROOT_ID_UNKNOWN = "could not determine the new site's root node id";

function errorMessage(error) {
  const status = error && error.response && error.response.status;
  const detail = (error && error.response && error.response.data && error.response.data.message) || (error && error.message) || String(error);
  return status ? `${status}: ${detail}` : detail;
}

function siteMatches(site, name) {
  const wanted = String(name).toLowerCase();
  return [site && site.name, site && site.siteName].some((v) => typeof v === 'string' && v.toLowerCase() === wanted);
}

async function listSites(neon) {
  const sites = await neon.getSites({ limit: SITES_LOOKUP_LIMIT });
  return Array.isArray(sites) ? sites : [];
}

async function checkPlan(plan, neon, envId) {
  if (!plan.site.name) return [];
  let sites;
  try {
    sites = await listSites(neon);
  } catch (error) {
    return [`could not check existing sites in env ${envId}: ${error.message}`];
  }
  return sites.some((s) => siteMatches(s, plan.site.name)) ? [`site "${plan.site.name}" already exists in env ${envId}`] : [];
}

function firstNonEmpty(...values) {
  return values.find((v) => typeof v === 'string' && v.length > 0) || null;
}

async function resolveRootId(created, neon, siteName) {
  const direct = firstNonEmpty(created && created.id, created && created.familyRef, created && created.root && created.root.id, created && created.result && created.result.id);
  if (direct) return direct;
  try {
    const site = (await listSites(neon)).find((s) => siteMatches(s, siteName));
    return site ? firstNonEmpty(site.id, site.root && site.root.id, site.familyRef) : null;
  } catch {
    return null;
  }
}

function baseReport(plan, envId) {
  return {
    env: envId,
    site: { status: 'failed', name: plan.site.name, title: plan.site.title, liveHostname: plan.site.liveHostname },
    sections: plan.sections.map((s) => ({ path: s.path, title: s.title, depth: s.depth, status: 'skipped' })),
    counts: { created: 0, failed: 0, skipped: 0 },
  };
}

function finalize(report) {
  for (const s of report.sections) report.counts[s.status] += 1;
  return report;
}

async function createSiteFromPlan(plan, neon, envId) {
  const report = baseReport(plan, envId);

  let created;
  try {
    created = await neon.createHeadlessSite(plan.site.payload);
  } catch (error) {
    report.site.error = errorMessage(error);
    report.sections.forEach((s) => { s.error = 'site was not created'; });
    return finalize(report);
  }
  report.site.status = 'created';

  const rootId = await resolveRootId(created, neon, plan.site.name);
  if (!rootId) {
    report.site.error = ROOT_ID_UNKNOWN;
    report.sections.forEach((s) => { s.error = ROOT_ID_UNKNOWN; });
    return finalize(report);
  }
  report.site.id = rootId;

  for (let i = 0; i < plan.sections.length; i += 1) {
    const section = plan.sections[i];
    const result = report.sections[i];
    let parentId = rootId;
    if (section.parentIndex !== null) {
      const parent = report.sections[section.parentIndex];
      if (parent.status !== 'created') {
        result.status = 'skipped';
        result.error = `parent "${parent.path}" was not created`;
        continue;
      }
      parentId = parent.id;
    }
    try {
      const node = await neon.createSiteNodeRaw(sectionPayload(section, plan.site.name, parentId));
      const id = firstNonEmpty(node && node.id, node && node.familyRef);
      if (id) {
        result.status = 'created';
        result.id = id;
      } else {
        result.status = 'failed';
        result.error = 'node created but no id returned';
      }
    } catch (error) {
      result.status = 'failed';
      result.error = errorMessage(error);
    }
  }

  return finalize(report);
}

function demoReport(plan, envId) {
  const report = baseReport(plan, envId);
  report.site.status = 'created';
  report.site.id = 'demo-root';
  report.sections.forEach((s, i) => { s.status = 'created'; s.id = `demo-${i + 1}`; });
  return finalize(report);
}

module.exports = { checkPlan, createSiteFromPlan, demoReport };
