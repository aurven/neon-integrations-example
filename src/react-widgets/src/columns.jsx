import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Image, Video, Mic, Copy, ArrowRight, Send, Zap, Globe, Trophy, Rocket, Rss, Monitor, MoreHorizontal, ChevronRight, ArrowLeft, Lock, LockOpen, Pencil, Eye } from 'lucide-react';
import { duplicateArticle, unlockNode } from './api.js';
import { matchesCondition } from './row-rules.js';

function getWorkfolders() {
  return window.CONFIG?.gridConfig?.workfolders || [];
}

function formatByPattern(date, pattern) {
  const d = new Date(date);
  const p = n => String(n).padStart(2, '0');
  return pattern
    .replace('yyyy', d.getFullYear())
    .replace('yy', String(d.getFullYear()).slice(-2))
    .replace('MM', p(d.getMonth() + 1))
    .replace('dd', p(d.getDate()))
    .replace('HH', p(d.getHours()))
    .replace('mm', p(d.getMinutes()))
    .replace('ss', p(d.getSeconds()));
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

function TitleCellRenderer({ data, colDef, context }) {
  const showTeaser = colDef?.cellRendererParams?.showTeaser;
  const teaser = showTeaser ? (data?.nodeMeta?.teaser?.title ?? null) : null;
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
          whiteSpace: 'nowrap',
        }}>
          NEW
        </span>
      )}
      <span style={{
        fontSize: '13px',
        fontWeight: 600,
        color: '#3f3c4e',
        lineHeight: '1.35',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
      }}>
        {data?.headline || '—'}
      </span>
      {teaser && (
        <span style={{
          fontSize: '11px',
          color: '#69667f',
          lineHeight: '1.3',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}>
          <span style={{ fontWeight: 600, color: '#9d9aac', fontStyle: 'normal' }}>{context?.locales?.teaser || 'Teaser:'}{' '}</span>
          <span style={{ fontStyle: 'italic' }}>{teaser}</span>
        </span>
      )}
    </div>
  );
}

function StatusCellRenderer({ value, data, colDef }) {
  const bg = data?.statusColor ?? '#9ca3af';
  const label = value || 'Unknown';
  const display = colDef.cellRendererParams?.display;
  const [tip, setTip] = useState(null);

  if (display === 'dot') {
    return (
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ top: r.top, left: r.left + r.width / 2 }); }}
        onMouseLeave={() => setTip(null)}
        style={{
          display: 'inline-block', width: '12px', height: '12px',
          borderRadius: '9999px', background: bg, cursor: 'default',
        }}
      >
        <BalloonTooltip visible={!!tip} top={tip?.top} left={tip?.left}>{label}</BalloonTooltip>
      </span>
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

// Registry of Lucide icon components available to the widget.
// The icons registry in conf (id → lucide name) resolves into this map.
const LUCIDE_ICONS = { FileText, Image, Video, Mic, Copy, ArrowRight, Send, Zap, Globe, Trophy, Rocket, Rss, Monitor, MoreHorizontal, ChevronRight, ArrowLeft, Lock, LockOpen, Pencil, Eye };

function TypeIconRenderer({ value, colDef, context, data }) {
  const icons = context?.icons || {};
  const typeIcons = context?.typeIcons || {};
  const iconOnly = colDef.cellRendererParams?.iconOnly;
  const [tip, setTip] = useState(null);
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const iconId = typeIcons[data?.typeName?.toLowerCase()] ?? typeIcons[value?.toLowerCase()];
  const iconName = iconId ? icons[iconId] : null;
  const Icon = iconName ? LUCIDE_ICONS[iconName] : null;

  const displayName = typeDisplayName(value);

  if (iconOnly) {
    return (
      <span
        role="img"
        aria-label={displayName}
        tabIndex={0}
        onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ top: r.top, left: r.left + r.width / 2 }); }}
        onMouseLeave={() => setTip(null)}
        style={{ display: 'inline-flex', alignItems: 'center', color: '#69667f', cursor: 'default' }}
      >
        {Icon ? <Icon size={16} strokeWidth={2} /> : displayName}
        <BalloonTooltip visible={!!tip} top={tip?.top} left={tip?.left}>{displayName}</BalloonTooltip>
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
      {displayName}
    </span>
  );
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function typeDisplayName(typeName) {
  if (!typeName) return '';
  const seg = typeName.split('/').pop();
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function DateUserRenderer({ value, colDef, context, data }) {
  const userCache = context?.userCache ?? {};
  const { userField, userAliasField, locale, dateFormatOptions, datePattern, display, showUnlock } = colDef.cellRendererParams ?? {};
  const [tip, setTip] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const hideTimerRef = useRef(null);

  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;

  let dateStr;
  if (datePattern) {
    dateStr = formatByPattern(value, datePattern);
  } else {
    const fmtOpts = dateFormatOptions || {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    };
    dateStr = new Date(value).toLocaleString(locale, fmtOpts);
  }

  const userId = getNestedValue(data, userField);
  const userAlias = getNestedValue(data, userAliasField);
  const userName = userId ? (userCache[userId] || userAlias || userId) : (userAlias || null);

  if (display === 'icon') {
    const handleTriggerEnter = (e) => {
      clearTimeout(hideTimerRef.current);
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ top: r.top, left: r.left + r.width / 2 });
    };
    const handleTriggerLeave = () => {
      if (showUnlock) {
        hideTimerRef.current = setTimeout(() => setTip(null), 150);
      } else {
        setTip(null);
      }
    };
    const handleTooltipEnter = () => clearTimeout(hideTimerRef.current);
    const handleTooltipLeave = () => {
      hideTimerRef.current = setTimeout(() => setTip(null), 150);
    };
    const handleUnlock = async (e) => {
      e.stopPropagation();
      if (unlocking) return;
      setUnlocking(true);
      try {
        await unlockNode(data.id, data?.lockInfos?.USER?.userUpdateRef?.updateContextId ?? null);
        setTip(null);
        document.dispatchEvent(new CustomEvent('neon-unlock-success', { detail: { familyRef: data.id } }));
      } catch (err) {
        console.error('[DateUserRenderer] Unlock failed:', err.message);
      } finally {
        setUnlocking(false);
      }
    };

    return (
      <span
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default', color: '#69667f' }}
      >
        <Lock size={15} strokeWidth={2} />
        {tip && (
          <LockTooltip
            top={tip.top} left={tip.left}
            onMouseEnter={showUnlock ? handleTooltipEnter : undefined}
            onMouseLeave={showUnlock ? handleTooltipLeave : undefined}
          >
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>{dateStr}</div>
            {userName && (
              <div style={{ color: '#a5b4fc', marginBottom: showUnlock ? '6px' : 0 }}>{userName}</div>
            )}
            {showUnlock && (
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                style={{
                  display: 'block', width: '100%',
                  padding: '3px 8px', borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff', fontSize: '11px', fontWeight: 600,
                  cursor: unlocking ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {unlocking ? '…' : (context?.locales?.unlock || 'Unlock')}
              </button>
            )}
          </LockTooltip>
        )}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: '1px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#3f3c4e', lineHeight: '1.3' }}>{dateStr}</span>
      {userName && (
        <span style={{ fontSize: '11px', color: '#69667f', lineHeight: '1.3' }}>{userName}</span>
      )}
    </div>
  );
}

function WorkspacePicker({ data, onAction, onBack, onClose, workspaceFilter, title, locales }) {
  const allWorkfolders = getWorkfolders();
  const workfolders = workspaceFilter
    ? allWorkfolders.filter(wf =>
        wf.workspace === workspaceFilter ||
        (wf.isWorkspace && wf.label === workspaceFilter)
      )
    : allWorkfolders;
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
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#3f3c4e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title || locales?.selectWorkspace || 'Select workspace'}</span>
      </div>
      <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px', fontSize: '11px', color: '#d22d2d' }}>{error}</div>
        )}
        {workfolders.length === 0 && !error && (
          <div style={{ padding: '10px 8px', color: '#9d9aac', fontSize: '12px' }}>{locales?.noWorkfolders || 'No workfolders available'}</div>
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

function openNeonAction(action, data) {
  const neonAppUrl = window.CONFIG?.neonAppUrl || '';
  const id = data?.id;
  const qs = action.readonly ? '?readonly=true' : '';
  window.open(`${neonAppUrl}/neon/app/neon.html#open/${id}${qs}`);
}

function InlineActionButton({ action, data, icons, onAction }) {
  const [tip, setTip] = useState(null);
  const Icon = LUCIDE_ICONS[icons[action.icon]] || MoreHorizontal;
  const handleClick = (e) => {
    e.stopPropagation();
    if (action.actionType === 'open') { openNeonAction(action, data); }
    else { onAction(action.id, data); }
  };
  return (
    <button
      className="neon-actions-cell"
      onMouseDown={e => e.stopPropagation()}
      onClick={handleClick}
      onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ top: r.top, left: r.left + r.width / 2 }); }}
      onMouseLeave={() => setTip(null)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
        background: 'none', cursor: 'pointer', color: '#3f3c4e',
      }}
    >
      <Icon size={14} strokeWidth={2} />
      <BalloonTooltip visible={!!tip} top={tip?.top} left={tip?.left}>{action.label}</BalloonTooltip>
    </button>
  );
}

function ActionsCellRenderer({ data, colDef, context }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [subPanel, setSubPanel] = useState(null); // null | { type: 'workspacePicker', workspaceFilter, label }
  const [btnTip, setBtnTip] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const allActions = context?.gridActions || [];
  const icons = context?.icons || {};
  const onAction = colDef.cellRendererParams?.onAction || (() => {});

  const inlineActions = allActions.filter(a => a.placement === 'inline' && matchesCondition(a.showWhen, data));
  const menuActions = allActions.filter(a => a.placement !== 'inline' && matchesCondition(a.showWhen, data));

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

  if (inlineActions.length === 0 && menuActions.length === 0) return null;

  // Single menu-action shortcut: render as direct icon button when no inline actions
  if (inlineActions.length === 0 && menuActions.length === 1 && menuActions[0].actionType !== 'moveToWorkspace') {
    const action = menuActions[0];
    const Icon = LUCIDE_ICONS[icons[action.icon]] || MoreHorizontal;
    return (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        <button
          className="neon-actions-cell"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            if (action.actionType === 'open') { openNeonAction(action, data); }
            else { onAction(action.id, data); }
          }}
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setBtnTip({ top: r.top, left: r.left + r.width / 2 }); }}
          onMouseLeave={() => setBtnTip(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
            background: 'none', cursor: 'pointer', color: '#3f3c4e',
          }}
        >
          <Icon size={14} strokeWidth={2} />
          <BalloonTooltip visible={!!btnTip} top={btnTip?.top} left={btnTip?.left}>{action.label}</BalloonTooltip>
        </button>
      </span>
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

  const menuWidth = subPanel?.type === 'workspacePicker' ? '220px' : '150px';

  return (
    <span className="neon-actions-cell" style={{ display: 'inline-flex', verticalAlign: 'middle', alignItems: 'center', gap: '4px' }}>
      {inlineActions.map(action => (
        <InlineActionButton key={action.id} action={action} data={data} icons={icons} onAction={onAction} />
      ))}
      {menuActions.length > 0 && (
        <button
          ref={buttonRef}
          onMouseDown={e => e.stopPropagation()}
          onClick={handleToggle}
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setBtnTip({ top: r.top, left: r.left + r.width / 2 }); }}
          onMouseLeave={() => setBtnTip(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', border: '1px solid #dddce5', borderRadius: '8px',
            background: open ? '#f6f3f6' : 'none', cursor: 'pointer', color: '#3f3c4e',
          }}
        >
          <MoreHorizontal size={14} strokeWidth={2} />
          <BalloonTooltip visible={!!btnTip && !open} top={btnTip?.top} left={btnTip?.left}>{context?.locales?.actions || 'Actions'}</BalloonTooltip>
        </button>
      )}
      {open && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999,
          background: '#ffffff', border: '1px solid #dddce5', borderRadius: '9px',
          boxShadow: '0 8px 24px rgba(63,60,78,.18)', padding: '4px', width: menuWidth,
          transition: 'width 120ms ease',
        }}>
          {subPanel?.type === 'workspacePicker' ? (
            <WorkspacePicker
              data={data}
              onAction={onAction}
              onBack={() => setSubPanel(null)}
              onClose={closeMenu}
              workspaceFilter={subPanel.workspaceFilter}
              title={subPanel.label}
              locales={context?.locales}
            />
          ) : (
            menuActions.map(action => {
              const Icon = LUCIDE_ICONS[icons[action.icon]] || MoreHorizontal;
              const isMoveToWs = action.actionType === 'moveToWorkspace';
              return (
                <button
                  key={action.id}
                  onClick={e => {
                    e.stopPropagation();
                    if (isMoveToWs) { setSubPanel({ type: 'workspacePicker', workspaceFilter: action.workspaceFilter || null, label: action.label }); }
                    else if (action.actionType === 'open') { openNeonAction(action, data); closeMenu(); }
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
                    <Icon size={14} strokeWidth={2} />
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

function BalloonTooltip({ visible, top, left, children }) {
  if (!visible) return null;
  return createPortal(
    <div style={{
      position: 'fixed', top, left,
      transform: 'translate(-50%, calc(-100% - 8px))',
      background: '#3f3c4e', color: '#fff', borderRadius: '8px',
      padding: '7px 10px', fontSize: '11px', zIndex: 9999,
      pointerEvents: 'none', whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(63,60,78,.28)', lineHeight: 1.5,
    }}>
      {children}
      <div style={{
        position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: '5px solid #3f3c4e',
      }} />
    </div>,
    document.body
  );
}

function LockTooltip({ top, left, onMouseEnter, onMouseLeave, children }) {
  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', top, left,
        transform: 'translate(-50%, calc(-100% - 8px))',
        background: '#3f3c4e', color: '#fff', borderRadius: '8px',
        padding: '7px 10px', fontSize: '11px', zIndex: 9999,
        pointerEvents: onMouseEnter ? 'auto' : 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 16px rgba(63,60,78,.28)', lineHeight: 1.5,
      }}
    >
      {children}
      <div style={{
        position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: '5px solid #3f3c4e',
      }} />
    </div>,
    document.body
  );
}

function PublicationIcon({ pub, pubData, iconComponent: Icon, locales }) {
  const [tip, setTip] = useState(null);
  const isPublished = !!pubData;

  const dateStr = pubData?.liveFirstPublicationDate
    ? new Date(pubData.liveFirstPublicationDate).toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;
  const userAlias = pubData?.liveUserRef?.alias || pubData?.liveUserRef?.userId || null;

  return (
    <span
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ top: r.top, left: r.left + r.width / 2 });
      }}
      onMouseLeave={() => setTip(null)}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
    >
      <Icon
        size={16}
        strokeWidth={2}
        style={{ color: isPublished ? '#2563eb' : '#d1d0d8' }}
      />
      <BalloonTooltip visible={!!tip} top={tip?.top} left={tip?.left}>
        <div style={{ fontWeight: 700, marginBottom: '2px' }}>{pub.label || pub.id}</div>
        {isPublished ? (
          <>
            {dateStr && <div style={{ color: '#c4c1d4' }}>{dateStr}</div>}
            {userAlias && <div style={{ color: '#a5b4fc' }}>{userAlias}</div>}
          </>
        ) : (
          <div style={{ color: '#9d9aac' }}>{locales?.notPublished || 'Not published'}</div>
        )}
      </BalloonTooltip>
    </span>
  );
}

function PublicationCellRenderer({ data, colDef, context }) {
  const publications = colDef.cellRendererParams?.publications || [];
  const icons = context?.icons || {};
  const publishInfos = data?.publishInfos || {};

  if (!publications.length) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {publications.map(pub => {
        const Icon = LUCIDE_ICONS[icons[pub.icon]];
        if (!Icon) return null;
        return (
          <PublicationIcon
            key={pub.id}
            pub={pub}
            pubData={publishInfos[pub.id] ?? null}
            iconComponent={Icon}
            locales={context?.locales}
          />
        );
      })}
    </span>
  );
}

function InfoIcon({ def, Icon, data }) {
  const [tip, setTip] = useState(null);

  let pubData = null;
  if (data && def.condition?.field?.startsWith('publishInfos.')) {
    const site = def.condition.field.split('.')[1];
    pubData = data.publishInfos?.[site] ?? null;
  }

  const fmtDate = (ts) => ts
    ? new Date(ts).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const firstPub = fmtDate(pubData?.liveFirstPublicationDate);
  const lastMod = fmtDate(pubData?.lastModified);

  return (
    <span
      onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ top: r.top, left: r.left + r.width / 2 }); }}
      onMouseLeave={() => setTip(null)}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
    >
      <Icon size={15} strokeWidth={2} style={{ color: '#2563eb' }} />
      {(def.label || firstPub || lastMod) && (
        <BalloonTooltip visible={!!tip} top={tip?.top} left={tip?.left}>
          {def.label && <div style={{ fontWeight: 700, marginBottom: (firstPub || lastMod) ? '4px' : 0 }}>{def.label}</div>}
          {firstPub && <div style={{ color: '#c4c1d4' }}>⊙ {firstPub}</div>}
          {lastMod && <div style={{ color: '#a5b4fc' }}>↻ {lastMod}</div>}
        </BalloonTooltip>
      )}
    </span>
  );
}

function LockerInfoIcon({ lockData, data, context }) {
  const [tip, setTip] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const hideTimerRef = useRef(null);

  const userName = lockData?.userUpdateRef?.userName ?? lockData?.userUpdateRef?.userId ?? null;
  const dateStr = lockData?.locked
    ? new Date(lockData.locked).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const handleTriggerEnter = (e) => {
    clearTimeout(hideTimerRef.current);
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ top: r.top, left: r.left + r.width / 2 });
  };
  const handleTriggerLeave = () => { hideTimerRef.current = setTimeout(() => setTip(null), 150); };
  const handleTooltipEnter = () => clearTimeout(hideTimerRef.current);
  const handleTooltipLeave = () => { hideTimerRef.current = setTimeout(() => setTip(null), 150); };
  const handleUnlock = async (e) => {
    e.stopPropagation();
    if (unlocking) return;
    setUnlocking(true);
    try {
      await unlockNode(data.id, lockData?.userUpdateRef?.updateContextId ?? null);
      setTip(null);
      document.dispatchEvent(new CustomEvent('neon-unlock-success', { detail: { familyRef: data.id } }));
    } catch (err) {
      console.error('[LockerInfoIcon] Unlock failed:', err.message);
    } finally { setUnlocking(false); }
  };

  return (
    <span
      onMouseEnter={handleTriggerEnter}
      onMouseLeave={handleTriggerLeave}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default', color: '#69667f' }}
    >
      <Lock size={14} strokeWidth={2} />
      {tip && (
        <LockTooltip top={tip.top} left={tip.left}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          {dateStr && <div style={{ fontWeight: 700, marginBottom: '2px' }}>{dateStr}</div>}
          {userName && <div style={{ color: '#a5b4fc', marginBottom: '6px' }}>{userName}</div>}
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            style={{
              display: 'block', width: '100%',
              padding: '3px 8px', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff', fontSize: '11px', fontWeight: 600,
              cursor: unlocking ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {unlocking ? '…' : (context?.locales?.unlock || 'Unlock')}
          </button>
        </LockTooltip>
      )}
    </span>
  );
}

function ExtendedInfoCellRenderer({ data, colDef, context }) {
  const icons = context?.icons || {};
  const typeIcons = context?.typeIcons || {};
  const iconDefs = colDef.cellRendererParams?.icons || [];
  const showTypeIcon = colDef.cellRendererParams?.showTypeIcon;
  const typeIconChip = colDef.cellRendererParams?.typeIconChip;
  const showLockerInfo = colDef.cellRendererParams?.showLockerInfo;
  const [typeTip, setTypeTip] = useState(null);

  let typeIconEl = null;
  if (showTypeIcon && data?.typeName) {
    const v = data.typeName;
    const iconId = typeIcons[v.toLowerCase()];
    const iconName = iconId ? icons[iconId] : null;
    const Icon = iconName ? LUCIDE_ICONS[iconName] : null;
    if (typeIconChip) {
      typeIconEl = (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '2px 8px', borderRadius: '9999px', fontSize: '11px',
          fontWeight: 600, color: '#69667f', background: '#e7e6ed', whiteSpace: 'nowrap',
        }}>
          {Icon && <Icon size={12} strokeWidth={2} />}
          {v}
        </span>
      );
    } else {
      const displayName = typeDisplayName(v);
      typeIconEl = (
        <span
          role="img"
          aria-label={displayName}
          tabIndex={0}
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTypeTip({ top: r.top, left: r.left + r.width / 2 }); }}
          onMouseLeave={() => setTypeTip(null)}
          style={{ display: 'inline-flex', alignItems: 'center', color: '#69667f', cursor: 'default' }}
        >
          {Icon ? <Icon size={16} strokeWidth={2} /> : displayName}
          <BalloonTooltip visible={!!typeTip} top={typeTip?.top} left={typeTip?.left}>{displayName}</BalloonTooltip>
        </span>
      );
    }
  }

  const visibleIcons = iconDefs.filter(def => {
    if (!def.condition) return true;
    const { field, op, value } = def.condition;
    const fieldVal = getNestedValue(data, field);
    if (op === 'exists')    return fieldVal != null && fieldVal !== '';
    if (op === 'notExists') return fieldVal == null || fieldVal === '';
    if (op === 'eq')        return String(fieldVal) === String(value);
    if (op === 'neq')       return String(fieldVal) !== String(value);
    if (op === 'contains')  return String(fieldVal ?? '').includes(String(value));
    return true;
  });

  let lockEl = null;
  if (showLockerInfo && data?.lockInfos?.USER) {
    lockEl = <LockerInfoIcon lockData={data.lockInfos.USER} data={data} context={context} />;
  }

  if (!typeIconEl && !visibleIcons.length && !lockEl) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      {typeIconEl}
      {visibleIcons.map((def, i) => {
        const Icon = LUCIDE_ICONS[icons[def.icon]];
        if (!Icon) return null;
        return <InfoIcon key={i} def={def} Icon={Icon} data={data} />;
      })}
      {lockEl}
    </span>
  );
}

function InfoCellRenderer({ data, colDef, context }) {
  const icons = context?.icons || {};
  const iconDefs = colDef.cellRendererParams?.icons || [];

  const visible = iconDefs.filter(def => {
    if (!def.condition) return true;
    const { field, op, value } = def.condition;
    const fieldVal = getNestedValue(data, field);
    if (op === 'exists')    return fieldVal != null && fieldVal !== '';
    if (op === 'notExists') return fieldVal == null || fieldVal === '';
    if (op === 'eq')        return String(fieldVal) === String(value);
    if (op === 'neq')       return String(fieldVal) !== String(value);
    if (op === 'contains')  return String(fieldVal ?? '').includes(String(value));
    return true;
  });

  if (!visible.length) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      {visible.map((def, i) => {
        const Icon = LUCIDE_ICONS[icons[def.icon]];
        if (!Icon) return null;
        return <InfoIcon key={i} def={def} Icon={Icon} data={data} />;
      })}
    </span>
  );
}

function SectionCellRenderer({ data, colDef }) {
  const { site, colors } = colDef.cellRendererParams ?? {};

  let path = null;

  if (site) {
    path = data?.publishInfos?.[site]?.sitePrimaryParentPath ?? null;
  }

  if (!path) {
    const names = data?.categories?.primary_section?.[0]?.names;
    if (names) path = typeof names === 'string' ? names : Object.values(names)[0] ?? null;
  }

  if (!path) return <span style={{ color: '#9ca3af' }}>—</span>;

  const segment = path.split('/').filter(Boolean).pop() ?? '—';
  const label = segment.replace(/-/g, ' ');
  const labelLower = label.toLowerCase();

  let chipStyle = null;
  if (colors?.length) {
    const rule = colors.find(r => !r.match || labelLower.includes(r.match.toLowerCase()));
    if (rule) chipStyle = { background: rule.background, color: rule.color };
  }

  if (chipStyle) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
        background: chipStyle.background,
        color: chipStyle.color,
      }}>
        {label}
      </span>
    );
  }

  return (
    <span style={{
      fontSize: '12px', color: '#3f3c4e', fontWeight: 500,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {label}
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
      case 'title':
        return {
          ...base,
          autoHeight: true,
          wrapText: true,
          cellRenderer: TitleCellRenderer,
          cellRendererParams: { showTeaser: !!col.showTeaser },
        };
      case 'status':
        return {
          ...base,
          cellRenderer: StatusCellRenderer,
          cellRendererParams: { display: col.display },
        };
      case 'date': {
        const locale = col.locale;
        const valueFormatter = col.dateFormat === 'ddmmyyyy'
          ? formatIssueDate
          : col.datePattern
          ? (params) => params.value ? formatByPattern(params.value, col.datePattern) : '—'
          : (params) => {
              if (!params.value) return '—';
              const fmtOpts = col.dateFormatOptions || {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              };
              return new Date(params.value).toLocaleString(locale, fmtOpts);
            };
        return { ...base, valueFormatter, cellEditor: col.editable ? 'agDateStringCellEditor' : undefined };
      }
      case 'badge':
        return (col.options && col.options.length)
          ? { ...base, cellRenderer: BadgeCellRenderer, cellRendererParams: { options: col.options } }
          : { ...base, cellRenderer: TypeCellRenderer };
      case 'typeIcon':
        return {
          ...base,
          cellRenderer: TypeIconRenderer,
          cellRendererParams: { iconOnly: !!col.iconOnly },
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
          autoHeight: col.display !== 'icon',
          cellRenderer: DateUserRenderer,
          cellRendererParams: {
            userField: col.userField,
            userAliasField: col.userAliasField,
            locale: col.locale,
            dateFormatOptions: col.dateFormatOptions,
            datePattern: col.datePattern,
            display: col.display,
            showUnlock: !!col.showUnlock,
          },
        };
      case 'publication':
        return { ...base, cellRenderer: PublicationCellRenderer, cellRendererParams: { publications: col.publications || [] } };
      case 'info':
        return {
          ...base,
          cellRenderer: InfoCellRenderer,
          cellRendererParams: { icons: col.icons || [] },
        };
      case 'extendedInfo':
        return {
          ...base,
          cellRenderer: ExtendedInfoCellRenderer,
          cellRendererParams: {
            icons: col.icons || [],
            showTypeIcon: !!col.showTypeIcon,
            typeIconChip: !!col.typeIconChip,
            showLockerInfo: !!col.showLockerInfo,
          },
        };
      case 'section':
        return {
          ...base,
          cellRenderer: SectionCellRenderer,
          cellRendererParams: { site: col.site || null, colors: col.colors || null },
        };
      case 'actions':
        return { ...base, cellRenderer: ActionsCellRenderer, cellRendererParams: { onAction } };
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
