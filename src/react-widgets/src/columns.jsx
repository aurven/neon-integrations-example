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

export function buildColumnDefs(columns = []) {
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
      case 'select':
        return {
          ...base,
          cellRenderer: BadgeCellRenderer,
          cellRendererParams: { options: col.options || [] },
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: (col.options || []).map(o => o.value) },
        };
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
