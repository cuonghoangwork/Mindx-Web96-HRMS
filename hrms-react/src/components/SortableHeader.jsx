import { useTranslation } from "react-i18next";

/**
 * Sortable column header. The arrow is always visible and dimmed when
 * inactive, which is what makes a column look sortable before it is clicked.
 * `.sortable-header` / `.sort-indicator` in index.css carry the styling.
 */
export function SortableHeader({ field, label, sortField, sortDir, onSort, align = "left" }) {
  const { t } = useTranslation();
  const active = sortField === field;
  return (
    <th
      className="sortable-header"
      onClick={() => onSort(field)}
      style={{ textAlign: align, whiteSpace: "nowrap" }}
      title={t("common.actions.sortBy", { defaultValue: "Sort by {{label}}", label })}
    >
      {label}
      <span
        className="sort-indicator"
        aria-hidden="true"
        style={{ marginLeft: "4px", opacity: active ? 1 : 0.25 }}
      >
        {active && sortDir === "asc" ? "▲" : "▼"}
      </span>
    </th>
  );
}

export default SortableHeader;
