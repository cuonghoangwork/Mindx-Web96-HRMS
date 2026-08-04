import { useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import Badge, { StatusBadge, TypeBadge } from "../components/Badge";
import { idsMatch } from "../utils/id";

// Task 4.3: per-employee attendance log/report view. Data already exists in
// the attendance collection (via StoreContext); this maps each recorded
// status to the Badge variant used elsewhere (Attendance.jsx's variantMap).
const ATTENDANCE_STATUS_VARIANT = {
  Present: "success",
  Late: "warning",
  "On Leave": "info",
  Absent: "danger",
  "No-show": "danger",
};

const EMPLOYEE_TYPES = ["Full-time", "Part-time", "Contract", "Intern"];

const EMPLOYEE_STATUSES = ["Active", "On Leave", "Terminated"];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // keep in sync with hrms-backend/middleware/upload.js
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function ViewEmployee() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employees, attendance, updateEmployee, uploadEmployeeAvatar } = useStore();
  const [pendingChange, setPendingChange] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef(null);

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

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Please choose a JPEG, PNG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image must be 5MB or smaller.");
      return;
    }

    setAvatarError("");
    setAvatarUploading(true);
    try {
      await uploadEmployeeAvatar(employee.id, file);
    } catch (err) {
      setAvatarError(err.message || "Failed to upload photo.");
    } finally {
      setAvatarUploading(false);
    }
  };

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
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Avatar
              name={employee.name}
              src={employee.avatar}
              size="xl"
              status={
                employee.status === "On Leave" ? "leave"
                : employee.status === "Active" ? "active"
                : employee.status === "Terminated" ? "terminated"
                : undefined
              }
            />

            <button
              type="button"
              onClick={handleAvatarPick}
              disabled={avatarUploading}
              aria-label="Change profile photo"
              title="Change profile photo"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "none",
                cursor: avatarUploading ? "default" : "pointer",
                background: "rgba(0,0,0,0.45)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: avatarUploading ? 1 : 0,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { if (!avatarUploading) e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { if (!avatarUploading) e.currentTarget.style.opacity = "0"; }}
            >
              {avatarUploading ? (
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ animation: "btn-spin 0.7s linear infinite" }}>
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                  <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_AVATAR_TYPES.join(",")}
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <h2>{employee.name}</h2>
            <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              {employee.designation} • {employee.department}
            </p>

            <div className="employee-detail-tags">
              <StatusBadge status={employee.status} size="lg" dot />
              <TypeBadge type={employee.type} size="lg" />
            </div>
            {avatarError && (
              <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
                {avatarError}
              </p>
            )}
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
          <InfoItem
            label="Position Level"
            value={employee.positionLevel || "—"}
          />
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

      <AttendanceReportCard employee={employee} attendance={attendance} navigate={navigate} />

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

function AttendanceReportCard({ employee, attendance, navigate }) {
  const [showAll, setShowAll] = useState(false);

  const records = useMemo(
    () =>
      attendance
        .filter((r) => idsMatch(r.employeeId, employee.id))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, employee.id],
  );

  const counts = useMemo(() => {
    const c = {};
    records.forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [records]);

  const total = records.length;
  const presentLike = (counts["Present"] ?? 0) + (counts["Late"] ?? 0);
  const rate = total > 0 ? Math.round((presentLike / total) * 100) : null;
  const visible = showAll ? records : records.slice(0, 10);

  return (
    <div className="content-card" style={{ marginTop: "20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
          marginBottom: "var(--sp-4)",
        }}
      >
        <div>
          <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
            Attendance Report
          </h3>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {total} record{total === 1 ? "" : "s"} on file
            {rate !== null ? ` · ${rate}% attendance rate` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/attendance?employee=${employee.id}`)}
        >
          Open full calendar
        </button>
      </div>

      {total === 0 ? (
        <div
          style={{
            padding: "var(--sp-6)",
            textAlign: "center",
            color: "var(--txt-secondary)",
            fontSize: "var(--fs-sm)",
          }}
        >
          No attendance records for this employee yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            {Object.entries(counts).map(([label, count]) => (
              <Badge key={label} variant={ATTENDANCE_STATUS_VARIANT[label] ?? "neutral"} dot>
                {count} {label}
              </Badge>
            ))}
          </div>

          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{r.checkIn ?? "—"}</td>
                    <td>{r.checkOut ?? "—"}</td>
                    <td>
                      <Badge variant={ATTENDANCE_STATUS_VARIANT[r.status] ?? "neutral"} size="sm">
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {records.length > 10 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: "var(--sp-4)" }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show recent only" : `Show all ${records.length} records`}
            </button>
          )}
        </>
      )}
    </div>
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
