'use strict';
/**
 * Site Builder plan: site title + indented outline → Neon site/section payloads + validation errors.
 * Pure, no network. Spec: docs/superpowers/specs/2026-10-12-site-builder-design.md §2
 */

const MAX_SECTIONS = 200;
const TAB_WIDTH = 2;

function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH;
    else break;
  }
  return width;
}

function parseOutline(outline) {
  const sections = [];
  const errors = [];
  let stack = []; // open levels: { width, depth, index }

  String(outline ?? '').replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const width = indentWidth(raw);
    const title = raw.trim();

    let parent = null;
    let depth;
    let nextStack;
    if (stack.length === 0) {
      if (width !== 0) { errors.push(`line ${line}: first section cannot be indented`); return; }
      depth = 1;
      nextStack = [];
    } else if (width > stack[stack.length - 1].width) {
      parent = stack[stack.length - 1];
      depth = parent.depth + 1;
      nextStack = [...stack];
    } else {
      const s = [...stack];
      while (s.length && s[s.length - 1].width > width) s.pop();
      const level = s[s.length - 1];
      if (!level || level.width !== width) { errors.push(`line ${line}: indentation does not match any parent level`); return; }
      s.pop();
      parent = s[s.length - 1] || null;
      depth = level.depth;
      nextStack = s;
    }

    const name = slugify(title);
    if (!name) { errors.push(`line ${line}: "${title}" has no usable characters for a name`); return; }

    const parentPath = parent ? sections[parent.index].path : '/';
    const index = sections.length;
    sections.push({ line, title, name, depth, parentIndex: parent ? parent.index : null, path: `${parentPath}${name}/` });
    nextStack.push({ width, depth, index });
    stack = nextStack;
  });

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
