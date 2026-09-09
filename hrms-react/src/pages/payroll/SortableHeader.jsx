
export function SortableHeader({ field, label, sortField, sortDir, onSort, align = "left" }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: "pointer", userSelect: "none", textAlign: align, whiteSpace: "nowrap" }}
    >
      {label}
      <span style={{ marginLeft: "4px", opacity: active ? 1 : 0.25 }}>
        {active && sortDir === "asc" ? "▲" : "▼"}
      </span>
    </th>
  );
}
