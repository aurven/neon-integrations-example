import { useState } from 'react';
import { C, CoverageBar, StatusBadge, IconCalendar } from './components.jsx';
import { PRI, PAYWALL_BORDER, covStatus, fmtDateShort, TODAY } from './data.js';

function PopBackdrop({ onClose }) {
  return <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />;
}

const NO_PRI_DISPLAY = { label: '—', name: 'No priority', color: C.muted };

export function PriorityChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const p = value ? PRI[value] : NO_PRI_DISPLAY;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
        background: open ? C.blueLight : 'rgb(240,239,244)', border: `1px solid ${open ? C.blue : 'transparent'}`,
        fontSize: 10.5, fontWeight: 700, color: C.dark, fontFamily: 'inherit',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
        {p.label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <>
          <PopBackdrop onClose={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 100, background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: 4, width: 152 }}>
            {[1, 2, 3, 4, 5].map(k => {
              const on = k === value;
              return (
                <button key={k} onClick={e => { e.stopPropagation(); onChange(k); setOpen(false); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: on ? C.blueLight : 'transparent', color: C.dark, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRI[k].color }} />
                  <span style={{ fontWeight: 700 }}>{PRI[k].label}</span>
                  <span style={{ color: C.muted }}>{PRI[k].name}</span>
                  {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              );
            })}
            <div style={{ height: 1, background: C.border, margin: '4px 2px' }} />
            <button onClick={e => { e.stopPropagation(); onChange(null); setOpen(false); }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: !value ? C.blueLight : 'transparent', color: C.dark, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', textAlign: 'left',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.muted }} />
              <span style={{ color: C.muted }}>No priority</span>
              {!value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
          </div>
        </>
      )}
    </span>
  );
}

export function DateChip({ offset, onChange }) {
  const [open, setOpen] = useState(false);
  const dateFor = (o) => { const d = new Date(TODAY); d.setDate(d.getDate() + o); return d; };
  const lbl = (o) => o === 0 ? 'Today' : o === 1 ? 'Tomorrow' : fmtDateShort(dateFor(o));
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
        background: open ? C.blueLight : 'rgb(240,239,244)', border: `1px solid ${open ? C.blue : 'transparent'}`,
        fontSize: 10.5, fontWeight: 700, color: C.dark, fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}>
        <IconCalendar size={11} color={C.mid} />
        {lbl(offset)}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <>
          <PopBackdrop onClose={() => setOpen(false)} />
          <div className="pqb-scroll" style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 100, background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: 4, width: 168, maxHeight: 232, overflowY: 'auto' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 8px 5px' }}>Move to issue</div>
            {Array.from({ length: 10 }, (_, o) => {
              const on = o === offset;
              const d = dateFor(o);
              return (
                <button key={o} onClick={e => { e.stopPropagation(); onChange(o); setOpen(false); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: on ? C.blueLight : 'transparent', color: C.dark, fontSize: 11.5, fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <span style={{ fontWeight: 700, width: 64 }}>{o === 0 ? 'Today' : o === 1 ? 'Tomorrow' : `+${o} days`}</span>
                  <span style={{ color: C.muted, fontSize: 10.5 }}>{fmtDateShort(d)}</span>
                  {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}

export function StoryCard({ story, dragging, onDragStart, onDragEnd, onPriority, onDate, onDismissNew }) {
  const borderColor = PAYWALL_BORDER[story.paywallLevel] || C.border;
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('storyId', story.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(story.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onDismissNew(story.id)}
      style={{
        background: C.white, border: `1px solid ${dragging ? C.blue : C.border}`,
        borderLeft: `3px solid ${dragging ? C.blue : borderColor}`,
        borderRadius: 8, padding: '9px 10px', cursor: 'grab', userSelect: 'none',
        opacity: dragging ? 0.5 : 1, boxShadow: '0 1px 2px rgba(63,60,78,.06)',
        display: 'flex', flexDirection: 'column', gap: 7, transition: 'opacity .1s, border-color .1s',
        animation: story.isNew ? 'pqbCardNew 1.2s ease-out' : undefined,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: story.statusColor || C.muted, flexShrink: 0, marginTop: 4 }} title={story.status} />
        {story.isNew && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 999, background: C.blueLight, color: C.blue, flexShrink: 0 }}>NEW</span>
        )}
        <p style={{ fontSize: 12.5, fontWeight: 700, color: C.dark, lineHeight: 1.32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0, flex: 1 }}>
          {story.title}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <PriorityChip value={story.printPriority} onChange={onPriority} />
        <DateChip offset={story.offset} onChange={onDate} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{(story.wordCount || 0).toLocaleString()} words</span>
      </div>
    </div>
  );
}

export function BoardColumn({ col, stories, budgeted, dragOver, onDragOver, onDragLeave, onDrop, cardProps, binder }) {
  const wordCount = stories.reduce((s, st) => s + (st.wordCount || 0), 0);
  const status = budgeted ? covStatus(wordCount, col.target) : null;
  const pct = budgeted ? wordCount / col.target : null;
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(col.key); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) onDragLeave(); }}
      onDrop={e => { e.preventDefault(); onDrop(e.dataTransfer.getData('storyId'), col.key); }}
      style={{
        width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0,
        background: dragOver ? C.blueLight : (binder ? C.zone : C.panelBg),
        border: `1px ${binder ? 'dashed' : 'solid'} ${dragOver ? C.blue : C.border}`, borderRadius: 10,
        opacity: binder && !dragOver ? 0.85 : 1,
        transition: 'background .12s, border-color .12s',
      }}>
      <div style={{ padding: '9px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{col.sub}</div>
          </div>
          {budgeted
            ? <StatusBadge status={status} pct={pct} />
            : <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{stories.length}</div>
                <div style={{ fontSize: 9, color: C.muted }}>{(wordCount / 1000).toFixed(1)}k words</div>
              </div>
          }
        </div>
        {budgeted && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <CoverageBar pct={pct} status={status} height={5} style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: C.mid, fontWeight: 600, whiteSpace: 'nowrap' }}>{wordCount.toLocaleString()} / {col.target.toLocaleString()}</span>
            <span style={{ fontSize: 10, color: C.muted }}>· {stories.length}</span>
          </div>
        )}
      </div>
      <div className="pqb-scroll" style={{ flex: 1, minHeight: 0, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', overflowX: 'hidden' }}>
        {stories.length === 0 && (
          <div style={{ border: `1.5px dashed ${dragOver ? C.blue : C.border}`, borderRadius: 8, padding: '16px 10px', textAlign: 'center', fontSize: 11, color: dragOver ? C.blue : C.muted }}>
            {dragOver ? '↓ Drop to reclassify' : 'No stories'}
          </div>
        )}
        {stories.map(st => (
          <StoryCard key={st.id} story={st}
            dragging={cardProps.dragId === st.id}
            onDragStart={cardProps.onDragStart} onDragEnd={cardProps.onDragEnd}
            onPriority={k => cardProps.onPriority(st.id, k)}
            onDate={off => cardProps.onDate(st.id, off)}
            onDismissNew={() => cardProps.onDismissNew(st.id)} />
        ))}
      </div>
    </div>
  );
}

export function SegmentPicker({ facets, active, onPick }) {
  const ICON = {
    section:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    priority: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><path d="M4 14a4 4 0 0 0 8 0V8a4 4 0 0 1 8 0"/></svg>,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.values(facets).map(f => {
        const on = active === f.key;
        return (
          <button key={f.key} onClick={() => onPick(f.key)} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: on ? C.blue : C.white, color: on ? C.white : C.dark,
            border: `1px solid ${on ? C.blue : C.border}`, fontFamily: 'inherit', transition: 'all .12s',
          }}>
            <span style={{ display: 'flex', color: on ? C.white : C.mid }}>{ICON[f.key]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                {f.label}
                {f.budgeted && (
                  <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '0 5px', borderRadius: 999, background: on ? 'rgba(255,255,255,.22)' : C.blueLight, color: on ? '#fff' : C.blue }}>BUDGET</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: on ? 'rgba(255,255,255,.75)' : C.muted, marginTop: 1 }}>{f.columns.length} segments</div>
            </div>
            {on && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.22)', padding: '1px 6px', borderRadius: 999 }}>ACTIVE</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Distribution({ facet, stories }) {
  const total = stories.length || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {[...facet.columns, facet.outside].map(col => {
        const inCol = stories.filter(s => facet.value(s) === col.key);
        const n = inCol.length;
        const unbudgetedCol = facet.budgeted && !col.target;
        const metric = unbudgetedCol
          ? n
          : facet.budgeted
          ? Math.round(inCol.reduce((a, s) => a + (s.wordCount || 0), 0) / col.target * 100) + '%'
          : n;
        const barPct = Math.min(
          unbudgetedCol ? 0
          : facet.budgeted
          ? (inCol.reduce((a, s) => a + (s.wordCount || 0), 0) / col.target) * 100
          : (n / total) * 100,
          100
        );
        return (
          <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
            <div style={{ width: 42, height: 5, background: C.zone, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: col.color, borderRadius: 999, transition: 'width .25s' }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.mid, width: 30, textAlign: 'right' }}>{metric}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
      background: C.dark2, color: '#fff', borderRadius: 10, padding: '10px 16px',
      fontSize: 12.5, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.28)',
      display: 'flex', alignItems: 'center', gap: 9, maxWidth: 460, animation: 'pqbToast .22s ease-out',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span dangerouslySetInnerHTML={{ __html: toast.html }} />
    </div>
  );
}
