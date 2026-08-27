import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import { LeaveRequestsAPI, PayrollAPI, AuditLogAPI, ProfileEditRequestsAPI } from "../api";
import { resolveStatus, buildMonthAttendance, buildDayData } from "../utils/attendance";
import AttendanceCalendarGrid from "../components/AttendanceCalendarGrid";
import PayrollBreakdownPanel from "../components/PayrollBreakdownPanel";
import Avatar from "../components/Avatar";
import Badge, { StatusBadge, TypeBadge } from "../components/Badge";
import { idsMatch } from "../utils/id";
import { leaveTypeLabel } from "../utils/leaveTypes";
import Button from "../components/Button";
import ApplyLeaveModal from "../components/ApplyLeaveModal";
import { translateApiError } from "../utils/apiError";

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

// Task 1.4 — keep in sync with hrms-backend/middleware/upload.js's uploadPdf
const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

// Solo Gaps Milestone 1 — keep in sync with
// hrms-backend/middleware/upload.js's uploadDocuments
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = ["offer_letter", "id_scan", "other"];

// Employee Detail tab shell (8.0e Day 6 scaffold — Day 7/8 flesh out Leave,
// Salary and Activity; Attendance and Documents already have real content
// today (attendance log, contract upload) so they're relocated here as-is
// rather than hidden behind a placeholder.
const DETAIL_TABS = [
  { key: "profile", label: "Profile" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "salary", label: "Salary" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity" },
];

function detailTabLabel(t, tab) {
  if (tab.key === "attendance") return t("sideMenu.attendance", { defaultValue: tab.label });
  if (tab.key === "leave") return t("sideMenu.leave", { defaultValue: tab.label });
  if (tab.key === "documents") return t("documents.title", { defaultValue: tab.label });
  return t(`employees.viewEmployee.tabs.${tab.key}`, { defaultValue: tab.label });
}

function ViewEmployee() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    employees,
    attendance,
    updateEmployee,
    removeEmployee,
    uploadEmployeeAvatar,
    uploadEmployeeContract,
    uploadEmployeeDocuments,
    removeEmployeeDocument,
    getAppNow,
  } = useStore();
  const { isAdmin, isManagerTier, isManager, user: currentUser } = useAuth();
  const [pendingChange, setPendingChange] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  // SideMenu's EMPLOYEE nav deep-links straight into the Salary/Leave tabs
  // (?tab=salary, ?tab=leave — its "Payroll"/"Leave" shortcuts) instead of
  // duplicating this page's content on separate routes. activeTab is
  // derived from the query string rather than its own useState: navigating
  // sidebar link -> sidebar link (My Profile -> Payroll -> Leave) stays on
  // this same route, so a plain useState initializer would only resolve on
  // first mount and never pick up a later ?tab= change.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = DETAIL_TABS.some((t) => t.key === requestedTab) ? requestedTab : "profile";
  const selectTab = (key) => {
    setSearchParams(key === "profile" ? {} : { tab: key }, { replace: true });
  };
  const [showRequestEdit, setShowRequestEdit] = useState(false);
  const [showApplyLeave, setShowApplyLeave] = useState(false);
  const [pendingEditRequest, setPendingEditRequest] = useState(null);
  const fileInputRef = useRef(null);

  const employee = employees.find((emp) => idsMatch(emp.id, id));
  const isOwnRecord = Boolean(
    currentUser?.email && employee?.email && currentUser.email.toLowerCase() === employee.email.toLowerCase(),
  );

  // "Request edit" (name/phone/address/age/sex) is self-service only on the
  // backend — POST /profile-edit-requests always resolves the target from
  // the calling user's own linked employee record, there's no employeeId
  // override for HR/Admin to request on someone else's behalf. So the
  // button below only appears when isOwnRecord is true.
  const loadPendingEditRequest = useCallback(() => {
    if (!isOwnRecord) return;
    ProfileEditRequestsAPI.list()
      .then((res) => setPendingEditRequest((res.items || []).find((r) => r.status === "pending") ?? null))
      .catch(() => {});
  }, [isOwnRecord]);

  useEffect(() => { loadPendingEditRequest(); }, [loadPendingEditRequest]);

  // LeaveRequestsAPI.create resolves the request to the calling user's own
  // linked employee record server-side, so — like Request edit — this is
  // only meaningful (and only shown) on your own profile.
  const handleApplyLeave = async (payload) => {
    await LeaveRequestsAPI.create(payload);
  };

  const handleDeleteEmployee = () => {
    if (!confirm(t("common.confirmDeleteEmployee", { defaultValue: "Delete {{name}}? This cannot be undone.", name: employee.name }))) return;
    removeEmployee(employee.id);
    navigate("/employees");
  };

  if (!employee) {
    return (
      <div className="content-card">
        <h2>{t("employees.viewEmployee.notFoundTitle", { defaultValue: "Employee Not Found" })}</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "12px" }}>
          {t("employees.viewEmployee.notFoundDescription", { defaultValue: "The employee you are looking for does not exist." })}
        </p>
        <Button
          variant="primary"
          style={{ marginTop: "20px" }}
          onClick={() => navigate("/employees")}
        >
          {t("employees.viewEmployee.backToEmployees", { defaultValue: "Back to Employees" })}
        </Button>
      </div>
    );
  }

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t("employees.viewEmployee.avatarErrors.invalidType", { defaultValue: "Please choose a JPEG, PNG, WEBP, or GIF image." }));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t("employees.viewEmployee.avatarErrors.tooLarge", { defaultValue: "Image must be 5MB or smaller." }));
      return;
    }

    setAvatarError("");
    setAvatarUploading(true);
    try {
      await uploadEmployeeAvatar(employee.id, file);
    } catch (err) {
      setAvatarError(translateApiError(err, t) || t("employees.viewEmployee.avatarErrors.uploadFailed", { defaultValue: "Failed to upload photo." }));
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
              aria-label={t("employees.viewEmployee.changePhotoAria", { defaultValue: "Change profile photo" })}
              title={t("employees.viewEmployee.changePhotoAria", { defaultValue: "Change profile photo" })}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "none",
                cursor: avatarUploading ? "default" : "pointer",
                background: "rgba(0,0,0,0.45)",
                color: "var(--txt-inverse)",
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
              <StatusBadge status={employee.status} size="lg" />
              <TypeBadge type={employee.type} size="lg" />
            </div>
            {avatarError && (
              <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
                {avatarError}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
            {isOwnRecord && (
              <Button variant="primary" onClick={() => setShowApplyLeave(true)}>
                + {t("employees.viewEmployee.applyForLeave", { defaultValue: "Apply for leave" })}
              </Button>
            )}
            {isOwnRecord && (
              pendingEditRequest ? (
                <StatusBadge status="pending" />
              ) : (
                <Button variant="secondary" onClick={() => setShowRequestEdit(true)}>
                  {t("employees.viewEmployee.requestEdit", { defaultValue: "Request edit" })}
                </Button>
              )
            )}
            <Button
              variant="secondary"
              onClick={() => navigate("/employees")}
            >
              {t("common.actions.back", { defaultValue: "Back" })}
            </Button>
            {/* employeeController.remove is ADMIN-only (employeeRouter.js) —
                gated on isAdmin here to match, not isHRTier/isManagerTier. */}
            {isAdmin && (
              <Button variant="danger" onClick={handleDeleteEmployee}>
                {t("common.actions.delete", { defaultValue: "Delete" })}
              </Button>
            )}
          </div>
        </div>

        <div className="detail-tabs" role="tablist" aria-label={t("employees.viewEmployee.detailSectionsAria", { defaultValue: "Employee detail sections" })}>
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`detail-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => selectTab(tab.key)}
            >
              {detailTabLabel(t, tab)}
            </button>
          ))}
        </div>

        <div className="detail-tab-panel" role="tabpanel">
          {activeTab === "profile" && (
            <div className="employee-detail-grid">
              {/* Note: the mockup also shows a "Reports To" field here —
                  there's no manager/reportsTo concept anywhere in this app's
                  backend (only a per-department manager, not per-employee),
                  so it's omitted rather than shown with a fabricated name. */}
              <InfoItem label={t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" })} value={employee.employeeId} />
              <InfoItem label={t("common.fieldLabels.department", { defaultValue: "Department" })} value={employee.department} />

              <InfoItem label={t("common.fieldLabels.designation", { defaultValue: "Designation" })} value={employee.designation} />
              <InfoItem label={t("employees.viewEmployee.positionLevel", { defaultValue: "Position Level" })} value={employee.positionLevel || "—"} />

              <EditableSelect
                label={t("common.fieldLabels.employmentType", { defaultValue: "Employment Type" })}
                id="employee-type"
                value={employee.type}
                options={EMPLOYEE_TYPES}
                optionLabel={(o) => t(`common.contractType.${o}`, { defaultValue: o })}
                onChange={(value) =>
                  handleFieldChange("type", t("common.fieldLabels.employmentType", { defaultValue: "Employment Type" }), value)
                }
              />
              <EditableSelect
                label={t("common.fieldLabels.status", { defaultValue: "Status" })}
                id="employee-status"
                value={employee.status}
                options={EMPLOYEE_STATUSES}
                optionLabel={(o) => t(`common.employeeStatus.${o}`, { defaultValue: o })}
                onChange={(value) => handleFieldChange("status", t("common.fieldLabels.status", { defaultValue: "Status" }), value)}
              />

              <InfoItem label={t("common.fieldLabels.age", { defaultValue: "Age" })} value={employee.age || "—"} />
              <InfoItem label={t("common.fieldLabels.sex", { defaultValue: "Sex" })} value={employee.sex ? t(`common.gender.${employee.sex}`, { defaultValue: employee.sex }) : "—"} />

              <div className="employee-detail-grid-span">
                <InfoItem label={t("common.fieldLabels.address", { defaultValue: "Address" })} value={employee.address || "—"} />
              </div>

              <InfoItem label={t("common.fieldLabels.email", { defaultValue: "Email" })} value={employee.email || "—"} />
              <InfoItem label={t("common.fieldLabels.phone", { defaultValue: "Phone" })} value={employee.phone || "—"} />

              <div className="employee-detail-grid-span">
                <InfoItem
                  label={t("common.fieldLabels.annualSalary", { defaultValue: "Annual Salary" })}
                  value={
                    employee.salary ? `$${employee.salary.toLocaleString("en-US")}` : "—"
                  }
                />
              </div>
            </div>
          )}

          {activeTab === "attendance" && (
            <AttendanceReportCard employee={employee} attendance={attendance} navigate={navigate} getAppNow={getAppNow} embedded />
          )}

          {activeTab === "leave" && (
            <LeaveTab
              employee={employee}
              employees={employees}
              isManager={isManager}
              isOwnRecord={isOwnRecord}
            />
          )}

          {activeTab === "salary" && (
            <SalaryTab employee={employee} isManagerTier={isManagerTier} />
          )}

          {activeTab === "documents" && (
            <>
              <ContractCard employee={employee} canManage={isManagerTier} uploadEmployeeContract={uploadEmployeeContract} embedded />
              <DocumentsList
                employee={employee}
                canManage={isManagerTier}
                uploadEmployeeDocuments={uploadEmployeeDocuments}
                removeEmployeeDocument={removeEmployeeDocument}
                embedded
              />
            </>
          )}

          {activeTab === "activity" && (
            <ActivityTab employee={employee} />
          )}
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

      {showRequestEdit && (
        <RequestEditModal
          employee={employee}
          onClose={() => setShowRequestEdit(false)}
          onSubmitted={loadPendingEditRequest}
        />
      )}

      {showApplyLeave && (
        <ApplyLeaveModal
          onClose={() => setShowApplyLeave(false)}
          onSubmit={handleApplyLeave}
        />
      )}
    </>
  );
}

const EDIT_REQUEST_FIELDS = [
  { key: "name", labelKey: "common.fieldLabels.fullName", label: "Full Name" },
  { key: "phone", labelKey: "common.fieldLabels.phone", label: "Phone" },
  { key: "address", labelKey: "common.fieldLabels.address", label: "Address" },
  { key: "age", labelKey: "common.fieldLabels.age", label: "Age" },
  { key: "sex", labelKey: "common.fieldLabels.gender", label: "Gender" },
];

/**
 * RequestEditModal — self-service profile-edit request, moved here from the
 * Settings page (mockup triggers it from the profile detail header, not a
 * standalone settings section). Same ProfileEditRequestsAPI.create call
 * Settings' MyProfileEditSection used; only reachable when isOwnRecord since
 * the backend has no employeeId override for HR/Admin to request on behalf
 * of someone else.
 */
function RequestEditModal({ employee, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: employee.name ?? "",
    phone: employee.phone ?? "",
    address: employee.address ?? "",
    age: employee.age ?? "",
    sex: employee.sex ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const changes = {};
    if (form.name !== (employee.name ?? "")) changes.name = form.name;
    if (form.phone !== (employee.phone ?? "")) changes.phone = form.phone;
    if (form.address !== (employee.address ?? "")) changes.address = form.address;
    if (String(form.age ?? "") !== String(employee.age ?? "")) changes.age = form.age;
    if (form.sex !== (employee.sex ?? "")) changes.sex = form.sex;

    if (Object.keys(changes).length === 0) {
      setError(t("employees.viewEmployee.requestEditModal.noChangesError", { defaultValue: "No changes to submit." }));
      return;
    }
    setSubmitting(true);
    try {
      await ProfileEditRequestsAPI.create(changes);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.requestEditModal.submitFailed", { defaultValue: "Failed to submit request." }));
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2>{t("employees.viewEmployee.requestEdit", { defaultValue: "Request edit" })}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.actions.close", { defaultValue: "Close" })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "-8px", marginBottom: "var(--sp-4)" }}>
          {t("employees.viewEmployee.requestEditModal.approvalNotice", { defaultValue: "Changes to these fields need HR/Admin approval before they take effect." })}
        </p>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          {EDIT_REQUEST_FIELDS.map(({ key, labelKey, label }) => (
            <div className="form-group" key={key}>
              <label className="form-label" htmlFor={`req-edit-${key}`}>{t(labelKey, { defaultValue: label })}</label>
              <input
                id={`req-edit-${key}`}
                name={key}
                value={form[key]}
                onChange={handleChange}
              />
            </div>
          ))}

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>{t("common.actions.cancel", { defaultValue: "Cancel" })}</Button>
            <Button variant="primary" type="submit" loading={submitting}>{t("employees.viewEmployee.requestEditModal.submit", { defaultValue: "Submit request" })}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AttendanceReportCard({ employee, attendance, navigate, getAppNow, embedded = false }) {
  const { t } = useTranslation();
  const months = t("common.months", { returnObjects: true });
  const [showAll, setShowAll] = useState(false);

  const now = getAppNow ? getAppNow() : new Date();
  const [viewYear, setViewYear] = useState(() => now.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

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

  // 8.0e Day 7 — reuse the same month-calendar component/data helpers as
  // pages/Attendance.jsx, scoped to just this one employee.
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const monthExisting = useMemo(
    () => records.filter((r) => r.date.startsWith(monthPrefix)).map((r) => ({ ...r, status: resolveStatus(r) })),
    [records, monthPrefix],
  );
  const monthFull = useMemo(
    () => buildMonthAttendance(viewYear, viewMonth, [employee], monthExisting),
    [viewYear, viewMonth, employee, monthExisting],
  );
  const calendarDayData = useMemo(
    () => buildDayData(monthFull, [employee]),
    [monthFull, employee],
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else setViewMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else setViewMonth((m) => m + 1);
    setSelectedDay(null);
  };

  return (
    <div className={embedded ? undefined : "content-card"} style={embedded ? undefined : { marginTop: "20px" }}>
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
            {t("employees.viewEmployee.attendanceReport.title", { defaultValue: "Attendance Report" })}
          </h3>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {t("employees.viewEmployee.attendanceReport.recordsOnFile", { count: total, defaultValue_one: "{{count}} record on file", defaultValue_other: "{{count}} records on file" })}
            {rate !== null ? t("employees.viewEmployee.attendanceReport.attendanceRateSuffix", { defaultValue: " · {{rate}}% attendance rate", rate }) : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/attendance?employee=${employee.id}`)}
        >
          {t("employees.viewEmployee.attendanceReport.openFullCalendar", { defaultValue: "Open full calendar" })}
        </Button>
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
          {t("employees.viewEmployee.attendanceReport.noRecords", { defaultValue: "No attendance records for this employee yet." })}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            {Object.entries(counts).map(([label, count]) => (
              <Badge key={label} variant={ATTENDANCE_STATUS_VARIANT[label] ?? "neutral"} dot>
                {count} {t(`employees.viewEmployee.attendanceReport.statusLabels.${label}`, { defaultValue: label })}
              </Badge>
            ))}
          </div>

          <div style={{
            border: "1px solid var(--bdr-subtle)", borderRadius: "var(--radius-lg)",
            padding: "var(--sp-4)", marginBottom: "var(--sp-5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-4)" }}>
              <Button variant="secondary" size="sm" onClick={prevMonth}>‹</Button>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                {months[viewMonth]} {viewYear}
              </span>
              <Button variant="secondary" size="sm" onClick={nextMonth}>›</Button>
            </div>
            <AttendanceCalendarGrid
              year={viewYear}
              month={viewMonth}
              dayData={calendarDayData}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              todayStr={now.toISOString().split("T")[0]}
              dotOnly
            />
          </div>

          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th>{t("employees.viewEmployee.attendanceReport.date", { defaultValue: "Date" })}</th>
                  <th>{t("employees.viewEmployee.attendanceReport.checkIn", { defaultValue: "Check In" })}</th>
                  <th>{t("employees.viewEmployee.attendanceReport.checkOut", { defaultValue: "Check Out" })}</th>
                  <th>{t("common.fieldLabels.status", { defaultValue: "Status" })}</th>
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
                        {t(`employees.viewEmployee.attendanceReport.statusLabels.${r.status}`, { defaultValue: r.status })}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {records.length > 10 && (
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: "var(--sp-4)" }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? t("employees.viewEmployee.attendanceReport.showRecentOnly", { defaultValue: "Show recent only" }) : t("employees.viewEmployee.attendanceReport.showAllRecords", { defaultValue: "Show all {{count}} records", count: records.length })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function LeaveStatusBadge({ status }) {
  const { t } = useTranslation();
  const variant = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const label = status ? capitalizeFirst(t(`employees.allEmployees.editRequests.tabs.${status}`, { defaultValue: status })) : "—";
  return <Badge variant={variant} size="sm" dot>{label}</Badge>;
}

/**
 * LeaveTab — ledger + request history for this employee (8.0e Day 7),
 * reusing the same LeaveRequest data as the self-service dashboard. When a
 * Manager is viewing their own record, also shows a "pending approvals —
 * your team" panel, client-side filtered to department === me.department
 * (same audit constraint as the Dashboard's team strip — no backend scoping
 * exists, so this is a display convenience, not an access boundary).
 */
function LeaveTab({ employee, employees, isManager, isOwnRecord }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, balRes] = await Promise.all([
        LeaveRequestsAPI.list(),
        LeaveRequestsAPI.balance({ employeeId: employee.id }),
      ]);
      setLeaveRequests(listRes.items || []);
      setLeaveBalance(balRes.data ?? null);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.leaveTab.loadError", { defaultValue: "Could not load leave data." }));
    } finally {
      setLoading(false);
    }
  }, [employee.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeRequests = useMemo(
    () =>
      [...leaveRequests]
        .filter((r) => idsMatch(r.employeeId, employee.id))
        .sort((a, b) => new Date(b.appliedAt || b.createdAt) - new Date(a.appliedAt || a.createdAt)),
    [leaveRequests, employee.id],
  );

  const teamPending = useMemo(() => {
    if (!isManager || !isOwnRecord || !employee.department) return [];
    return leaveRequests
      .filter((r) => r.status === "pending" && !idsMatch(r.employeeId, employee.id))
      .filter((r) => {
        const emp = employees.find((e) => idsMatch(e.id, r.employeeId));
        return emp && emp.department === employee.department;
      });
  }, [leaveRequests, employees, employee.id, employee.department, isManager, isOwnRecord]);

  const handleTeamReview = async (id, decision) => {
    setReviewingId(id);
    try {
      await LeaveRequestsAPI.review(id, decision);
      await load();
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.leaveTab.updateError", { defaultValue: "Could not update the request." }));
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      {isManager && teamPending.length > 0 && (
        <div style={{
          border: "1px solid var(--bdr-warning)", borderRadius: "var(--radius-lg)",
          background: "var(--bg-warning-subtle)", padding: "var(--sp-4) var(--sp-5)",
          marginBottom: "var(--sp-5)",
        }}>
          <h4 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            {t("employees.viewEmployee.leaveTab.teamPendingTitle", { defaultValue: "Pending Approvals — Your Team" })}
          </h4>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px", marginBottom: "var(--sp-3)" }}>
            {t("employees.viewEmployee.leaveTab.teamPendingDesc", { count: teamPending.length, department: employee.department, defaultValue_one: "{{count}} request from {{department}} awaiting review", defaultValue_other: "{{count}} requests from {{department}} awaiting review" })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {teamPending.map((r) => {
              const isReviewing = reviewingId === r.id;
              return (
                <div key={r.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: "var(--sp-3)", fontSize: "var(--fs-sm)", flexWrap: "wrap",
                  background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
                  borderRadius: "var(--radius-md)", padding: "var(--sp-2) var(--sp-3)",
                }}>
                  <span style={{ fontWeight: "var(--fw-medium)" }}>{r.employeeName}</span>
                  <span style={{ color: "var(--txt-secondary)" }}>
                    {formatDate(r.startDate, language)} – {formatDate(r.endDate, language)} · {r.days}d · {leaveTypeLabel(r.type, t)}
                  </span>
                  <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                    <Button
                      variant="link"
                      disabled={isReviewing}
                      onClick={() => handleTeamReview(r.id, "approved")}
                    >
                      {isReviewing ? "…" : t("common.actions.approve", { defaultValue: "Approve" })}
                    </Button>
                    <Button
                      variant="link"
                      className="btn-link-muted"
                      disabled={isReviewing}
                      onClick={() => handleTeamReview(r.id, "rejected")}
                    >
                      {isReviewing ? "…" : t("common.actions.reject", { defaultValue: "Reject" })}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "var(--sp-6)" }}>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
          {t("employees.viewEmployee.leaveTab.balanceTitle", { defaultValue: "Leave balance" })}
        </h3>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px", marginBottom: "var(--sp-4)" }}>
          {leaveBalance ? t("employees.viewEmployee.leaveTab.balanceForYear", { defaultValue: "For {{year}}", year: leaveBalance.year }) : t("employees.viewEmployee.leaveTab.balanceGeneric", { defaultValue: "Paid and unpaid leave usage" })}
        </p>

        <div className="table-wrap">
          <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
            <thead>
              <tr>
                <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colAccrued", { defaultValue: "Accrued" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colUsed", { defaultValue: "Used" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colRemaining", { defaultValue: "Remaining" })}</th>
              </tr>
            </thead>
            <tbody>
              {(leaveBalance?.balances ?? []).map((b) => (
                <tr key={b.type}>
                  <td>{b.label}</td>
                  <td>{b.accrued ?? t("employees.viewEmployee.leaveTab.unlimited", { defaultValue: "Unlimited" })}</td>
                  <td>{b.used}</td>
                  <td>{b.remaining ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0, marginBottom: "var(--sp-4)" }}>
          {t("employees.viewEmployee.leaveTab.historyTitle", { defaultValue: "Request history" })}
        </h3>

        {employeeRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <div className="empty-state-title">{t("employees.viewEmployee.leaveTab.noRequestsTitle", { defaultValue: "No leave requests on file" })}</div>
            <div className="empty-state-description">{t("employees.viewEmployee.leaveTab.noRequestsDesc", { defaultValue: "Requests this employee submits will show up here." })}</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th>{t("employees.viewEmployee.leaveTab.colDates", { defaultValue: "Dates" })}</th>
                  <th>{t("employees.viewEmployee.leaveTab.colDays", { defaultValue: "Days" })}</th>
                  <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                  <th>{t("employees.viewEmployee.leaveTab.colReason", { defaultValue: "Reason" })}</th>
                  <th>{t("common.fieldLabels.status", { defaultValue: "Status" })}</th>
                </tr>
              </thead>
              <tbody>
                {employeeRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.startDate, language)} – {formatDate(r.endDate, language)}</td>
                    <td>{r.days}</td>
                    <td style={{ color: "var(--txt-secondary)" }}>{leaveTypeLabel(r.type, t)}</td>
                    <td style={{ color: "var(--txt-secondary)" }}>{r.reason || "—"}</td>
                    <td><LeaveStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SalaryTab — full payslip history reused from Payroll (8.0e Day 8).
 *
 * MANAGER/HR/ADMIN get every period they're authorized to see via the
 * payroll API (MANAGER gets back only their own department's payslips —
 * payrollController.js scopes it server-side — HR/ADMIN get everything),
 * filtered client-side to this employee (fine for a small period count). A
 * plain Employee viewing their own profile instead uses the self-service
 * GET /payroll/my-payslips endpoint (10.8), which the backend already
 * resolves to "my own Employee record" and only ever returns
 * approved/paid periods (a draft's numbers are still subject to HR edits).
 */
function SalaryTab({ employee, isManagerTier }) {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [records, setRecords] = useState([]); // [{ period, slip }]
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (isManagerTier) {
          const periodsRes = await PayrollAPI.listPeriods();
          const periods = periodsRes.items ?? [];
          const perPeriod = await Promise.all(
            periods.map((period) =>
              PayrollAPI.listPayslips(period.id)
                .then((res) => ({ period, slips: res.items ?? [] }))
                .catch(() => ({ period, slips: [] })),
            ),
          );
          if (cancelled) return;
          const mine = [];
          perPeriod.forEach(({ period, slips }) => {
            slips
              .filter((s) => idsMatch(s.employeeId, employee.id))
              .forEach((slip) => mine.push({ period, slip }));
          });
          mine.sort((a, b) => (b.period.year - a.period.year) || (b.period.month - a.period.month));
          if (!cancelled) { setRecords(mine); setSelectedIdx(0); }
        } else {
          const res = await PayrollAPI.myPayslips();
          if (cancelled) return;
          const mine = (res.items ?? []).map((slip) => ({
            slip,
            period: {
              label: slip.periodLabel,
              fxRate: slip.fxRate,
              standardWorkingDays: slip.standardWorkingDays,
              fxRateSource: slip.fxRateSource,
            },
          }));
          setRecords(mine);
          setSelectedIdx(0);
        }
      } catch (err) {
        if (!cancelled) setError(translateApiError(err, t) || t("employees.viewEmployee.salaryTab.loadError", { defaultValue: "Could not load payroll data." }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isManagerTier, employee.id, t]);

  if (loading) return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  if (error) return <p className="form-error">{error}</p>;

  if (records.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </div>
        <div className="empty-state-title">{t("employees.viewEmployee.salaryTab.noPayslipsTitle", { defaultValue: "No payslips on file" })}</div>
        <div className="empty-state-description">{t("employees.viewEmployee.salaryTab.noPayslipsDesc", { defaultValue: "This employee hasn't been included in a payroll run yet." })}</div>
      </div>
    );
  }

  const current = records[selectedIdx];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <label htmlFor="salary-period" style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
          {t("employees.viewEmployee.salaryTab.periodLabel", { defaultValue: "Period" })}
        </label>
        <select
          id="salary-period"
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          style={{
            padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
            borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
            color: "var(--txt-primary)", fontFamily: "var(--font-family)",
            fontSize: "var(--fs-sm)", outline: "none", cursor: "pointer",
          }}
        >
          {records.map((r, i) => (
            <option key={r.slip.id} value={i}>{r.period.label}</option>
          ))}
        </select>
      </div>

      <PayrollBreakdownPanel slip={current.slip} currency={currency} fxRate={current.period.fxRate} period={current.period} />
    </div>
  );
}

/**
 * ActivityTab — per-employee history pulled from the real AuditLog (8.0e Day
 * 8), not Dashboard's mock activity feed (that array is page-level summary
 * blurbs, not tied to any one employee — nothing there to actually reuse
 * for a scoped tab). AuditLog's `/recent` endpoint is real, already used
 * nowhere in the frontend today, and open to any authenticated user, so it
 * works for Employee viewing their own record too. It has no `resourceId`
 * filter server-side, so this fetches the recent global feed and filters
 * client-side to this employee's entries — a real follow-up would add that
 * query param.
 */
function ActivityTab({ employee }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    AuditLogAPI.recent({ limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const mine = (res.items ?? []).filter((e) => idsMatch(e.resourceId, employee.id));
        setEntries(mine);
      })
      .catch((err) => { if (!cancelled) setError(translateApiError(err, t) || t("employees.viewEmployee.activityTab.loadError", { defaultValue: "Could not load activity." })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employee.id, t]);

  if (loading) return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  if (error) return <p className="form-error">{error}</p>;

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-6 3 3 5-8" />
          </svg>
        </div>
        <div className="empty-state-title">{t("employees.viewEmployee.activityTab.noActivityTitle", { defaultValue: "No recent activity" })}</div>
        <div className="empty-state-description">
          {t("employees.viewEmployee.activityTab.noActivityDesc", { defaultValue: "Changes to this employee's record will show up here (from the last 50 system-wide events)." })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {entries.map((e) => (
        <div key={e._id ?? `${e.action}-${e.createdAt}`} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)",
          border: "1px solid var(--bdr-subtle)", borderRadius: "var(--radius-md)",
          fontSize: "var(--fs-sm)",
        }}>
          <span style={{ color: "var(--txt-primary)" }}>{e.title}</span>
          <span style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-xs)", whiteSpace: "nowrap" }}>
            {formatDate(e.createdAt, language)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContractCard({ employee, canManage, uploadEmployeeContract, embedded = false }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(t("employees.viewEmployee.contractCard.errors.typeError", { defaultValue: "Please choose a PDF file." }));
      return;
    }
    if (file.size > MAX_CONTRACT_BYTES) {
      setError(t("employees.viewEmployee.contractCard.errors.sizeError", { defaultValue: "Contract must be 10MB or smaller." }));
      return;
    }

    setError("");
    setUploading(true);
    try {
      await uploadEmployeeContract(employee.id, file);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.contractCard.errors.uploadFailed", { defaultValue: "Failed to upload contract." }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={embedded ? undefined : "content-card"} style={embedded ? undefined : { marginTop: "20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {t("employees.viewEmployee.contractCard.title", { defaultValue: "Contract" })}
          </h3>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {employee.contractUrl
              ? t("employees.viewEmployee.contractCard.uploaded", { defaultValue: "Uploaded {{date}}", date: formatDate(employee.contractUploadedAt, language) })
              : t("employees.viewEmployee.contractCard.noContract", { defaultValue: "No contract on file yet." })}
          </p>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          {employee.contractUrl && (
            <a
              href={employee.contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              {t("employees.viewEmployee.contractCard.viewContract", { defaultValue: "View Contract" })}
            </a>
          )}
          {canManage && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handlePick}
                disabled={uploading}
              >
                {uploading ? t("employees.viewEmployee.contractCard.uploading", { defaultValue: "Uploading…" }) : employee.contractUrl ? t("employees.viewEmployee.contractCard.replace", { defaultValue: "Replace Contract" }) : t("employees.viewEmployee.contractCard.upload", { defaultValue: "Upload Contract" })}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// Solo Gaps Milestone 1 — arbitrary multi-document upload (offer letters,
// ID scans, other), additive alongside ContractCard above. Modeled on it
// for the upload-state/error handling, but list-shaped since there can be
// several documents at once, each individually viewable/deletable.
function DocumentsList({ employee, canManage, uploadEmployeeDocuments, removeEmployeeDocument, embedded = false }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const typeLabel = (type) => {
    if (type === "offer_letter") return t("documents.typeOfferLetter");
    if (type === "id_scan") return t("documents.typeIdScan");
    return t("documents.typeOther");
  };

  const handlePick = () => fileInputRef.current?.click();

  const closeAddForm = () => {
    setAdding(false);
    setLabel("");
    setDocType("other");
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    if (files.length > 5) {
      setError(t("documents.tooManyError"));
      return;
    }
    if (files.some((f) => f.type !== "application/pdf")) {
      setError(t("documents.typeError"));
      return;
    }
    if (files.some((f) => f.size > MAX_DOCUMENT_BYTES)) {
      setError(t("documents.sizeError"));
      return;
    }

    setError("");
    setUploading(true);
    try {
      await uploadEmployeeDocuments(employee.id, files, { label, type: docType });
      closeAddForm();
    } catch (err) {
      setError(translateApiError(err, t) || t("documents.uploadError", { defaultValue: "Failed to upload document(s)." }));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm(t("documents.deleteConfirm"))) return;
    setError("");
    setDeletingId(docId);
    try {
      await removeEmployeeDocument(employee.id, docId);
    } catch (err) {
      setError(translateApiError(err, t) || t("documents.deleteError", { defaultValue: "Failed to delete document." }));
    } finally {
      setDeletingId(null);
    }
  };

  const documents = employee.documents || [];

  return (
    <div className={embedded ? undefined : "content-card"} style={{ marginTop: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
          {t("documents.title")}
        </h3>
        {canManage && !adding && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            {t("documents.addDocument")}
          </Button>
        )}
      </div>

      {canManage && adding && (
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "flex-end", marginTop: "var(--sp-3)" }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: "180px" }}>
            <label>{t("documents.labelPlaceholder")}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("documents.labelPlaceholder")}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: "150px" }}>
            <label>{t("documents.typeFieldLabel")}</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <Button variant="secondary" size="sm" onClick={handlePick} disabled={uploading} loading={uploading}>
              {uploading ? t("documents.uploading") : t("documents.chooseFiles")}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeAddForm} disabled={uploading}>
              {t("documents.cancel")}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>
      )}

      {error && (
        <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        {documents.length === 0 && (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("documents.noDocuments")}</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--sp-3)",
              padding: "var(--sp-2) 0",
              borderBottom: "1px solid var(--bdr-subtle)",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>
                {doc.label || typeLabel(doc.type)}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                {typeLabel(doc.type)} · {formatDate(doc.uploadedAt, language)}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                {t("documents.view")}
              </a>
              {canManage && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(doc.id)}
                  loading={deletingId === doc.id}
                >
                  {t("documents.delete")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
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

function EditableSelect({ label, id, value, options, onChange, optionLabel = (o) => o }) {
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
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConfirmChangeModal({ change, employeeName, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("employees.viewEmployee.confirmChangeModal.title", { defaultValue: "Confirm change" })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onCancel}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
          {t("employees.viewEmployee.confirmChangeModal.updatePromptPrefix", { defaultValue: "Update" })} <strong>{change.label}</strong> {t("employees.viewEmployee.confirmChangeModal.updatePromptMiddle", { defaultValue: "for" })}{" "}
          <strong>{employeeName}</strong>{t("employees.viewEmployee.confirmChangeModal.updatePromptSuffix", { defaultValue: "?" })}
        </p>

        <div className="confirm-change-summary">
          <div>
            <span className="detail-label">{t("employees.viewEmployee.confirmChangeModal.current", { defaultValue: "Current" })}</span>
            <span className="detail-value">{change.from}</span>
          </div>
          <span className="confirm-change-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="detail-label">{t("employees.viewEmployee.confirmChangeModal.new", { defaultValue: "New" })}</span>
            <span className="detail-value">{change.to}</span>
          </div>
        </div>

        <div className="modal-actions">
          <Button
            variant="secondary"
            onClick={onCancel}
          >
            {t("common.actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {t("common.actions.confirm", { defaultValue: "Confirm" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ViewEmployee;
