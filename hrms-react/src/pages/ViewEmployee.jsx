import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import { idsMatch } from "../utils/id";

const EMPLOYEE_TYPES = ["Full-time", "Part-time", "Contract", "Intern"];

const EMPLOYEE_STATUSES = ["Active", "On Leave", "Terminated"];

function ViewEmployee() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employees, updateEmployee } = useStore();
  const [pendingChange, setPendingChange] = useState(null);

  const employee = employees.find((emp) => idsMatch(emp.id, id));

  if (!employee) {
    return (
      <div className="content-card">
        <h2>Employee Not Found</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "12px" }}>
          The employee you are looking for does not exist.
        </p>
        <button
          className="btn btn-primary"
          style={{ marginTop: "20px" }}
          onClick={() => navigate("/employees")}
        >
          Back to Employees
        </button>
      </div>
    );
  }

  const handleFieldChange = (field, label, newValue) => {
    const currentValue = employee[field];
    if (newValue === currentValue) return;
    setPendingChange({ field, label, from: currentValue, to: newValue });
  };

  const handleConfirmChange = () => {
    if (!pendingChange) return;
    updateEmployee(employee.id, { [pendingChange.field]: pendingChange.to });
    setPendingChange(null);
  };

  const handleCancelChange = () => {
    setPendingChange(null);
  };

  return (
    <>
      <div className="content-card">
        <div className="employee-detail-header">
          <Avatar
            name={employee.name}
            size="xl"
            status={
              employee.status === "On Leave" ? "leave"
              : employee.status === "Active" ? "active"
              : employee.status === "Terminated" ? "terminated"
              : undefined
            }
          />

          <div style={{ flex: 1 }}>
            <h2>{employee.name}</h2>
            <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              {employee.designation} • {employee.department}
            </p>

            <div className="employee-detail-tags">
              <StatusBadge status={employee.status} size="lg" dot />
              <TypeBadge type={employee.type} size="lg" />
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/employees")}
          >
            Back
          </button>
        </div>

        <div className="employee-detail-grid">
          <InfoItem label="Employee ID" value={employee.employeeId} />
          <InfoItem label="Department" value={employee.department} />
          <div className="employee-detail-grid-span">
            <InfoItem label="Designation" value={employee.designation} />
          </div>
          <EditableSelect
            label="Employment Type"
            id="employee-type"
            value={employee.type}
            options={EMPLOYEE_TYPES}
            onChange={(value) =>
              handleFieldChange("type", "Employment Type", value)
            }
          />
          <EditableSelect
            label="Status"
            id="employee-status"
            value={employee.status}
            options={EMPLOYEE_STATUSES}
            onChange={(value) => handleFieldChange("status", "Status", value)}
          />
          <InfoItem label="Age" value={employee.age || "—"} />
          <InfoItem label="Sex" value={employee.sex || "—"} />
          <div className="employee-detail-grid-span">
            <InfoItem label="Address" value={employee.address || "—"} />
          </div>
          <div className="employee-detail-grid-span">
            <InfoItem
              label="Salary"
              value={
                employee.salary ? `$${employee.salary.toLocaleString()}` : "—"
              }
            />
          </div>
        </div>
      </div>

      {pendingChange && (
        <ConfirmChangeModal
          change={pendingChange}
          employeeName={employee.name}
          onConfirm={handleConfirmChange}
          onCancel={handleCancelChange}
        />
      )}
    </>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

function EditableSelect({ label, id, value, options, onChange }) {
  return (
    <div className="employee-detail-field">
      <label htmlFor={id} className="detail-label">
        {label}
      </label>
      <select
        id={id}
        className="employee-detail-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConfirmChangeModal({ change, employeeName, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Confirm change</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
          Update <strong>{change.label}</strong> for{" "}
          <strong>{employeeName}</strong>?
        </p>

        <div className="confirm-change-summary">
          <div>
            <span className="detail-label">Current</span>
            <span className="detail-value">{change.from}</span>
          </div>
          <span className="confirm-change-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="detail-label">New</span>
            <span className="detail-value">{change.to}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default ViewEmployee;
