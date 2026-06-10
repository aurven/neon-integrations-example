// Static data for the Print Query Board widget

const _TODAY = new Date(); _TODAY.setHours(0, 0, 0, 0);
export const TODAY = _TODAY;
export const TOMORROW = new Date(_TODAY);
TOMORROW.setDate(TOMORROW.getDate() + 1);

export function dayDiffFromToday(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  return Math.round((x - _TODAY) / 86400000);
}
export function dayLabel(d) {
  const n = dayDiffFromToday(d);
  if (n === 0)  return 'Today';
  if (n === 1)  return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1)    return `In ${n} days`;
  return `${-n} days ago`;
}
export function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateShort(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const PRI = {
  1: { label: 'P1', name: 'Breaking',  color: '#d6362f' },
  2: { label: 'P2', name: 'High',      color: '#cf5a6e' },
  3: { label: 'P3', name: 'Standard',  color: '#b072c7' },
  4: { label: 'P4', name: 'Low',       color: '#7a93dd' },
  5: { label: 'P5', name: 'Filler',    color: '#5fb3e6' },
};

export const PAYWALL_BORDER = {
  PREMIUM: 'rgb(139,46,204)',
  METERED: 'rgb(255,192,65)',
};

export const STATUS_STYLE = {
  empty: { label: 'Empty',      bg: 'rgb(240,239,244)', text: 'rgb(157,154,172)', bar: 'rgb(191,191,202)' },
  under: { label: 'Incomplete', bg: 'rgb(255,248,220)', text: 'rgb(130,85,0)',    bar: 'rgb(255,192,65)'  },
  ok:    { label: 'OK',         bg: 'rgb(225,250,226)', text: 'rgb(20,110,25)',   bar: 'rgb(39,201,46)'   },
  over:  { label: 'Over',       bg: 'rgb(255,235,235)', text: 'rgb(160,30,30)',   bar: 'rgb(210,45,45)'   },
};

export function buildSections(printConfig) {
  return [
    ...(printConfig.sectionsAndBooks || []).map(s => ({ ...s, target: s.wordTarget })),
    { key: 'Unassigned', label: 'Unassigned', sub: null, color: '#9ca3af', target: 0 },
  ];
}

export function sectionsTotal(sections) {
  return sections.reduce((s, x) => s + (x.target > 0 ? x.target : 0), 0);
}

export function covStatus(filled, target) {
  if (!target) return 'empty';
  if (!filled) return 'empty';
  const p = filled / target;
  return p < 0.7 ? 'under' : p <= 1.08 ? 'ok' : 'over';
}

export function applyPatch(story, patch) {
  return { ...story, ...patch };
}

export function buildFacets(printConfig) {
  const sections = buildSections(printConfig);
  return {
    section: {
      key: 'section', label: 'Section', budgeted: true,
      columns: sections,
      value: (s) => s.section,
      patch: (k) => ({ section: k }),
      colLabel: (k) => (sections.find(x => x.key === k) || {}).label || k,
    },
    priority: {
      key: 'priority', label: 'Priority',
      columns: [1, 2, 3, 4, 5].map(k => ({ key: k, label: `${PRI[k].label} · ${PRI[k].name}`, color: PRI[k].color })),
      value: (s) => s.printPriority,
      patch: (k) => ({ printPriority: k }),
      colLabel: (k) => `${PRI[k].label} · ${PRI[k].name}`,
    },
  };
}
