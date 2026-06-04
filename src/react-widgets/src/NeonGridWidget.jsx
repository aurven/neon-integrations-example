import { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { columnDefs, defaultColDef } from './columns.jsx';
import { fetchArticles } from './api.js';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function NeonGridWidget() {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchArticles()
      .then(data => {
        setRowData(data.articles ?? data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
        Loading articles…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#ef4444' }}>
        Failed to load articles: {error}
      </div>
    );
  }

  return (
    <div
      className="ag-theme-alpine"
      style={{ height: 'calc(100vh - 48px)', width: '100%' }}
    >
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows={true}
        pagination={true}
        paginationPageSize={25}
      />
    </div>
  );
}
