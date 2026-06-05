import { useState } from "react";
import { useStore } from "../context/StoreContext";

const EMPLOYMENT_TYPES = [
  { value: "all", label: "All" },
  { value: "Full-time", label: "Full Time" },
  { value: "Part-time", label: "Part Time" },
  { value: "Contract", label: "Contract" },
];

function FilterModal({ onClose }) {
  const {
    filters,
    departments,
    setDepartmentFilter,
    setTypeFilter,
    setSearchFilter,
    clearFilters,
  } = useStore();

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
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(162, 161, 168, 0.2)",
        backdropFilter: "blur(10px)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        className="filter-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "383px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "20px",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "16px" }}>
          <h2
            style={{
              fontFamily: "Lexend",
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--text-main)",
              margin: 0,
            }}
          >
            Filter
          </h2>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "var(--border)",
            marginBottom: "20px",
          }}
        />

        {/* Search Input */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "13px 16px",
              border: "1px solid rgba(162, 161, 168, 0.1)",
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "16px" }}>🔽</span>
            <input
              type="text"
              placeholder="Search by name, employee ID, department..."
              value={filters.search}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                border: "none",
                background: "none",
                flex: 1,
                fontFamily: "Lexend",
                fontSize: "16px",
                fontWeight: 300,
                color: "var(--text-main)",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Department Section */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontFamily: "Lexend",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "16px",
            }}
          >
            Department
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
              fontFamily: "Lexend",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "16px",
            }}
          >
            Select Type
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

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            onClick={handleReset}
            style={{
              flex: 1,
              padding: "20px",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              background: "transparent",
              color: "var(--text-main)",
              fontFamily: "Poppins",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            style={{
              flex: 1,
              padding: "20px",
              border: "none",
              borderRadius: "10px",
              background: "var(--primary)",
              color: "#FFFFFF",
              fontFamily: "Poppins",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
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
          width: "24px",
          height: "24px",
          borderRadius: "4px",
          border: checked ? "none" : "1.5px solid rgba(162, 161, 168, 0.2)",
          background: checked ? "var(--primary)" : "transparent",
          display: "grid",
          placeItems: "center",
          fontSize: "14px",
          color: "white",
        }}
      >
        {checked && "✓"}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ display: "none" }}
      />
      <span
        style={{
          fontFamily: "Lexend",
          fontSize: "16px",
          fontWeight: 300,
          color: "var(--text-main)",
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
          borderColor: checked ? "var(--primary)" : "rgba(162, 161, 168, 0.2)",
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
              background: "var(--primary)",
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
          fontFamily: "Lexend",
          fontSize: "16px",
          fontWeight: 300,
          color: "var(--text-main)",
        }}
      >
        {label}
      </span>
    </label>
  );
}

export default FilterModal;
