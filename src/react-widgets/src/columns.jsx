import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Image, Video, Mic, MoreHorizontal } from 'lucide-react';

function HeadlineCellRenderer({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: '2px' }}>
      {data?.isNew && (
        <span style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          padding: '2px 10px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#fff',
          background: '#2563eb',
          whiteSpace: 'nowrap'
        }}>
          NEW
        </span>
      )}
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#3f3c4e', lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>
        {data?.headline || '—'}
      </span>
      {data?.summary && (
        <span style={{ fontSize: '11px', color: '#69667f', lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {data.summary}
        </span>
      )}
    </div>
  );
}

function StatusCellRenderer({ value, data }) {
  const bg = data?.statusColor ?? '#9ca3af';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#fff',
      background: bg,
      whiteSpace: 'nowrap'
    }}>
      {value || 'Unknown'}
    </span>
  );
}

function formatDate(params) {
  if (!params.value) return '—';
  const d = new Date(params.value);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function TypeCellRenderer({ value }) {
  if (!value) return '—';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#69667f',
      background: '#e7e6ed',
      whiteSpace: 'nowrap'
    }}>
      {value}
    </span>
  );
}

function formatIssueDate(params) {
  if (!params.value) return '—';
  const [year, month, day] = params.value.split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

function BadgeCellRenderer({ value, colDef }) {
  const opt = (colDef.cellRendererParams?.options || []).find(o => String(o.value) === String(value));
  if (!value && !opt) return '—';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px',
      fontWeight: 600, color: '#fff', background: opt?.color ?? '#9ca3af', whiteSpace: 'nowrap'
    }}>
      {opt?.label ?? value}
    </span>
  );
}

const TYPE_ICONS = {
  article: FileText,
  gallery: Image,
  photo: Image,
  video: Video,
  audio: Mic,
};

function TypeIconRenderer({ value }) {
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const Icon = TYPE_ICONS[value?.toLowerCase()];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 10px', borderRadius: '9999px', fontSize: '11px',
      fontWeight: 600, color: '#69667f', background: '#e7e6ed', whiteSpace: 'nowrap',
    }}>
      {Icon && <Icon size={12} strokeWidth={2} />}
      {value}
    </span>
  );
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function DateUserRenderer({ value, colDef, context, data }) {
  const userCache = context?.userCache ?? {};
  const userField = colDef.cellRendererParams?.userField;
  const userAliasField = colDef.cellRendererParams?.userAliasField;

  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;

  const dateStr = new Date(value).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const userId = getNestedValue(data, userField);
  const userAlias = getNestedValue(data, userAliasField);
  const userName = userId ? (userCache[userId] || userAlias || userId) : (userAlias || null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: '1px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#3f3c4e', lineHeight: '1.3' }}>{dateStr}</span>
      {userName && (
        <span style={{ fontSize: '11px', color: '#69667f', lineHeight: '1.3' }}>{userName}</span>
      )}
    </div>
  );
}

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const MoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const ACTION_ICONS = { copy: CopyIcon, move: MoveIcon, send: SendIcon };

function ActionsCellRenderer({ data, colDef }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const actions = colDef.cellRendererParams?.actions || [];
  const onAction = colDef.cellRendererParams?.onAction || (() => {});

  useEffect(() => {
    if (!open) return;
    let listenerId = null;
    const handleClose = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // setTimeout(0) defers past the current browser event that opened the menu
    listenerId = setTimeout(() => document.addEventListener('mousedown', handleClose), 0);
    return () => {
      clearTimeout(listenerId);
      document.removeEventListener('mousedown', handleClose);
    };
  }, [open]);

  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const action = actions[0];
    const Icon = ACTION_ICONS[action.icon] || MoreIcon;
    return (
      <button
        className="neon-actions-cell"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onAction(action.id, data); }}
        title={action.label}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
          background: 'none', cursor: 'pointer', color: '#3f3c4e',
        }}
      >
        <Icon />
      </button>
    );
  }

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  };

  return (
    <span className="neon-actions-cell" style={{ display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        onMouseDown={e => e.stopPropagation()}
        onClick={handleToggle}
        title="Actions"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
          background: open ? '#f6f3f6' : 'none', cursor: 'pointer', color: '#3f3c4e',
        }}
      >
        <MoreIcon />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999,
          background: '#ffffff', border: '1px solid #dddce5', borderRadius: '9px',
          boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: '4px', width: '140px',
        }}>
          {actions.map(action => {
            const Icon = ACTION_ICONS[action.icon] || MoreIcon;
            return (
              <button
                key={action.id}
                onClick={e => { e.stopPropagation(); onAction(action.id, data); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#3f3c4e', fontSize: '12px',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <Icon />
                {action.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </span>
  );
}

export function buildColumnDefs(columns = [], { onAction } = {}) {
  return columns.map(col => {
    const base = {
      field: col.field,
      headerName: col.headerName,
      width: col.width,
      flex: col.flex,
      minWidth: col.minWidth,
      resizable: col.resizable ?? true,
      sortable: !!col.sortable,
      filter: !!col.filter,
      editable: !!col.editable,
    };
    switch (col.type) {
      case 'headline':
        return { ...base, autoHeight: true, cellRenderer: HeadlineCellRenderer };
      case 'status':
        return { ...base, cellRenderer: StatusCellRenderer };
      case 'date':
        return { ...base, valueFormatter: col.dateFormat === 'ddmmyyyy' ? formatIssueDate : formatDate, cellEditor: col.editable ? 'agDateStringCellEditor' : undefined };
      case 'badge':
        return (col.options && col.options.length)
          ? { ...base, cellRenderer: BadgeCellRenderer, cellRendererParams: { options: col.options } }
          : { ...base, cellRenderer: TypeCellRenderer };
      case 'typeIcon':
        return { ...base, cellRenderer: TypeIconRenderer };
      case 'select':
        return {
          ...base,
          cellRenderer: BadgeCellRenderer,
          cellRendererParams: { options: col.options || [] },
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: (col.options || []).map(o => o.value) },
        };
      case 'dateUser':
        return {
          ...base,
          autoHeight: true,
          cellRenderer: DateUserRenderer,
          cellRendererParams: { userField: col.userField, userAliasField: col.userAliasField },
        };
      case 'actions':
        return { ...base, cellRenderer: ActionsCellRenderer, cellRendererParams: { actions: col.actions || [], onAction } };
      default:
        return { ...base, valueFormatter: (p) => p.value ?? '—' };
    }
  });
}

export const defaultColDef = {
  suppressMovable: false,
  cellStyle: {
    fontSize: '13px',
    fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, sans-serif',
    color: '#3f3c4e',
    lineHeight: '1.4'
  }
};
