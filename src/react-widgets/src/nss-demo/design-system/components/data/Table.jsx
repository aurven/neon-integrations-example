import React from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/**
 * Neon data table.
 * columns: [{ key, header, width?, sortable?, render?(row) }]
 * rows: array of objects; rowKey(row) -> id
 */
export function Table({
  columns = [], rows = [], rowKey = (r, i) => i, compact = false,
  sortKey, sortDir = "asc", onSort, selectedKey, onRowClick, className = "", ...rest
}) {
  const cls = ["neon", "neon-table", compact ? "neon-table--compact" : "", className].filter(Boolean).join(" ");
  return (
    <table className={cls} {...rest}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} style={{ width: col.width }}
              className={col.sortable ? "neon-th--sortable" : ""}
              onClick={() => col.sortable && onSort && onSort(col.key)}>
              <span className="neon-th__inner">
                {col.header}
                {col.sortable && (
                  sortKey === col.key
                    ? (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                    : <ChevronsUpDown size={10} />
                )}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const k = rowKey(row, i);
          return (
            <tr key={k} className={k === selectedKey ? "neon-tr--selected" : ""}
              onClick={() => onRowClick && onRowClick(row)}>
              {columns.map(col => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
export default Table;
