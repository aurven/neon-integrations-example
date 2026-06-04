function HeadlineCellRenderer({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: '2px' }}>
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

export const columnDefs = [
  {
    field: 'headline',
    headerName: 'Title',
    flex: 5,
    minWidth: 260,
    resizable: true,
    sortable: true,
    filter: true,
    autoHeight: true,
    cellRenderer: HeadlineCellRenderer
  },
  {
    field: 'date',
    headerName: 'Date',
    width: 180,
    resizable: true,
    sortable: true,
    valueFormatter: formatDate
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    resizable: false,
    sortable: true,
    filter: true,
    cellRenderer: StatusCellRenderer
  }
];

export const defaultColDef = {
  suppressMovable: false,
  cellStyle: {
    fontSize: '13px',
    fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, sans-serif',
    color: '#3f3c4e',
    lineHeight: '1.4'
  }
};
