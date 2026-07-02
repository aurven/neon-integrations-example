import { useState, useRef, useEffect } from 'react';

const SELECT_STYLE = {
  fontSize: '12px',
  color: '#3f3c4e',
  border: '1px solid #dddce5',
  borderRadius: '8px',
  padding: '4px 24px 4px 8px',
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  outline: 'none',
  appearance: 'auto',
};

function ChevronIcon({ open }) {
  return (
    <svg
      width="10" height="6" viewBox="0 0 10 6" fill="none"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease', flexShrink: 0 }}
    >
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SingleFilter({ filter, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {filter.label && (
        <span style={{ fontSize: '12px', color: '#69667f', fontWeight: 500 }}>
          {filter.label}
        </span>
      )}
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={SELECT_STYLE}
      >
        {filter.options.map((opt, i) => (
          <option key={i} value={i}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function GroupHeaderRow({ label, allChecked, someChecked, onClick }) {
  const checkboxRef = useRef(null);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someChecked && !allChecked;
    }
  });
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '12px', fontWeight: 600, color: '#3f3c4e',
        background: 'transparent', userSelect: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f6f3f6'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={allChecked}
        onChange={onClick}
        style={{ accentColor: '#0a2ee6', width: '13px', height: '13px', flexShrink: 0 }}
      />
      {label}
    </label>
  );
}

function MultiSelectFilter({ filter, value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isAll = value.size === 0;
  const allLabel = filter.options[0]?.label ?? 'All';

  // Build selectionLabel from leaf options only (skip isGroup headers)
  const leafSelected = filter.options.filter((o, i) => i > 0 && !o.isGroup && value.has(i));
  const selectionLabel = isAll
    ? allLabel
    : leafSelected.map(o => o.label).join(', ');

  const isActive = !isAll;

  // Helper: get all leaf child indices for a group
  const getChildIndices = (groupId) =>
    filter.options.flatMap((o, i) => (o.group === groupId ? [i] : []));

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
      {filter.label && (
        <span style={{ fontSize: '12px', color: '#69667f', fontWeight: 500, flexShrink: 0 }}>
          {filter.label}
        </span>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '12px', fontFamily: 'inherit',
          padding: '4px 8px 4px 10px',
          border: `1px solid ${isActive ? '#0a2ee6' : '#dddce5'}`,
          borderRadius: '8px',
          background: open ? '#f6f3f6' : '#fff',
          color: isActive ? '#0a2ee6' : '#3f3c4e',
          cursor: 'pointer', outline: 'none',
          maxWidth: '220px', overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectionLabel}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: '#fff', border: '1px solid #dddce5', borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,.10)',
          minWidth: '160px', maxHeight: '300px', overflowY: 'auto',
          padding: '4px',
        }}>
          {filter.options.map((opt, i) => {
            // "Tutte/All" sentinel at index 0
            if (i === 0) {
              return (
                <label
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', color: '#3f3c4e',
                    background: 'transparent', userSelect: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f6f3f6'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    checked={isAll}
                    onChange={() => onChange(new Set())}
                    style={{ accentColor: '#0a2ee6', width: '13px', height: '13px', flexShrink: 0 }}
                  />
                  {opt.label}
                </label>
              );
            }

            // Group header
            if (opt.isGroup) {
              const groupId = opt.groupId ?? opt.label.toLowerCase();
              const childIndices = getChildIndices(groupId);
              const allChecked = childIndices.length > 0 && childIndices.every(ci => value.has(ci));
              const someChecked = childIndices.some(ci => value.has(ci));
              return (
                <GroupHeaderRow
                  key={i}
                  label={opt.label}
                  allChecked={allChecked}
                  someChecked={someChecked}
                  onClick={() => {
                    const next = new Set(value);
                    if (allChecked) { childIndices.forEach(ci => next.delete(ci)); }
                    else { childIndices.forEach(ci => next.add(ci)); }
                    onChange(next);
                  }}
                />
              );
            }

            // Child option (indented if belongs to a group)
            const isChild = !!opt.group;
            const checked = value.has(i);
            return (
              <label
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 10px 6px ' + (isChild ? '24px' : '10px'), borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', color: '#3f3c4e',
                  background: 'transparent', userSelect: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f6f3f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(value);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    onChange(next);
                  }}
                  style={{ accentColor: '#0a2ee6', width: '13px', height: '13px', flexShrink: 0 }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ filters, filterState, onSingleChange, onMultiChange }) {
  if (!filters || filters.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {filters.map(f =>
        f.type === 'multi'
          ? <MultiSelectFilter key={f.id} filter={f} value={filterState[f.id] ?? new Set()} onChange={v => onMultiChange(f.id, v)} />
          : <SingleFilter key={f.id} filter={f} value={filterState[f.id] ?? 0} onChange={v => onSingleChange(f.id, v)} />
      )}
    </div>
  );
}
