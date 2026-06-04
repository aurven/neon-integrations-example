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
    headerName: 'Headline',
    flex: 2,
    minWidth: 200,
    resizable: true,
    sortable: true,
    filter: true
  },
  {
    field: 'summary',
    headerName: 'Summary',
    flex: 3,
    minWidth: 200,
    resizable: true,
    sortable: false,
    filter: false
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
  cellStyle: { fontSize: '13px' }
};
