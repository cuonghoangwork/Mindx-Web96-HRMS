import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { LeaveRequestsAPI, ProfileEditRequestsAPI } from "../api";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import { idsMatch } from "../utils/id";
import Button from "../components/Button";
import ApplyLeaveModal from "../components/ApplyLeaveModal";
import { translateApiError } from "../utils/apiError";
import { RequestEditModal } from './employee/RequestEditModal'
import { AttendanceReportCard } from './employee/AttendanceReportCard'
import { LeaveTab } from './employee/LeaveTab'
import { SalaryTab } from './employee/SalaryTab'
import { ActivityTab } from './employee/ActivityTab'
import { ContractCard } from './employee/ContractCard'
import { DocumentsList } from './employee/DocumentsList'
import { InfoItem, EditableSelect } from './employee/ProfileFields'
import { ConfirmChangeModal } from './employee/ConfirmChangeModal'

const EMPLOYEE_TYPES = ["Full-time", "Part-time", "Contract", "Intern"];

const EMPLOYEE_STATUSES = ["Active", "On Leave", "Terminated"];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // keep in sync with hrms-backend/middleware/upload.js

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

export default ViewEmployee;
