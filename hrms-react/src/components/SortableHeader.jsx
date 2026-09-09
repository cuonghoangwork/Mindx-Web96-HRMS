import { useTranslation } from "react-i18next";

/**
 * A sortable table column header.
 *
 * Unifies two components that shared a name but not a behaviour (F7):
 *
 *   AllEmployees  .sortable-header class + an i18n tooltip, arrow shown ONLY
 *                 on the active column, prop named `sortOrder`
 *   Payroll       inline styles, no tooltip, arrow ALWAYS shown and dimmed
 *                 when inactive, prop named `sortDir`, plus an `align` prop
 *
 * This takes the useful half of each: the class and the tooltip from
 * AllEmployees, the always-visible dimmed arrow and `align` from Payroll. So
 * Payroll gains a tooltip, and AllEmployees gains dimmed arrows on inactive
 * columns — which is what makes a column look sortable before you click it.
 *
 * The prop is `sortDir`, Payroll's name, because six of the seven call sites
 * already used it.
 *
 * `.sortable-header` (index.css) supplies cursor:pointer, user-select:none and
 * the hover colour that Payroll previously set inline; `.sort-indicator`
 * supplies the arrow's brand colour and size.
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
