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

const PRINT_PRIORITY_COLORS = {
  1: '#d6362f',
  2: '#cf5a6e',
  3: '#b072c7',
  4: '#7a93dd',
  5: '#5fb3e6'
};

function PrintPriorityCellRenderer({ value }) {
  if (!value) return '—';
  const bg = PRINT_PRIORITY_COLORS[value] ?? '#9ca3af';
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
      {`P${value}`}
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

function PrintDiffusionCellRenderer({ value }) {
  const isYes = String(value).toLowerCase() === 'yes';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#fff',
      background: isYes ? '#3aa76d' : '#9ca3af',
      whiteSpace: 'nowrap'
    }}>
      {isYes ? 'Yes' : 'No'}
    </span>
  );
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
    field: 'type',
    headerName: 'Type',
    width: 130,
    resizable: false,
    sortable: true,
    filter: true,
    cellRenderer: TypeCellRenderer
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
  },
  {
    field: 'printPriority',
    headerName: 'Print Priority',
    width: 140,
    resizable: false,
    sortable: true,
    filter: true,
    editable: true,
    cellRenderer: PrintPriorityCellRenderer,
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: [1, 2, 3, 4, 5] }
  },
  {
    field: 'issueDate',
    headerName: 'Issue Date',
    width: 140,
    resizable: true,
    sortable: true,
    filter: true,
    editable: true,
    valueFormatter: formatIssueDate,
    cellEditor: 'agDateStringCellEditor'
  },
  {
    field: 'printSection',
    headerName: 'Print Section',
    width: 160,
    resizable: true,
    sortable: true,
    filter: true,
    editable: true,
    valueFormatter: (params) => params.value || '—'
  },
  {
    field: 'printDiffusion',
    headerName: 'Print Diffusion',
    width: 140,
    resizable: false,
    sortable: true,
    filter: true,
    editable: true,
    cellRenderer: PrintDiffusionCellRenderer,
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: ['yes', 'no'] }
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
