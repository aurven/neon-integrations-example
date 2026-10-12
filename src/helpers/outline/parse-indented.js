'use strict';
/**
 * Shared indented-outline parser (Site Builder, Taxonomy Builder).
 * Optional comments: lines whose first non-blank character is # are skipped.
 * Tab = 2 spaces; wider than the previous line = child (depth + 1); equal = sibling;
 * narrower must match an open level exactly. Pure, no network.
 */
const TAB_WIDTH = 2;

function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH;
    else break;
  }
  return width;
}

function parseIndented(text, { firstLineNoun = 'line', accept, comments = false } = {}) {
  const entries = [];
  const errors = [];
  let stack = []; // open levels: { width, depth, index }

  String(text ?? '').replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    if (comments && raw.trim().startsWith('#')) return;
    const width = indentWidth(raw);
    const value = raw.trim();

    let parent = null;
    let depth;
    let nextStack;
    if (stack.length === 0) {
      if (width !== 0) { errors.push(`line ${line}: first ${firstLineNoun} cannot be indented`); return; }
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

    const rejection = accept ? accept(value) : null;
    if (rejection) { errors.push(`line ${line}: ${rejection}`); return; }

    const index = entries.length;
    entries.push({ line, text: value, depth, parentIndex: parent ? parent.index : null });
    nextStack.push({ width, depth, index });
    stack = nextStack;
  });

  return { entries, errors };
}

module.exports = { parseIndented };
