import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import Button from "./Button";

function FilterModal({ onClose }) {
  const { t } = useTranslation();
  const {
    filters,
    departments,
    setDepartmentFilter,
    setTypeFilter,
    setSearchFilter,
    clearFilters,
  } = useStore();

  const EMPLOYMENT_TYPES = [
    { value: "all", label: t("filterModal.employmentTypes.all", { defaultValue: "All" }) },
    { value: "Full-time", label: t("filterModal.employmentTypes.Full-time", { defaultValue: "Full Time" }) },
    { value: "Part-time", label: t("filterModal.employmentTypes.Part-time", { defaultValue: "Part Time" }) },
    { value: "Contract", label: t("filterModal.employmentTypes.Contract", { defaultValue: "Contract" }) },
  ];

  const [selectedDepartments, setSelectedDepartments] = useState(
    filters.department ? filters.department.split(",") : [],
  );
  const [selectedType, setSelectedType] = useState(filters.type || "all");

  const handleDepartmentToggle = (dept) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );
  };

  const handleApply = () => {
    setDepartmentFilter(selectedDepartments.join(","));
    setTypeFilter(selectedType);
    onClose();
  };

  const handleReset = () => {
    setSelectedDepartments([]);
    setSelectedType("all");
    clearFilters();
    onClose();
  };

  const departmentNames = departments.map((dept) => dept.name).sort();
  const mid = Math.ceil(departmentNames.length / 2);
  const leftColumn = departmentNames.slice(0, mid);
  const rightColumn = departmentNames.slice(mid);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "400px" }}
      >
        <div className="modal-header">
          <h2>{t("filterModal.title", { defaultValue: "Filter" })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "13px 16px",
              border: "1px solid var(--bdr-subtle)",
              borderRadius: "var(--radius-md)",
              color: "var(--txt-secondary)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={t("filterModal.searchPlaceholder", { defaultValue: "Search by name, employee ID, department..." })}
              value={filters.search}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                border: "none",
                background: "none",
                flex: 1,
                fontFamily: "var(--font-family)",
                fontSize: "var(--fs-md)",
                color: "var(--txt-primary)",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Department Section */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-semibold)",
              color: "var(--txt-primary)",
              marginBottom: "16px",
            }}
          >
            {t("filterModal.departmentHeading", { defaultValue: "Department" })}
          </h3>

          <div
            style={{
              display: "flex",
              gap: "30px",
            }}
          >
            {/* Left Column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {leftColumn.map((dept) => (
                <CheckboxItem
                  key={dept}
                  label={dept}
                  checked={selectedDepartments.includes(dept)}
                  onChange={() => handleDepartmentToggle(dept)}
                />
              ))}
            </div>

            {/* Right Column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {rightColumn.map((dept) => (
                <CheckboxItem
                  key={dept}
                  label={dept}
                  checked={selectedDepartments.includes(dept)}
                  onChange={() => handleDepartmentToggle(dept)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Employment Type */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-semibold)",
              color: "var(--txt-primary)",
              marginBottom: "16px",
            }}
          >
            {t("filterModal.selectTypeHeading", { defaultValue: "Select Type" })}
          </h3>

          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {EMPLOYMENT_TYPES.map((type) => (
              <RadioItem
                key={type.value}
                label={type.label}
                checked={selectedType === type.value}
                onChange={() => setSelectedType(type.value)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 0, paddingTop: "var(--sp-5)" }}>
          <Button variant="secondary" onClick={handleReset} style={{ flex: 1 }}>
            {t("filterModal.reset", { defaultValue: "Reset" })}
          </Button>
          <Button variant="primary" onClick={handleApply} style={{ flex: 1 }}>
            {t("filterModal.apply", { defaultValue: "Apply" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckboxItem({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "var(--radius-sm)",
          border: checked ? "none" : "1.5px solid var(--bdr-subtle)",
          background: checked ? "var(--bg-primary)" : "transparent",
          display: "grid",
          placeItems: "center",
          color: "var(--txt-on-brand)",
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ display: "none" }}
      />
      <span
        style={{
          fontFamily: "var(--font-family)",
          fontSize: "var(--fs-md)",
          color: "var(--txt-primary)",
        }}
      >
        {label}
      </span>
    </label>
  );
}

function RadioItem({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          border: "1.5px solid",
          borderColor: checked ? "var(--bg-primary)" : "var(--bdr-subtle)",
          display: "grid",
          placeItems: "center",
          padding: "2px",
        }}
      >
        {checked && (
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "var(--bg-primary)",
            }}
          />
        )}
      </div>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ display: "none" }}
      />
      <span
        style={{
          fontFamily: "var(--font-family)",
          fontSize: "var(--fs-md)",
          color: "var(--txt-primary)",
        }}
      >
        {label}
      </span>
    </label>
  );
}

export default FilterModal;
