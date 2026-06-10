import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './print-query-board.css';
import {
  PRI, buildFacets, applyPatch, covStatus, sectionsTotal, dayLabel, fmtDate, dayDiffFromToday,
  TOMORROW, TODAY, fmtDateShort,
} from './data.js';
import { C, CoverageBar, StatusBadge, NeonPanel, NeonInput, IconSearch, IconFilter, IconCalendar, IconSection } from './components.jsx';
import { BoardColumn, SegmentPicker, Distribution, Toast } from './board.jsx';
import { fetchStories } from '../api.js';

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const trunc = (s, n = 46) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function logMetadataUpdate(story, field, value) {
  console.log(`[Print Query Board] Would update node ${story.id} -> ${field} = ${JSON.stringify(value)} (no Neon connection wired yet)`);
}

function IssueStepper({ issueDate, setIssueDate }) {
  const inputRef = useRef(null);
  const step = (delta) => {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + delta);
    d.setHours(0, 0, 0, 0);
    setIssueDate(d);
  };
  const inputValue = `${issueDate.getFullYear()}-${String(issueDate.getMonth()+1).padStart(2,'0')}-${String(issueDate.getDate()).padStart(2,'0')}`;
  const onPick = (e) => {
    const v = e.target.value;
    if (!v) return;
    const [y, m, da] = v.split('-').map(Number);
    const d = new Date(y, m - 1, da);
    d.setHours(0, 0, 0, 0);
    setIssueDate(d);
  };
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (el.showPicker) { try { el.showPicker(); return; } catch (_) {} }
    el.focus(); el.click();
  };
  const rel = dayLabel(issueDate);

  const ArrowBtn = ({ delta, label, glyph }) => (
    <button onClick={() => step(delta)} aria-label={label} title={label}
      style={{ width: 26, height: 38, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: C.mid, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.zone; e.currentTarget.style.color = C.blue; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.mid; }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>
      <ArrowBtn delta={-1} label="Previous day" glyph={<polyline points="15 18 9 12 15 6" />} />
      <button onClick={openPicker} title="Choose planning issue date"
        style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 7, padding: '4px 6px', textAlign: 'left' }}
        onMouseEnter={e => e.currentTarget.style.background = C.blueLight}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: C.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCalendar size={14} color={C.blue} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: rel === 'Tomorrow' ? C.blue : C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>Issue · {rel}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDate(issueDate)}</div>
        </div>
        <input ref={inputRef} type="date" value={inputValue} onChange={onPick} tabIndex={-1}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} />
      </button>
      <ArrowBtn delta={1} label="Next day" glyph={<polyline points="9 18 15 12 9 6" />} />
    </div>
  );
}

function LeftRail({ issueDate, setIssueDate, facets, facetKey, setFacetKey, stories, search, setSearch }) {
  const facet = facets[facetKey];
  return (
    <NeonPanel
      title="Query"
      icon={<IconFilter size={13} color={C.muted} />}
      style={{ width: 248, flexShrink: 0 }}
      toolbar={<IssueStepper issueDate={issueDate} setIssueDate={setIssueDate} />}>
      <div className="pqb-scroll" style={{ flex: 1, minHeight: 0, padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', overflowX: 'hidden' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Segment stories by</div>
          <SegmentPicker facets={facets} active={facetKey} onPick={setFacetKey} />
        </div>
        <div>
          <NeonInput icon={<IconSearch size={12} color={C.muted} />} placeholder="Search stories…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{facet.label} mix</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 10, color: C.muted }}>{stories.length} stories</span>
          </div>
          <Distribution facet={facet} stories={stories} />
        </div>
        <div style={{ marginTop: 'auto', padding: '10px 11px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <p style={{ fontSize: 11, color: C.mid, lineHeight: 1.5, margin: 0 }}><b style={{ color: C.dark }}>Drag a card</b> to another column — or edit its priority / issue date — to reclassify it.</p>
        </div>
      </div>
    </NeonPanel>
  );
}

function Board({ facet, columns, grouped, budget, sectionsCovered, totalBudgetedSections, dragId, dragOverCol, setDragOverCol, cardProps, onDrop }) {
  return (
    <NeonPanel
      title={<span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><span>Segmented by {facet.label.toLowerCase()}</span></span>}
      icon={<IconSection size={13} color={C.muted} />}
      style={{ flex: 1, minWidth: 0 }}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>{columns.length} segments</span>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.mid }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
            Drag to reclassify
          </span>
        </div>
      }
      toolbar={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.mid, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>Issue budget</span>
          <CoverageBar pct={budget.pct} status={budget.status} height={7} style={{ flex: 1, borderRadius: 4 }} />
          <span style={{ fontSize: 11, color: C.mid, flexShrink: 0 }}>{budget.filled.toLocaleString()} / {budget.target.toLocaleString()} words</span>
          <StatusBadge status={budget.status} pct={budget.pct} />
          <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: sectionsCovered === totalBudgetedSections ? 'rgb(20,110,25)' : C.muted }}>
            {sectionsCovered}/{totalBudgetedSections} sections on target
          </span>
        </div>
      }>
      <div className="pqb-board-scroll" style={{ flex: 1, minHeight: 0, padding: 12, overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ display: 'flex', gap: 10, height: '100%', alignItems: 'stretch' }}>
          {columns.map(col => (
            <BoardColumn key={col.key} col={col} stories={grouped[col.key] || []} budgeted={!!facet.budgeted}
              dragOver={dragOverCol === col.key}
              onDragOver={setDragOverCol} onDragLeave={() => setDragOverCol(null)} onDrop={onDrop}
              cardProps={cardProps} />
          ))}
        </div>
      </div>
    </NeonPanel>
  );
}

export default function PrintQueryBoard() {
  const printConfig = window.CONFIG?.printConfig || {};
  const facets = useMemo(() => buildFacets(printConfig), [printConfig]);

  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [facetKey, setFacetKey] = useState('section');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [toast, setToast] = useState(null);
  const [issueDate, setIssueDate] = useState(printConfig.issueDate ? new Date(printConfig.issueDate) : TOMORROW);
  const toastTimer = useRef(null);

  useEffect(() => {
    fetchStories()
      .then(data => {
        const fallback = printConfig.issueDate ? new Date(printConfig.issueDate) : TOMORROW;
        setStories((data.stories || []).map(s => ({
          ...s,
          offset: dayDiffFromToday(s.issueDate ? new Date(s.issueDate) : fallback),
        })));
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const showToast = useCallback((html) => {
    setToast({ html, t: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const facet = facets[facetKey];
  const issueOffset = dayDiffFromToday(issueDate);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let v = stories.filter(s => s.offset === issueOffset);
    if (q) v = v.filter(s => s.title.toLowerCase().includes(q));
    return v;
  }, [stories, search, issueOffset]);

  const budgetTarget = useMemo(() => sectionsTotal(facets.section.columns), [facets]);

  const budget = useMemo(() => {
    const filled = visible.filter(s => s.section !== 'Unassigned').reduce((s, x) => s + (x.wordCount || 0), 0);
    return { filled, target: budgetTarget, pct: filled / budgetTarget, status: covStatus(filled, budgetTarget) };
  }, [visible, budgetTarget]);

  const budgetedSections = useMemo(() => facets.section.columns.filter(c => c.target > 0), [facets]);

  const sectionsCovered = useMemo(() => budgetedSections.filter(sec => {
    const f = visible.filter(s => s.section === sec.key).reduce((a, s) => a + (s.wordCount || 0), 0);
    const st = covStatus(f, sec.target);
    return st === 'ok' || st === 'over';
  }).length, [visible, budgetedSections]);

  const grouped = useMemo(() => {
    const g = {};
    facet.columns.forEach(c => { g[c.key] = []; });
    visible.forEach(s => { const k = facet.value(s); (g[k] = g[k] || []).push(s); });
    return g;
  }, [visible, facet]);

  const storyById = useMemo(() => Object.fromEntries(stories.map(s => [s.id, s])), [stories]);

  const handleDrop = useCallback((storyId, colKey) => {
    setDragOverCol(null); setDragId(null);
    const s = storyById[storyId];
    if (!s || facet.value(s) === colKey) return;
    setStories(prev => prev.map(x => x.id === storyId ? applyPatch(x, facet.patch(colKey)) : x));
    if (facet.key === 'section') {
      logMetadataUpdate(s, 'nodeMeta.printSection', colKey);
    } else if (facet.key === 'priority') {
      logMetadataUpdate(s, 'nodeMeta.printPriority', colKey);
    }
    showToast(`Reclassified <b>"${esc(trunc(s.title))}"</b> → <b>${esc(facet.colLabel(colKey))}</b>`);
  }, [storyById, facet, showToast]);

  const handlePriority = useCallback((storyId, k) => {
    const s = storyById[storyId];
    if (!s || s.printPriority === k) return;
    setStories(prev => prev.map(x => x.id === storyId ? { ...x, printPriority: k } : x));
    logMetadataUpdate(s, 'nodeMeta.printPriority', k);
    const moved = facetKey === 'priority';
    showToast(`${moved ? 'Reclassified' : 'Priority'} <b>"${esc(trunc(s.title, 38))}"</b> → <b>${PRI[k].label} · ${PRI[k].name}</b>`);
  }, [storyById, facetKey, showToast]);

  const handleDate = useCallback((storyId, off) => {
    const s = storyById[storyId];
    if (!s || s.offset === off) return;
    setStories(prev => prev.map(x => x.id === storyId ? { ...x, offset: off } : x));
    const d = new Date(TODAY); d.setDate(d.getDate() + off);
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    logMetadataUpdate(s, 'nodeMeta.printIssueDate', iso);
    const lbl = off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : fmtDateShort(d);
    if (off === issueOffset) showToast(`Pulled <b>"${esc(trunc(s.title, 34))}"</b> into <b>${lbl}</b>`);
    else showToast(`Moved <b>"${esc(trunc(s.title, 34))}"</b> to the <b>${lbl}</b> issue`);
  }, [storyById, issueOffset, showToast]);

  const cardProps = { dragId, onDragStart: setDragId, onDragEnd: () => setDragId(null), onPriority: handlePriority, onDate: handleDate };

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column', padding: 10, gap: 8,
      background: C.bg,
      fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* App header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '0 2px' }}>
        <div style={{ width: 4, height: 18, background: C.blue, borderRadius: 2 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dark, letterSpacing: '-.01em' }}>Print Query Board</span>
        {printConfig.printProduct && (
          <span style={{ fontSize: 10, background: C.zone, color: C.mid, padding: '1px 7px', borderRadius: 6, fontWeight: 600, opacity: 0.7 }}>{printConfig.printProduct}</span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.muted }}>{visible.length} stories on this issue</span>
        <div style={{ width: 1, height: 14, background: C.border }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueLight, padding: '1px 8px', borderRadius: 6 }}>{dayLabel(issueDate)}</span>
        <span style={{ fontSize: 11, color: C.muted }}>{fmtDate(issueDate)}</span>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>
          Loading stories…
        </div>
      )}
      {error && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ flex: 1, display: 'flex', gap: 8, minHeight: 0 }}>
          <LeftRail
            issueDate={issueDate} setIssueDate={setIssueDate}
            facets={facets} facetKey={facetKey} setFacetKey={setFacetKey}
            stories={visible} search={search} setSearch={setSearch} />
          <Board
            facet={facet} columns={facet.columns} grouped={grouped}
            budget={budget} sectionsCovered={sectionsCovered} totalBudgetedSections={budgetedSections.length}
            dragId={dragId} dragOverCol={dragOverCol} setDragOverCol={setDragOverCol}
            cardProps={cardProps} onDrop={handleDrop} />
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
