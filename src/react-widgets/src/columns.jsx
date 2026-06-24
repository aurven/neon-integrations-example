import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Image, Video, Mic, MoreHorizontal, ChevronRight, ArrowLeft } from 'lucide-react';
import { duplicateArticle } from './api.js';

function getWorkfolders() {
  return window.CONFIG?.gridConfig?.workfolders || [];
}

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
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#3f3c4e', lineHeight: '1.3', display: 'block', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data?.headline || '—'}
      </span>
      {data?.summary && (
        <span style={{ fontSize: '11px', color: '#69667f', lineHeight: '1.3', display: 'block', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.summary}
        </span>
      )}
    </div>
  );
}

function StatusCellRenderer({ value, data, colDef }) {
  const bg = data?.statusColor ?? '#9ca3af';
  const label = value || 'Unknown';
  const display = colDef.cellRendererParams?.display;

  if (display === 'dot') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        tabIndex={0}
        style={{
          display: 'inline-block', width: '12px', height: '12px',
          borderRadius: '9999px', background: bg, cursor: 'default',
        }}
      />
    );
  }

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
      {label}
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

// Registry of Lucide icon components available to the widget. The type→icon
// mapping itself lives in the widget config (conf/widgets/neon-grid/*.json) as
// value→name strings; this registry resolves those names to components.
const LUCIDE_ICONS = { FileText, Image, Video, Mic, MoreHorizontal, ChevronRight, ArrowLeft };

function TypeIconRenderer({ value, colDef }) {
  const iconMap = colDef.cellRendererParams?.iconMap || {};
  const iconOnly = colDef.cellRendererParams?.iconOnly;
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const iconName = iconMap[value?.toLowerCase()];
  const Icon = iconName ? LUCIDE_ICONS[iconName] : null;

  if (iconOnly) {
    return (
      <span
        role="img"
        aria-label={value}
        title={value}
        tabIndex={0}
        style={{ display: 'inline-flex', alignItems: 'center', color: '#69667f', cursor: 'default' }}
      >
        {Icon ? <Icon size={16} strokeWidth={2} /> : value}
      </span>
    );
  }

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

function WorkspacePicker({ data, onAction, onBack, onClose }) {
  const workfolders = getWorkfolders();
  const [error, setError] = useState(null);
  const [duplicating, setDuplicating] = useState(null);

  const handleSelect = async (path) => {
    if (duplicating) return;
    setDuplicating(path);
    try {
      await duplicateArticle(data.id, { workFolder: path, name: data.headline, type: data.type });
      onAction('moveToWorkspace', data, { workFolder: path });
      onClose();
    } catch (err) {
      setError(`Failed: ${err.message}`);
      setDuplicating(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px 4px', borderBottom: '1px solid #ebe9f0' }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: '#69667f', padding: '2px' }}
        >
          <ArrowLeft size={13} />
        </button>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#3f3c4e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Select workspace</span>
      </div>
      <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px', fontSize: '11px', color: '#d22d2d' }}>{error}</div>
        )}
        {workfolders.length === 0 && !error && (
          <div style={{ padding: '10px 8px', color: '#9d9aac', fontSize: '12px' }}>No workfolders available</div>
        )}
        {workfolders.map(wf => (
          <button
            key={wf.path}
            onClick={() => handleSelect(wf.path)}
            disabled={!!duplicating}
            style={{
              width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '5px 8px', borderRadius: '5px', border: 'none', cursor: duplicating ? 'wait' : 'pointer',
              background: duplicating === wf.path ? '#f0edff' : 'transparent',
              color: '#3f3c4e', fontFamily: 'inherit', textAlign: 'left', gap: '1px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: wf.isWorkspace ? 700 : 400 }}>{wf.label}</span>
            {wf.workspace && <span style={{ fontSize: '10px', color: '#9d9aac' }}>{wf.path}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionsCellRenderer({ data, colDef }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [subPanel, setSubPanel] = useState(null); // null | 'workspacePicker'
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const actions = colDef.cellRendererParams?.actions || [];
  const onAction = colDef.cellRendererParams?.onAction || (() => {});

  const closeMenu = () => { setOpen(false); setSubPanel(null); };

  useEffect(() => {
    if (!open) return;
    let listenerId = null;
    const handleClose = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      closeMenu();
    };
    // setTimeout(0) defers past the current browser event that opened the menu
    listenerId = setTimeout(() => document.addEventListener('mousedown', handleClose), 0);
    return () => {
      clearTimeout(listenerId);
      document.removeEventListener('mousedown', handleClose);
    };
  }, [open]);

  // Close when another row's actions menu opens
  useEffect(() => {
    const handleOtherOpen = (e) => {
      if (e.detail?.rowId !== data?.id) closeMenu();
    };
    document.addEventListener('neon-actions-open', handleOtherOpen);
    return () => document.removeEventListener('neon-actions-open', handleOtherOpen);
  }, [data?.id]);

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
      document.dispatchEvent(new CustomEvent('neon-actions-open', { detail: { rowId: data?.id } }));
    }
    if (open) setSubPanel(null);
    setOpen(o => !o);
  };

  const menuWidth = subPanel === 'workspacePicker' ? '220px' : '150px';

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
          boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: '4px', width: menuWidth,
          transition: 'width 120ms ease',
        }}>
          {subPanel === 'workspacePicker' ? (
            <WorkspacePicker
              data={data}
              onAction={onAction}
              onBack={() => setSubPanel(null)}
              onClose={closeMenu}
            />
          ) : (
            actions.map(action => {
              const Icon = ACTION_ICONS[action.icon] || MoreIcon;
              const isMoveToWs = action.actionType === 'moveToWorkspace';
              return (
                <button
                  key={action.id}
                  onClick={e => {
                    e.stopPropagation();
                    if (isMoveToWs) { setSubPanel('workspacePicker'); }
                    else { onAction(action.id, data); closeMenu(); }
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: '#3f3c4e', fontSize: '12px',
                    fontFamily: 'inherit', textAlign: 'left',
                    justifyContent: isMoveToWs ? 'space-between' : 'flex-start',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon />
                    {action.label}
                  </span>
                  {isMoveToWs && <ChevronRight size={12} style={{ color: '#9d9aac' }} />}
                </button>
              );
            })
          )}
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
        return {
          ...base,
          cellRenderer: StatusCellRenderer,
          cellRendererParams: { display: col.display },
          ...(col.display === 'dot' ? { tooltipValueGetter: p => p.value || 'Unknown' } : {}),
        };
      case 'date':
        return { ...base, valueFormatter: col.dateFormat === 'ddmmyyyy' ? formatIssueDate : formatDate, cellEditor: col.editable ? 'agDateStringCellEditor' : undefined };
      case 'badge':
        return (col.options && col.options.length)
          ? { ...base, cellRenderer: BadgeCellRenderer, cellRendererParams: { options: col.options } }
          : { ...base, cellRenderer: TypeCellRenderer };
      case 'typeIcon':
        return {
          ...base,
          cellRenderer: TypeIconRenderer,
          cellRendererParams: { iconMap: col.iconMap || {}, iconOnly: !!col.iconOnly },
          ...(col.iconOnly ? { tooltipValueGetter: p => p.value } : {}),
        };
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
