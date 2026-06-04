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

function relISO(dayOffset, h = 9, m = 0) {
  const d = new Date(_TODAY); d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}

// Print sections with char budgets
export const SECTIONS = [
  { key: 'Front',    label: 'Front Page', sub: 'Page 1 splash',     color: '#0A2EE6', target: 9000  },
  { key: 'World',    label: 'World',      sub: 'Foreign desk',      color: '#2563eb', target: 12000 },
  { key: 'Politics', label: 'Politics',   sub: 'Westminster + DC',  color: '#7c3aed', target: 8000  },
  { key: 'Business', label: 'Business',   sub: 'Markets + economy', color: '#d97706', target: 9000  },
  { key: 'Comment',  label: 'Comment',    sub: 'Opinion + leaders', color: '#64748b', target: 6000  },
  { key: 'Culture',  label: 'Culture',    sub: 'Arts + reviews',    color: '#9333ea', target: 7000  },
  { key: 'Sport',    label: 'Sport',      sub: 'Back of book',      color: '#16a34a', target: 9000  },
];
export const SECTIONS_TOTAL = SECTIONS.reduce((s, x) => s + x.target, 0);

export const DESKS = [
  { key: 'World',    color: '#2563eb' }, { key: 'Business', color: '#d97706' },
  { key: 'Politics', color: '#7c3aed' }, { key: 'Opinion',  color: '#64748b' },
  { key: 'Culture',  color: '#9333ea' }, { key: 'Sport',    color: '#16a34a' },
  { key: 'Features', color: '#dc2626' },
];
export const DESK_COLOR = Object.fromEntries(DESKS.map(d => [d.key, d.color]));

export function deskOf(ws) { return (ws || '/').split('/')[1] || '—'; }
export function setDeskPath(ws, desk) {
  const parts = (ws || '/').split('/');
  parts[1] = desk; if (!parts[2]) parts[2] = 'Desk';
  return parts.join('/');
}

export const PRI = {
  high: { label: 'P1', name: 'Breaking', color: 'rgb(210,45,45)' },
  med:  { label: 'P2', name: 'Standard', color: 'rgb(217,119,6)' },
  low:  { label: 'P3', name: 'Low',      color: 'rgb(22,163,74)'  },
};
export const PAYWALL_COL = {
  free:    'rgb(10,46,230)',
  metered: 'rgb(130,85,0)',
  premium: 'rgb(139,46,204)',
};
export const PAYWALL_STYLE = {
  free:    { label: 'FREE',    bg: 'rgb(229,236,255)', color: 'rgb(10,46,230)',   border: 'rgb(193,210,255)' },
  metered: { label: 'METERED', bg: 'rgb(255,248,220)', color: 'rgb(130,85,0)',    border: 'rgba(130,85,0,.3)' },
  premium: { label: 'PREMIUM', bg: 'rgb(249,240,255)', color: 'rgb(139,46,204)',  border: 'rgba(139,46,204,.3)' },
};
export const STATUS_STYLE = {
  empty: { label: 'Empty',      bg: 'rgb(240,239,244)', text: 'rgb(157,154,172)', bar: 'rgb(191,191,202)' },
  under: { label: 'Incomplete', bg: 'rgb(255,248,220)', text: 'rgb(130,85,0)',    bar: 'rgb(255,192,65)'  },
  ok:    { label: 'OK',         bg: 'rgb(225,250,226)', text: 'rgb(20,110,25)',   bar: 'rgb(39,201,46)'   },
  over:  { label: 'Over',       bg: 'rgb(255,235,235)', text: 'rgb(160,30,30)',   bar: 'rgb(210,45,45)'   },
};

export function covStatus(filled, target) {
  if (!filled) return 'empty';
  const p = filled / target;
  return p < 0.7 ? 'under' : p <= 1.08 ? 'ok' : 'over';
}

export function applyPatch(story, patch) {
  if (patch._desk) return { ...story, workspace: setDeskPath(story.workspace, patch._desk) };
  return { ...story, ...patch };
}

export function buildFacets() {
  return {
    section: {
      key: 'section', label: 'Section', budgeted: true,
      columns: SECTIONS.map(s => ({ ...s })),
      value: (s) => s.section,
      patch: (k) => ({ section: k }),
      colLabel: (k) => (SECTIONS.find(x => x.key === k) || {}).label || k,
    },
    priority: {
      key: 'priority', label: 'Priority',
      columns: [
        { key: 'high', label: 'P1 · Breaking', sub: 'Top of the book',  color: PRI.high.color },
        { key: 'med',  label: 'P2 · Standard', sub: 'Run of paper',     color: PRI.med.color  },
        { key: 'low',  label: 'P3 · Low',      sub: 'Fill / spillover', color: PRI.low.color  },
      ],
      value: (s) => s.priority,
      patch: (k) => ({ priority: k }),
      colLabel: (k) => ({ high: 'P1 · Breaking', med: 'P2 · Standard', low: 'P3 · Low' }[k]),
    },
    desk: {
      key: 'desk', label: 'Desk',
      columns: DESKS.map(d => ({ key: d.key, label: d.key, sub: 'Desk queue', color: d.color })),
      value: (s) => deskOf(s.workspace),
      patch: (k) => ({ _desk: k }),
      colLabel: (k) => k,
    },
    paywall: {
      key: 'paywall', label: 'Access',
      columns: [
        { key: 'free',    label: 'Free',    sub: 'Open access',    color: PAYWALL_COL.free    },
        { key: 'metered', label: 'Metered', sub: 'Counts to wall', color: PAYWALL_COL.metered },
        { key: 'premium', label: 'Premium', sub: 'Subscriber only',color: PAYWALL_COL.premium },
      ],
      value: (s) => s.paywall,
      patch: (k) => ({ paywall: k }),
      colLabel: (k) => ({ free: 'Free', metered: 'Metered', premium: 'Premium' }[k]),
    },
  };
}

export const ISSUE_ARTICLES = [
  { id:'a01', type:'Article',   title:'Fed signals first rate cut of the year as inflation cools',          workspace:'/Business/Markets',     chars:3400, priority:'high', author:'J. Whitfield', publishedAt:relISO(-1,16,30), expiresAt:null,            paywall:'free',    thumbnail:true  },
  { id:'a02', type:'Report',    title:'UN brokers fragile ceasefire after a week of cross-border strikes',  workspace:'/World/News',           chars:2600, priority:'high', author:'R. Adeyemi',   publishedAt:relISO(-1,9,10),  expiresAt:null,            paywall:'premium', thumbnail:true  },
  { id:'a03', type:'Brief',     title:'Record floods displace thousands across central Europe',             workspace:'/World/News',           chars:1800, priority:'high', author:'K. Novak',     publishedAt:relISO(0,6,40),   expiresAt:relISO(2,20,0),  paywall:'free',    thumbnail:false },
  { id:'a04', type:'Analysis',  title:'Brussels unveils €40bn green-industry package',                      workspace:'/World/Europe',         chars:3100, priority:'med',  author:'A. Moreau',    publishedAt:relISO(-1,11,0),  expiresAt:null,            paywall:'metered', thumbnail:true  },
  { id:'a05', type:'Analysis',  title:'Westminster braces for spending-review showdown',                    workspace:'/Politics/Westminster', chars:2900, priority:'high', author:"M. O'Brien",   publishedAt:relISO(1,6,0),    expiresAt:null,            paywall:'premium', thumbnail:false },
  { id:'a06', type:'Article',   title:'Tech selloff wipes $200bn off chip giants in a single session',      workspace:'/Business/Markets',     chars:2200, priority:'high', author:'L. Chen',      publishedAt:relISO(0,7,20),   expiresAt:null,            paywall:'metered', thumbnail:true  },
  { id:'a07', type:'Brief',     title:'Oil edges higher on Gulf supply fears',                              workspace:'/Business/Markets',     chars:1500, priority:'med',  author:'L. Chen',      publishedAt:relISO(1,7,30),   expiresAt:null,            paywall:'free',    thumbnail:false },
  { id:'a08', type:'Interview', title:'Portrait: the economist rewriting the rules of growth',              workspace:'/Features/Long',        chars:3800, priority:'med',  author:'S. Patel',     publishedAt:relISO(-2,8,0),   expiresAt:null,            paywall:'premium', thumbnail:true  },
  { id:'a09', type:'Article',   title:'Venice Biennale: the pavilions everyone is talking about',           workspace:'/Culture/Arts',         chars:2600, priority:'med',  author:'E. Rossi',     publishedAt:relISO(-1,10,30), expiresAt:relISO(30,23,59),paywall:'free',    thumbnail:true  },
  { id:'a10', type:'Article',   title:'Premier League title race goes down to the final day',               workspace:'/Sport/Football',       chars:1900, priority:'high', author:'T. Reynolds',  publishedAt:relISO(0,8,30),   expiresAt:relISO(2,23,59), paywall:'free',    thumbnail:true  },
  { id:'a11', type:'Take',      title:'Mbappé brace sends France into the semi-finals',                     workspace:'/Sport/Football',       chars:1200, priority:'med',  author:'T. Reynolds',  publishedAt:relISO(0,9,5),    expiresAt:relISO(3,23,59), paywall:'free',    thumbnail:false },
  { id:'a12', type:'Analysis',  title:'Champions League final: tactics and talking points',                 workspace:'/Sport/Football',       chars:2400, priority:'high', author:'T. Reynolds',  publishedAt:relISO(-1,12,0),  expiresAt:null,            paywall:'metered', thumbnail:true  },
  { id:'a13', type:'Brief',     title:'Wimbledon seedings confirmed as the grass season opens',             workspace:'/Sport/General',        chars:1400, priority:'low',  author:'D. Hoffmann',  publishedAt:relISO(-5,9,0),   expiresAt:relISO(-1,23,59),paywall:'free',    thumbnail:false },
  { id:'a14', type:'Take',      title:'Why the AI boom still needs better guardrails',                      workspace:'/Opinion/Comment',      chars:1700, priority:'med',  author:'S. Patel',     publishedAt:relISO(-1,7,45),  expiresAt:null,            paywall:'metered', thumbnail:false },
  { id:'a15', type:'Brief',     title:'Asia markets steady as Tokyo reopens after the holiday',             workspace:'/Business/Markets',     chars:1300, priority:'low',  author:'L. Chen',      publishedAt:relISO(0,5,30),   expiresAt:null,            paywall:'free',    thumbnail:false },
  { id:'a16', type:'Analysis',  title:'White House defends sweeping new tariff package',                    workspace:'/Politics/Washington',  chars:2700, priority:'high', author:'J. Whitfield', publishedAt:relISO(-1,15,0),  expiresAt:null,            paywall:'premium', thumbnail:false },
  { id:'a17', type:'Report',    title:'Germany\'s coalition survives a knife-edge confidence vote',         workspace:'/World/Europe',         chars:2300, priority:'med',  author:'D. Hoffmann',  publishedAt:relISO(-1,13,20), expiresAt:null,            paywall:'metered', thumbnail:false },
  { id:'a18', type:'Article',   title:'Booker shortlist springs a genuine surprise',                        workspace:'/Culture/Arts',         chars:1600, priority:'low',  author:'E. Rossi',     publishedAt:relISO(-2,11,0),  expiresAt:null,            paywall:'free',    thumbnail:true  },
];

export const OFFSET_SEED  = { a01:1,a02:1,a03:1,a04:2,a05:1,a06:1,a07:0,a08:3,a09:1,a10:1,a11:0,a12:1,a13:2,a14:1,a15:0,a16:1,a17:1,a18:1 };
export const SECTION_SEED = { a01:'Front',a02:'World',a03:'World',a04:'World',a05:'Politics',a06:'Business',a07:'Business',a08:'Business',a09:'Culture',a10:'Sport',a11:'Sport',a12:'Sport',a13:'Sport',a14:'Comment',a15:'Business',a16:'Politics',a17:'World',a18:'Culture' };
