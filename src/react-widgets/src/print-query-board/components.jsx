import { useState } from 'react';
import { STATUS_STYLE, fmtDateTime } from './data.js';

export const C = {
  bg:        'rgb(246,243,246)',
  panelBg:   'rgb(249,249,251)',
  zone:      'rgb(221,220,229)',
  dark:      'rgb(63,60,78)',
  dark2:     'rgb(29,25,48)',
  mid:       'rgb(105,102,127)',
  muted:     'rgb(157,154,172)',
  border:    'rgb(221,220,229)',
  blue:      'rgb(10,46,230)',
  blueLight: 'rgb(229,236,255)',
  green:     'rgb(39,201,46)',
  yellow:    'rgb(255,192,65)',
  red:       'rgb(210,45,45)',
  white:     '#ffffff',
};

export function CoverageBar({ pct, status, height = 5, style = {} }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.empty;
  const w = Math.min(Math.max(pct || 0, 0), 1.1) / 1.1 * 100;
  return (
    <div style={{ height, background: C.zone, borderRadius: 999, overflow: 'hidden', ...style }}>
      <div style={{ height: '100%', width: `${w}%`, background: st.bar, borderRadius: 999, transition: 'width .25s ease' }} />
    </div>
  );
}

export function StatusBadge({ status, pct }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.empty;
  const label = status === 'empty' ? 'Empty' : `${Math.round((pct || 0) * 100)}%`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 7px', borderRadius: 10,
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      background: st.bg, color: st.text,
    }}>{label}</span>
  );
}

export function VisibilityDot({ publishedAt, expiresAt }) {
  const [show, setShow] = useState(false);
  const now = new Date();
  const pub = new Date(publishedAt);
  const exp = expiresAt ? new Date(expiresAt) : null;
  const isScheduled = pub > now;
  const isExpired   = exp && exp <= now;
  const dotColor    = isScheduled ? C.yellow : isExpired ? C.muted : C.green;
  const statusLabel = isScheduled ? 'Scheduled' : isExpired ? 'Expired' : 'Live';
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, cursor: 'default', flexShrink: 0 }} />
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: C.dark2, color: '#f8fafc',
          borderRadius: 8, padding: '8px 12px', fontSize: 11, lineHeight: 1.5,
          whiteSpace: 'nowrap', zIndex: 300, boxShadow: '0 6px 20px rgba(0,0,0,.22)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2, color: dotColor }}>{statusLabel}</div>
          <div style={{ color: '#cbd5e1' }}>{isScheduled ? 'Goes live: ' : 'Published: '}{fmtDateTime(publishedAt)}</div>
          {exp && <div style={{ color: '#cbd5e1' }}>Expires: {fmtDateTime(expiresAt)}</div>}
          {!exp && !isScheduled && <div style={{ color: '#64748b' }}>No expiry set</div>}
        </div>
      )}
    </div>
  );
}

export function NeonPanel({ title, icon, actions, toolbar, children, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40, borderBottom: `1px solid ${C.border}`, background: C.white, flexShrink: 0 }}>
        {icon && icon}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{title}</span>
        <div style={{ flex: 1 }} />
        {actions}
      </div>
      {toolbar && (
        <div style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, background: C.panelBg, flexShrink: 0 }}>
          {toolbar}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: C.panelBg, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function NeonInput({ icon, style = {}, ...props }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
      {icon && <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>{icon}</div>}
      <input style={{
        width: '100%', height: 30, borderRadius: 8, border: `1px solid ${C.border}`,
        background: C.white, color: C.dark, fontSize: 12,
        padding: icon ? '0 8px 0 28px' : '0 8px', outline: 'none', fontFamily: 'inherit',
        boxSizing: 'border-box',
      }} {...props} />
    </div>
  );
}

// Icons
export const IconSearch = ({ size = 12, color = C.muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
);
export const IconFilter = ({ size = 13, color = C.mid }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
);
export const IconCalendar = ({ size = 12, color = C.muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
export const IconSection = ({ size = 13, color = C.mid }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
);
