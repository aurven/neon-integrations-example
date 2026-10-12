'use strict';
/**
 * Site Builder plan: site title + indented outline → Neon site/section payloads + validation errors.
 * Pure, no network. Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §2
 */

const { parseIndented } = require('../outline/parse-indented.js');

const MAX_SECTIONS = 200;

function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseOutline(outline) {
  const parsed = parseIndented(outline, {
    firstLineNoun: 'section',
    accept: (title) => (slugify(title) ? null : `"${title}" has no usable characters for a name`),
  });
  const errors = [...parsed.errors];
  const sections = [];
  for (const entry of parsed.entries) {
    const name = slugify(entry.text);
    const parentPath = entry.parentIndex === null ? '/' : sections[entry.parentIndex].path;
    sections.push({ line: entry.line, title: entry.text, name, depth: entry.depth, parentIndex: entry.parentIndex, path: `${parentPath}${name}/` });
  }

  const seen = new Map();
  for (const section of sections) {
    const key = `${section.parentIndex}|${section.name}`;
    if (seen.has(key)) {
      const parentPath = section.parentIndex === null ? '/' : sections[section.parentIndex].path;
      errors.push(`line ${section.line}: duplicate section "${section.name}" under ${parentPath}`);
    } else {
      seen.set(key, section);
    }
  }

  return { sections, errors };
}

function buildPlan({ title, outline } = {}, env) {
  const errors = [];
  const siteTitle = String(title ?? '').trim();
  const name = slugify(siteTitle);
  if (!siteTitle) errors.push('title is required');
  else if (!name) errors.push('title has no usable characters for a site name');

  const suffix = env?.neon?.fo?.siteHostSuffix;
  if (!suffix) errors.push(`site creation not configured for env ${env?.id}: neon.fo.siteHostSuffix missing`);
  const liveHostname = name && suffix ? `https://${name.replace(/-/g, '')}${suffix}` : null;

  const parsed = parseOutline(outline);
  errors.push(...parsed.errors);
  if (parsed.sections.length > MAX_SECTIONS) {
    errors.push(`outline has ${parsed.sections.length} sections; the limit is ${MAX_SECTIONS}`);
  }

  return {
    site: {
      name,
      title: siteTitle,
      liveHostname,
      payload: { type: 'site/headless', name, description: '', parentRef: '', familyRef: '', title: siteTitle, liveHostname, group: '' },
    },
    sections: parsed.sections,
    errors,
  };
}

function sectionPayload(section, siteName, parentId) {
  return {
    siteName,
    parentId,
    name: section.name,
    type: 'section',
    title: section.title,
    description: null,
    path: section.path,
    style: { theme: null, variant: null, type: null, template: null },
    status: null,
  };
}

module.exports = { MAX_SECTIONS, slugify, parseOutline, buildPlan, sectionPayload };
