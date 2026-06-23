import { useState, useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { buildColumnDefs, defaultColDef } from './columns.jsx';
import { fetchArticles, updateMetadata } from './api.js';
import { buildMetadataChangeFromXpath } from './metadata.js';
import { usePollingSearchDelta } from './usePollingSearchDelta.js';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './neon-grid.css';

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 14.016 14.002" fill="none">
    <path d="M 11.96 2.059 C 10.87 0.965 9.448 0.262 7.917 0.06 C 6.386 -0.142 4.831 0.168 3.494 0.942 C 2.158 1.715 1.114 2.909 0.527 4.337 C -0.061 5.765 -0.16 7.348 0.245 8.838 C 0.65 10.328 1.537 11.643 2.767 12.577 C 3.997 13.511 5.501 14.012 7.046 14.002 C 8.59 13.993 10.088 13.472 11.306 12.523 C 12.524 11.573 13.394 10.248 13.78 8.752 L 11.96 8.752 C 11.639 9.659 11.074 10.46 10.329 11.068 C 9.583 11.676 8.684 12.067 7.731 12.198 C 6.778 12.33 5.808 12.197 4.925 11.814 C 4.043 11.431 3.282 10.813 2.727 10.027 C 2.172 9.241 1.844 8.318 1.778 7.358 C 1.713 6.399 1.912 5.439 2.355 4.585 C 2.797 3.731 3.466 3.015 4.288 2.516 C 5.111 2.016 6.054 1.752 7.016 1.752 C 7.704 1.754 8.385 1.892 9.019 2.159 C 9.653 2.427 10.228 2.818 10.709 3.31 L 7.891 6.127 L 14.016 6.127 L 14.016 0.002 L 11.96 2.059 Z" fill="currentColor" fillRule="nonzero" />
  </svg>
);

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '22px', left: '50%', transform: 'translateX(-50%)', zIndex: 600,
      background: '#3f3c4e', color: '#fff', borderRadius: '10px', padding: '10px 16px',
      fontSize: '12.5px', fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.28)',
    }}>
      {toast.text}
    </div>
  );
}

const ACTION_LABELS = { copy: 'Copy', move: 'Move', send: 'Send' };

export default function NeonGridWidget() {
  const gridConfig = window.CONFIG?.gridConfig ?? { columns: [] };

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((text) => {
    setToast({ text, t: Date.now() });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const handleAction = useCallback((actionId, row) => {
    const label = ACTION_LABELS[actionId] || actionId;
    showToast(`${label} triggered for "${row?.headline ?? row?.id ?? 'row'}"`);
  }, [showToast]);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userCache = useMemo(() => {
    const map = {};
    rowData.forEach(row => {
      const addUser = (userId, alias) => { if (userId) map[userId] = alias || userId; };
      addUser(row.versionInfo?.createFamilyUserRef?.userId, row.versionInfo?.createFamilyUserRef?.alias);
      addUser(row.lockInfos?.USER?.userUpdateRef?.userId, row.lockInfos?.USER?.userUpdateRef?.userName);
      addUser(row.versionInfo?.updateVersionUserRef?.userId, row.versionInfo?.updateVersionUserRef?.alias);
    });
    return map;
  }, [rowData]);

  const columnDefs = useMemo(
    () => buildColumnDefs(gridConfig.columns, { onAction: handleAction }),
    [gridConfig, handleAction]
  );

  const fetchFn = useCallback(() => {
    return fetchArticles()
      .then(d => d.articles ?? d)
      .catch(err => {
        setError(err.message);
        setLoading(false);
        return [];
      });
  }, []);

  const handleDelta = useCallback((delta) => {
    if (delta.type === 'init') {
      setRowData(delta.items);
      setLoading(false);
      return;
    }
    const removed = new Set(delta.removedIds);
    setRowData(prev => {
      const kept = prev.filter(r => !removed.has(r.id));
      return [...kept, ...delta.added.map(a => ({ ...a, isNew: true }))];
    });
  }, []);

  const { reload } = usePollingSearchDelta({
    fetchFn,
    idKey: 'id',
    intervalMs: gridConfig.pollIntervalMs ?? 20000,
    onDelta: handleDelta
  });

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    reload();
  }, [reload]);

  const handleCellValueChanged = useCallback((params) => {
    const familyRef = params.data?.id;
    setRowData(prev => prev.map(r => r.id === familyRef ? { ...r, isNew: false } : r));

    const colCfg = gridConfig.columns.find(c => c.field === params.colDef.field);
    const change = buildMetadataChangeFromXpath(colCfg?.metadataXpath, params.newValue, { isDate: !!colCfg?.isDate });
    if (!familyRef || !change) return;

    if (window.CONFIG?.demo) {
      console.log(`[Neon Grid] Would update ${familyRef} -> ${change.xpath} = ${change.value ?? '(unset)'}`);
      return;
    }

    updateMetadata(familyRef, [change]).catch(err => {
      console.error(`[Neon Grid] Metadata update failed for ${familyRef}:`, err.message);
    });
  }, [gridConfig]);

  const handleRowClicked = useCallback((params) => {
    const familyRef = params.data?.id;
    setRowData(prev => prev.map(r => r.id === familyRef ? { ...r, isNew: false } : r));
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#f9f9fb',
      fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 16px',
        height: '48px',
        background: '#ffffff',
        borderBottom: '1px solid #dddce5',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#3f3c4e' }}>Articles</span>
        {!loading && !error && (
          <span style={{
            fontSize: '11px',
            color: '#69667f',
            background: '#f6f3f6',
            padding: '1px 8px',
            borderRadius: '999px'
          }}>
            {rowData.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            background: 'none',
            border: '1px solid #dddce5',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            color: loading ? '#bfbfca' : '#3f3c4e',
            fontFamily: 'inherit',
            transition: 'background 120ms ease-out, color 120ms ease-out'
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#f6f3f6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
        >
          <RefreshIcon />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, padding: '16px', overflow: 'hidden', minHeight: 0 }}>
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9d9aac',
            fontSize: '14px'
          }}>
            Loading articles…
          </div>
        )}
        {error && !loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#d22d2d',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <div
            className="ag-theme-alpine"
            style={{
              height: '100%',
              width: '100%',
              border: '1px solid #dddce5',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: 'none'
            }}
          >
            <AgGridReact
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              context={{ userCache }}
              pagination={true}
              paginationPageSize={25}
              onCellValueChanged={handleCellValueChanged}
              onRowClicked={handleRowClicked}
              rowClassRules={{ 'ag-row-new': params => !!params.data?.isNew }}
            />
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
