import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { translateApiError } from "../utils/apiError";

/* ─────────────────────────────────
   Step config
───────────────────────────────── */
/* ── Step SVG icons (outline, currentColor, 20×20) ── */
const StepIcons = {
  personal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  job: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  ),
  finance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-5 2.5-5 5 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
    </svg>
  ),
  review: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

const STEPS = [
  { id: 1, key: "personal", label: "Personal",  icon: StepIcons.personal, desc: "Basic information" },
  { id: 2, key: "job",      label: "Job",        icon: StepIcons.job,      desc: "Position & contract" },
  { id: 3, key: "finance",  label: "Finance",    icon: StepIcons.finance,  desc: "Salary & benefits" },
  { id: 4, key: "review",   label: "Review",     icon: StepIcons.review,   desc: "Check & save" },
];

/* ─────────────────────────────────
   Validation rules
───────────────────────────────── */
const RULES = {
  name:        (v, t) => !v.trim() ? t("employees.addEmployee.errors.nameRequired", { defaultValue: "Full name is required" }) : v.trim().length < 2 ? t("employees.addEmployee.errors.nameTooShort", { defaultValue: "Name is too short" }) : "",
  age:         (v, t) => !v ? t("employees.addEmployee.errors.ageRequired", { defaultValue: "Age is required" }) : (Number(v) < 18 || Number(v) > 80) ? t("employees.addEmployee.errors.ageRange", { defaultValue: "Age must be 18–80" }) : "",
  sex:         (v, t) => !v ? t("employees.addEmployee.errors.genderRequired", { defaultValue: "Please select a gender" }) : "",
  email:       (v, t) => v && !/\S+@\S+\.\S+/.test(v) ? t("employees.addEmployee.errors.emailInvalid", { defaultValue: "Invalid email address" }) : "",
  employeeId:  (v, t) => !v.trim() ? t("employees.addEmployee.errors.employeeIdRequired", { defaultValue: "Employee ID is required" }) : !/^[A-Z]{2,4}\d{2,6}$/i.test(v.trim()) ? t("employees.addEmployee.errors.employeeIdFormat", { defaultValue: "Format: EMP001" }) : "",
  department:  (v, t) => !v ? t("employees.addEmployee.errors.departmentRequired", { defaultValue: "Please select a department" }) : "",
  designation: (v, t) => !v.trim() ? t("employees.addEmployee.errors.designationRequired", { defaultValue: "Designation is required" }) : "",
  salary:      (v, t) => !v ? t("employees.addEmployee.errors.salaryRequired", { defaultValue: "Salary is required" }) : Number(v) <= 0 ? t("employees.addEmployee.errors.salaryPositive", { defaultValue: "Salary must be greater than 0" }) : "",
};

const STEP_FIELDS = {
  1: ["name", "age", "sex", "email"],
  2: ["employeeId", "department", "designation"],
  3: ["salary"],
};

const ROLE_LABELS = {
  EMPLOYEE: "Employee",
  MANAGER: "HR / Manager",
  ADMIN: "Administrator",
};

function roleLabel(t, role) {
  return t(`employees.addEmployee.roleLabels.${role}`, { defaultValue: ROLE_LABELS[role] });
}

function deriveLoginEmail(email, employeeId, domain) {
  const supplied = (email || "").trim();
  if (supplied) return supplied.toLowerCase();
  const code = (employeeId || "").trim();
  if (!code) return "";
  return `${code.toLowerCase()}@${(domain || "hrms.com").toLowerCase()}`;
}

function validateField(name, value, t) {
  return RULES[name] ? RULES[name](value, t) : "";
}

function validateStep(stepId, data, t) {
  const errs = {};
  (STEP_FIELDS[stepId] || []).forEach((f) => {
    const e = validateField(f, data[f], t);
    if (e) errs[f] = e;
  });
  return errs;
}

/* Field = FormField alias for convenience inside this file */
const Field = FormField;

/* ─────────────────────────────────
   Stepper header
───────────────────────────────── */
function StepperHeader({ step, completedSteps, onJump }) {
  const { t } = useTranslation();
  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  return (
    <div style={{ marginBottom: "var(--sp-8)" }}>
      {/* Progress bar */}
      <div style={{ position: "relative", height: "4px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", marginBottom: "var(--sp-6)" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "4px",
          background: "var(--clr-primary-400)",
          borderRadius: "var(--radius-full)",
          width: `${pct}%`,
          transition: "width 0.45s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: "var(--sp-2)" }}>
        {STEPS.map((s) => {
          const done    = completedSteps.has(s.id) && s.id < step;
          const current = s.id === step;
          const canJump = done;
          return (
            <div
              key={s.id}
              onClick={() => canJump && onJump(s.id)}
              role={canJump ? "button" : undefined}
              tabIndex={canJump ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && canJump && onJump(s.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                cursor: canJump ? "pointer" : "default",
                opacity: !done && !current ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {/* Circle */}
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%",
                display: "grid", placeItems: "center",
                background: done ? "var(--clr-primary-400)" : current ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                border: `2px solid ${done ? "var(--clr-primary-400)" : current ? "var(--clr-primary-400)" : "var(--bdr-default)"}`,
                boxShadow: current ? "0 0 0 4px var(--bg-primary-subtle)" : "none",
                transition: "all 0.25s",
                color: done ? "white" : current ? "var(--clr-primary-400)" : "var(--txt-secondary)",
              }}>
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : s.icon}
              </div>

              {/* Label */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "var(--fs-xs)", lineHeight: 1.3,
                  fontWeight: current ? "var(--fw-semibold)" : "var(--fw-regular)",
                  color: current ? "var(--txt-primary-brand)" : done ? "var(--txt-primary)" : "var(--txt-secondary)",
                }}>{t(`employees.addEmployee.steps.${s.key}.label`, { defaultValue: s.label })}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-disabled)", marginTop: "1px" }}>{t(`employees.addEmployee.steps.${s.key}.desc`, { defaultValue: s.desc })}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────
   Review step
───────────────────────────────── */
function ReviewStep({ formData, onEdit, loginEmail }) {
  const { t } = useTranslation();
  const notFilled = t("employees.addEmployee.review.notFilled", { defaultValue: "Not filled" });
  const sections = [
    {
      title: t("employees.addEmployee.review.sectionPersonal", { defaultValue: "Personal" }), stepId: 1,
      rows: [
        { label: t("common.fieldLabels.fullName", { defaultValue: "Full Name" }),    value: formData.name },
        { label: t("common.fieldLabels.age", { defaultValue: "Age" }),          value: formData.age },
        { label: t("common.fieldLabels.gender", { defaultValue: "Gender" }),       value: formData.sex ? t(`common.gender.${formData.sex}`, { defaultValue: formData.sex }) : "" },
        { label: t("common.fieldLabels.email", { defaultValue: "Email" }),       value: formData.email },
        { label: t("common.fieldLabels.phone", { defaultValue: "Phone" }),        value: formData.phone },
        { label: t("common.fieldLabels.address", { defaultValue: "Address" }),      value: formData.address },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionJob", { defaultValue: "Job" }), stepId: 2,
      rows: [
        { label: t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" }),   value: formData.employeeId },
        { label: t("common.fieldLabels.department", { defaultValue: "Department" }),    value: formData.department },
        { label: t("common.fieldLabels.designation", { defaultValue: "Designation" }),   value: formData.designation },
        { label: t("common.fieldLabels.contractType", { defaultValue: "Contract Type" }), value: formData.type ? t(`common.contractType.${formData.type}`, { defaultValue: formData.type }) : "" },
        { label: t("common.fieldLabels.startDate", { defaultValue: "Start Date" }),    value: formData.startDate },
        { label: t("common.fieldLabels.status", { defaultValue: "Status" }),        value: formData.status ? t(`common.employeeStatus.${formData.status}`, { defaultValue: formData.status }) : "" },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionAccount", { defaultValue: "Account" }), stepId: 2,
      rows: [
        { label: t("employees.addEmployee.review.loginAccount", { defaultValue: "Login account" }), value: formData.createAccount ? t("employees.addEmployee.review.willBeCreated", { defaultValue: "Will be created" }) : t("employees.addEmployee.review.notCreated", { defaultValue: "Not created" }) },
        { label: t("employees.addEmployee.review.loginEmail", { defaultValue: "Login email" }),   value: formData.createAccount ? loginEmail : "" },
        { label: t("common.fieldLabels.role", { defaultValue: "Role" }),          value: formData.createAccount ? roleLabel(t, formData.accountRole) : "" },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionFinance", { defaultValue: "Finance" }), stepId: 3,
      rows: [
        { label: t("common.fieldLabels.annualSalary", { defaultValue: "Annual Salary" }), value: formData.salary ? `$${Number(formData.salary).toLocaleString("en-US")}` : "" },
        { label: t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }),       value: formData.salary ? `$${Math.round(formData.salary / 12).toLocaleString("en-US")}` : "" },
        { label: t("common.fieldLabels.notes", { defaultValue: "Notes" }),         value: formData.notes },
      ],
    },
  ];

  return (
    <div>
      {/* Profile card */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-4)",
        padding: "var(--sp-5)", marginBottom: "var(--sp-6)",
        background: "var(--bg-primary-subtle)",
        border: "2px solid var(--bdr-brand)", borderRadius: "var(--radius-lg)",
      }}>
        <Avatar name={formData.name || t("employees.addEmployee.review.newEmployee", { defaultValue: "New Employee" })} size="lg" status={formData.status === "Active" ? "active" : "leave"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            {formData.name || "—"}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "3px" }}>
            {[formData.designation, formData.department, formData.employeeId].filter(Boolean).join(" · ") || "—"}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            <StatusBadge status={formData.status} />
            <TypeBadge type={formData.type} />
            {formData.salary && (
              <span style={{
                fontSize: "var(--fs-xs)", padding: "3px 10px", borderRadius: "var(--radius-full)",
                background: "var(--bg-success-subtle)", color: "var(--txt-success)",
                border: "1px solid var(--bdr-success)",
              }}>
                ${Number(formData.salary).toLocaleString("en-US")}/yr
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
        {sections.map((sec) => (
          <div key={sec.title} style={{
            background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
            borderRadius: "var(--radius-md)", padding: "var(--sp-4)",
            gridColumn: sec.stepId === 3 ? "1 / -1" : undefined,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: "var(--sp-3)",
            }}>
              <span style={{
                fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--txt-secondary)",
              }}>{sec.title}</span>
              <button
                type="button"
                onClick={() => onEdit(sec.stepId)}
                style={{
                  fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px 6px", borderRadius: "var(--radius-sm)",
                  fontFamily: "inherit",
                }}
              >✏ {t("common.actions.edit", { defaultValue: "Edit" })}</button>
            </div>
            {sec.rows
              .filter((r) => sec.stepId === 3 ? r.label !== t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }) : true)
              .map((row) => (
                <div key={row.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "7px 0", borderBottom: "1px solid var(--bdr-subtle)",
                  gap: "var(--sp-4)",
                }}>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", flexShrink: 0 }}>{row.label}</span>
                  <span style={{
                    fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)",
                    color: row.value ? "var(--txt-primary)" : "var(--txt-disabled)",
                    fontStyle: row.value ? "normal" : "italic",
                    textAlign: "right",
                  }}>{row.value || notFilled}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "var(--sp-5)", padding: "var(--sp-4)",
        background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
        borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)", color: "var(--txt-info)",
        display: "flex", gap: "var(--sp-3)", alignItems: "flex-start",
      }}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>ℹ️</span>
        <span>
          {t("employees.addEmployee.review.infoBannerPrefix", { defaultValue: "Please review carefully before clicking" })}{" "}
          <strong>{t("employees.addEmployee.nav.createEmployee", { defaultValue: "Create Employee" })}</strong>
          {t("employees.addEmployee.review.infoBannerMiddle", { defaultValue: ". Click" })}{" "}
          <strong>✏ {t("common.actions.edit", { defaultValue: "Edit" })}</strong>
          {t("employees.addEmployee.review.infoBannerSuffix", { defaultValue: " on any section to go back and make changes." })}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────
   Success screen
───────────────────────────────── */
function CredentialRow({ label, value }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "var(--sp-3) 0", borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", width: "110px", flexShrink: 0, textAlign: "left" }}>
        {label}
      </span>
      <code style={{
        flex: 1, textAlign: "left", fontFamily: "monospace", fontSize: "var(--fs-md)",
        color: "var(--txt-primary)", wordBreak: "break-all",
      }}>{value}</code>
      <button
        type="button"
        onClick={copy}
        style={{
          flexShrink: 0, fontSize: "var(--fs-xs)", padding: "4px 10px",
          borderRadius: "var(--radius-sm)", cursor: "pointer",
          border: "1px solid var(--bdr-default)", background: "var(--bg-surface)",
          color: "var(--txt-primary)", fontFamily: "inherit",
        }}
      >{copied ? t("employees.addEmployee.successScreen.copied", { defaultValue: "Copied" }) : t("employees.addEmployee.successScreen.copy", { defaultValue: "Copy" })}</button>
    </div>
  );
}

function SuccessScreen({ name, account, onDone }) {
  const { t } = useTranslation();
  const hasCredentials = Boolean(account?.tempPassword);

  return (
    <div style={{ textAlign: "center", padding: "var(--sp-12) var(--sp-6)" }}>
      <div style={{
        width: "80px", height: "80px", borderRadius: "50%",
        background: "var(--bg-success-subtle)", border: "2px solid var(--bdr-success)",
        display: "grid", placeItems: "center", fontSize: "36px",
        margin: "0 auto var(--sp-5)",
      }}>🎉</div>
      <h3 style={{ fontSize: "var(--fs-3xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-2)" }}>
        {t("employees.addEmployee.successScreen.title", { defaultValue: "Added successfully!" })}
      </h3>
      <p style={{ fontSize: "var(--fs-md)", color: "var(--txt-secondary)" }}>
        <strong>{name}</strong> {t("employees.addEmployee.successScreen.addedToSystem", { defaultValue: "has been added to the system." })}
        {!hasCredentials && (
          <>
            <br />
            {t("employees.addEmployee.successScreen.redirecting", { defaultValue: "Redirecting to employee list..." })}
          </>
        )}
      </p>

      {account?.linked && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "var(--sp-3)" }}>
          {t("employees.addEmployee.successScreen.linkedToExisting", { defaultValue: "Linked to the existing account" })} <strong>{account.email}</strong>.
        </p>
      )}

      {hasCredentials && (
        <>
          <div style={{
            maxWidth: "460px", margin: "var(--sp-7) auto 0",
            padding: "var(--sp-5)", textAlign: "left",
            background: "var(--bg-surface-alt)", border: "1px solid var(--bdr-subtle)",
            borderRadius: "var(--radius-lg)",
          }}>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--txt-secondary)", marginBottom: "var(--sp-2)",
            }}>{t("employees.addEmployee.successScreen.loginDetailsTitle", { defaultValue: "Login details" })}</div>
            <CredentialRow label={t("common.fieldLabels.email", { defaultValue: "Email" })} value={account.email} />
            <CredentialRow label={t("employees.addEmployee.successScreen.tempPasswordLabel", { defaultValue: "Temp password" })} value={account.tempPassword} />
            <CredentialRow label={t("common.fieldLabels.role", { defaultValue: "Role" })} value={roleLabel(t, account.role) || account.role} />
          </div>

          <div style={{
            maxWidth: "460px", margin: "var(--sp-4) auto 0",
            padding: "var(--sp-4)", textAlign: "left",
            background: "var(--bg-warning-subtle, var(--bg-surface-alt))",
            border: "1px solid var(--bdr-warning, var(--bdr-subtle))",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-sm)", color: "var(--txt-warning, var(--txt-secondary))",
            display: "flex", gap: "var(--sp-3)", alignItems: "flex-start",
          }}>
            <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠️</span>
            <span>
              {t("employees.addEmployee.successScreen.passwordWarning", { defaultValue: "This password is shown once only and is not stored anywhere. Copy it now and hand it over securely. The employee must change it at first sign-in." })}
            </span>
          </div>

          <Button
            variant="primary"
            onClick={onDone}
            style={{ marginTop: "var(--sp-6)" }}
          >
            {t("employees.addEmployee.successScreen.doneButton", { defaultValue: "Done" })}
          </Button>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
function AddEmployee() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addEmployee, departments } = useStore();
  const { isAdmin, accountEmailDomain } = useAuth();

  const [step, setStep]             = useState(1);
  const [errors, setErrors]         = useState({});
  const [touched, setTouched]       = useState({});
  const [submitted, setSubmitted]   = useState(false);
  const [showToast, setShowToast]   = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const [form, setForm] = useState({
    name: "", email: "", phone: "", age: "", sex: "", address: "",
    employeeId: "", department: "", designation: "", type: "Full-time", status: "Active",
    salary: "", startDate: "", notes: "",
    createAccount: true, accountRole: "EMPLOYEE",
  });

  const loginEmail = deriveLoginEmail(form.email, form.employeeId, accountEmailDomain);
  const roleOptions = isAdmin ? ["EMPLOYEE", "MANAGER", "ADMIN"] : ["EMPLOYEE"];

  /* ── realtime: validate on change ── */
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value, t) }));
    }
  }, [touched, t]);

  /* ── validate on blur ── */
  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value, t) }));
  }, [t]);

  /* ── navigation ── */
  const goNext = () => {
    const stepErrors = validateStep(step, form, t);
    // Touch all fields in current step so errors show
    const stepTouched = {};
    (STEP_FIELDS[step] || []).forEach((f) => { stepTouched[f] = true; });
    setTouched((prev) => ({ ...prev, ...stepTouched }));
    setErrors((prev) => ({ ...prev, ...stepErrors }));

    if (Object.keys(stepErrors).length > 0) return;

    setCompletedSteps((prev) => new Set([...prev, step]));
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const jumpTo = (stepId) => {
    setStep(stepId);
  };

  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async () => {
    setSubmitError("");
    try {
      const res = await addEmployee({
        ...form,
        age: Number(form.age),
        salary: Number(form.salary),
        createdAt: new Date().toISOString().split("T")[0],
      });
      setCreatedAccount(res?.account || null);
      setSubmitted(true);
      setShowToast(true);
      if (!res?.account?.tempPassword) {
        setTimeout(() => navigate("/employees"), 2500);
      }
    } catch (err) {
      setSubmitError(translateApiError(err, t) || t("employees.addEmployee.submitFailed", { defaultValue: "Failed to create employee." }));
    }
  };

  /* ── field state helpers ── */
  const inputStyle = (field) => ({
    width: "100%", padding: "10px var(--sp-4)",
    border: `1px solid ${
      errors[field] && touched[field] ? "var(--bdr-danger)"
      : !errors[field] && touched[field] && RULES[field] ? "var(--bdr-success)"
      : "var(--bdr-default)"
    }`,
    borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
    color: "var(--txt-primary)", fontFamily: "var(--font-family)",
    fontSize: "var(--fs-md)", outline: "none", transition: "border-color 0.15s",
    boxShadow: errors[field] && touched[field] ? "0 0 0 3px rgba(163,61,61,.15)" : "none",
  });

  const fieldProps = (name) => ({
    name,
    value: form[name],
    onChange: handleChange,
    onBlur: handleBlur,
    style: inputStyle(name),
  });

  /* ── step completion % ── */
  const stepPct = (stepId) => {
    const fields = STEP_FIELDS[stepId] || [];
    if (!fields.length) return 100;
    const valid = fields.filter((f) => !validateField(f, form[f], t)).length;
    return Math.round((valid / fields.length) * 100);
  };

  const currentStepDesc = t(`employees.addEmployee.steps.${STEPS[step - 1]?.key}.desc`, { defaultValue: STEPS[step - 1]?.desc });

  return (
    <div style={{ maxWidth: "740px", margin: "0 auto" }}>
      <div className="content-card">

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginBottom: "var(--sp-7)" }}>
          <button
            type="button" onClick={() => navigate("/employees")}
            style={{ background: "none", border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--txt-secondary)", lineHeight: 1, padding: "8px 10px", display: "inline-flex", alignItems: "center", transition: "all 0.15s" }}
            aria-label={t("employees.addEmployee.goBackAria", { defaultValue: "Go back" })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
              {t("employees.addEmployee.header.title", { defaultValue: "Add New Employee" })}
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {t("employees.addEmployee.header.stepProgress", { defaultValue: "Step {{step}}/{{total}} · {{desc}}", step, total: STEPS.length, desc: currentStepDesc })}
            </p>
          </div>
          {/* Step completion mini indicator */}
          {step < 4 && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginBottom: "4px" }}>
                {t("employees.addEmployee.header.stepCompletion", { defaultValue: "Step completion" })}
              </div>
              <div style={{ width: "80px", height: "4px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)" }}>
                <div style={{
                  height: "4px", borderRadius: "var(--radius-full)",
                  background: stepPct(step) === 100 ? "var(--clr-success-500)" : "var(--clr-primary-400)",
                  width: `${stepPct(step)}%`, transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>
                {stepPct(step)}%
              </div>
            </div>
          )}
        </div>

        {/* ── Stepper ── */}
        <StepperHeader step={step} completedSteps={completedSteps} onJump={jumpTo} />

        {/* ── Form area ── */}
        <div style={{
          background: "var(--bg-surface-alt)", borderRadius: "var(--radius-lg)",
          padding: "var(--sp-7)", border: "1px solid var(--bdr-subtle)",
          marginBottom: "var(--sp-6)", minHeight: "340px",
        }}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div>
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.personal}</span>
                {t("employees.addEmployee.step1.heading", { defaultValue: "Personal Information" })}
              </h3>
              <div className="form-grid">
                <Field label={t("common.fieldLabels.fullName", { defaultValue: "Full Name" })} required error={errors.name} touched={touched.name} success={!errors.name && !!form.name}>
                  <input {...fieldProps("name")} placeholder={t("employees.addEmployee.step1.fullNamePlaceholder", { defaultValue: "John Smith" })} />
                </Field>

                <Field label={t("common.fieldLabels.age", { defaultValue: "Age" })} required error={errors.age} touched={touched.age} success={!errors.age && !!form.age}>
                  <input {...fieldProps("age")} type="number" placeholder={t("employees.addEmployee.step1.agePlaceholder", { defaultValue: "25" })} min="18" max="80" />
                </Field>

                <Field label={t("common.fieldLabels.gender", { defaultValue: "Gender" })} required error={errors.sex} touched={touched.sex} success={!errors.sex && !!form.sex}>
                  <select {...fieldProps("sex")}>
                    <option value="">{t("employees.addEmployee.step1.genderSelectPlaceholder", { defaultValue: "Select..." })}</option>
                    <option value="Male">{t("common.gender.Male", { defaultValue: "Male" })}</option>
                    <option value="Female">{t("common.gender.Female", { defaultValue: "Female" })}</option>
                    <option value="Other">{t("common.gender.Other", { defaultValue: "Other" })}</option>
                  </select>
                </Field>

                <Field label={t("employees.addEmployee.step1.phoneNumberLabel", { defaultValue: "Phone Number" })}>
                  <input
                    name="phone" value={form.phone} onChange={handleChange}
                    style={inputStyle("phone")} type="tel" placeholder={t("employees.addEmployee.step1.phonePlaceholder", { defaultValue: "+1 555 123 4567" })}
                  />
                </Field>

                <Field label={t("common.fieldLabels.email", { defaultValue: "Email" })} error={errors.email} touched={touched.email} success={!errors.email && !!form.email} hint={t("employees.addEmployee.step1.emailHint", { defaultValue: "Used for system login" })}>
                  <input {...fieldProps("email")} type="email" placeholder={t("employees.addEmployee.step1.emailPlaceholder", { defaultValue: "john.smith@company.com" })} />
                </Field>

                <Field label={t("common.fieldLabels.address", { defaultValue: "Address" })}>
                  <input
                    name="address" value={form.address} onChange={handleChange}
                    style={inputStyle("address")} placeholder={t("common.placeholders.streetCityStateZip", { defaultValue: "Street, City, State, ZIP" })}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.job}</span>
                {t("employees.addEmployee.step2.heading", { defaultValue: "Job Information" })}
              </h3>
              <div className="form-grid">
                <Field label={t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" })} required error={errors.employeeId} touched={touched.employeeId} success={!errors.employeeId && !!form.employeeId} hint={t("employees.addEmployee.step2.employeeIdHint", { defaultValue: "Format: EMP001" })}>
                  <input {...fieldProps("employeeId")} placeholder={t("employees.addEmployee.step2.employeeIdPlaceholder", { defaultValue: "EMP009" })} />
                </Field>

                <Field label={t("common.fieldLabels.startDate", { defaultValue: "Start Date" })}>
                  <input
                    name="startDate" value={form.startDate} onChange={handleChange}
                    style={inputStyle("startDate")} type="date"
                  />
                </Field>

                <Field label={t("common.fieldLabels.department", { defaultValue: "Department" })} required error={errors.department} touched={touched.department} success={!errors.department && !!form.department}>
                  <select {...fieldProps("department")}>
                    <option value="">{t("employees.addEmployee.step2.departmentSelectPlaceholder", { defaultValue: "Select department..." })}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("common.fieldLabels.designation", { defaultValue: "Designation" })} required error={errors.designation} touched={touched.designation} success={!errors.designation && !!form.designation}>
                  <input {...fieldProps("designation")} placeholder={t("employees.addEmployee.step2.designationPlaceholder", { defaultValue: "Frontend Developer" })} />
                </Field>

                <Field label={t("common.fieldLabels.contractType", { defaultValue: "Contract Type" })}>
                  <select name="type" value={form.type} onChange={handleChange} style={inputStyle("type")}>
                    <option value="Full-time">{t("common.contractType.Full-time", { defaultValue: "Full-time" })}</option>
                    <option value="Part-time">{t("common.contractType.Part-time", { defaultValue: "Part-time" })}</option>
                    <option value="Contract">{t("common.contractType.Contract", { defaultValue: "Contract" })}</option>
                    <option value="Intern">{t("common.contractType.Intern", { defaultValue: "Intern" })}</option>
                  </select>
                </Field>

                <Field label={t("employees.addEmployee.step2.initialStatusLabel", { defaultValue: "Initial Status" })}>
                  <select name="status" value={form.status} onChange={handleChange} style={inputStyle("status")}>
                    <option value="Active">{t("common.employeeStatus.Active", { defaultValue: "Active" })}</option>
                    <option value="On Leave">{t("common.employeeStatus.On Leave", { defaultValue: "On Leave" })}</option>
                  </select>
                </Field>
              </div>

              <div style={{
                marginTop: "var(--sp-6)", padding: "var(--sp-5)",
                background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
                borderRadius: "var(--radius-md)",
              }}>
                <div style={{
                  fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: "var(--txt-secondary)", marginBottom: "var(--sp-4)",
                }}>{t("employees.addEmployee.step2.accountAccessTitle", { defaultValue: "Account access" })}</div>

                <label style={{
                  display: "flex", alignItems: "flex-start", gap: "var(--sp-3)",
                  cursor: "pointer", marginBottom: form.createAccount ? "var(--sp-5)" : 0,
                }}>
                  <input
                    type="checkbox"
                    name="createAccount"
                    checked={form.createAccount}
                    onChange={(e) => setForm((prev) => ({ ...prev, createAccount: e.target.checked }))}
                    style={{ marginTop: "3px", flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ fontSize: "var(--fs-md)", color: "var(--txt-primary)", fontWeight: "var(--fw-medium)" }}>
                      {t("employees.addEmployee.step2.createAccountLabel", { defaultValue: "Create a login account" })}
                    </span>
                    <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                      {t("employees.addEmployee.step2.createAccountHint", { defaultValue: "A temporary password is generated and shown once after saving. The employee must change it at first sign-in." })}
                    </span>
                  </span>
                </label>

                {form.createAccount && (
                  <div className="form-grid">
                    <Field label={t("common.fieldLabels.role", { defaultValue: "Role" })} hint={isAdmin ? undefined : t("employees.addEmployee.step2.roleHintRestricted", { defaultValue: "Only an Administrator can create HR or Admin accounts" })}>
                      <select
                        name="accountRole"
                        value={form.accountRole}
                        onChange={handleChange}
                        style={inputStyle("accountRole")}
                        disabled={roleOptions.length === 1}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{roleLabel(t, role)}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label={t("employees.addEmployee.step2.loginEmailLabel", { defaultValue: "Login email" })} hint={form.email ? t("employees.addEmployee.step2.loginEmailHintFromPersonal", { defaultValue: "Taken from the Personal step" }) : t("employees.addEmployee.step2.loginEmailHintDerived", { defaultValue: "Derived from the Employee ID" })}>
                      <input
                        value={loginEmail}
                        readOnly
                        placeholder={t("employees.addEmployee.step2.loginEmailPlaceholder", { defaultValue: "Enter an Employee ID or email" })}
                        style={{ ...inputStyle("loginEmail"), background: "var(--bg-surface-alt)", cursor: "default" }}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.finance}</span>
                {t("employees.addEmployee.step3.heading", { defaultValue: "Finance Information" })}
              </h3>
              <div className="form-grid">
                <Field label={t("employees.addEmployee.step3.annualSalaryLabel", { defaultValue: "Annual Salary (USD)" })} required error={errors.salary} touched={touched.salary} success={!errors.salary && !!form.salary} hint={t("employees.addEmployee.step3.salaryHint", { defaultValue: "Gross salary, before tax" })}>
                  <input {...fieldProps("salary")} type="number" placeholder={t("employees.addEmployee.step3.salaryPlaceholder", { defaultValue: "60000" })} min="0" step="1000" />
                </Field>
                <div />
              </div>

              {/* Salary preview */}
              {Number(form.salary) > 0 && (
                <div style={{
                  marginTop: "var(--sp-5)", padding: "var(--sp-5)",
                  background: "var(--bg-primary-subtle)", border: "1px solid var(--bdr-brand)",
                  borderRadius: "var(--radius-md)",
                }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-4)" }}>
                    {t("employees.addEmployee.step3.breakdownTitle", { defaultValue: "Salary Breakdown" })}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-3)", textAlign: "center" }}>
                    {[
                      { label: t("employees.addEmployee.step3.annual", { defaultValue: "Annual" }),   value: `$${Number(form.salary).toLocaleString("en-US")}` },
                      { label: t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }),  value: `$${Math.round(form.salary / 12).toLocaleString("en-US")}` },
                      { label: t("employees.addEmployee.step3.weekly", { defaultValue: "Weekly" }),   value: `$${Math.round(form.salary / 52).toLocaleString("en-US")}` },
                    ].map((item) => (
                      <div key={item.label} style={{
                        padding: "var(--sp-3)", background: "var(--bg-surface)",
                        borderRadius: "var(--radius-md)", border: "1px solid var(--bdr-subtle)",
                      }}>
                        <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary-brand)" }}>{item.value}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: "var(--sp-5)" }}>
                <Field label={t("common.fieldLabels.notes", { defaultValue: "Notes" })}>
                  <textarea
                    name="notes" value={form.notes} onChange={handleChange}
                    style={{ ...inputStyle("notes"), resize: "vertical" }} rows={3}
                    placeholder={t("employees.addEmployee.step3.notesPlaceholder", { defaultValue: "Additional information about the employee..." })}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 4: Review ── */}
          {step === 4 && !submitted && (
            <ReviewStep formData={form} onEdit={jumpTo} loginEmail={loginEmail} />
          )}

          {/* ── Success ── */}
          {submitted && (
            <SuccessScreen
              name={form.name}
              account={createdAccount}
              onDone={() => navigate("/employees")}
            />
          )}
        </div>

        {/* ── Submit error ── */}
        {submitError && !submitted && (
          <div className="form-error" style={{ marginBottom: "var(--sp-4)" }}>
            {submitError}
          </div>
        )}

        {/* ── Navigation ── */}
        {!submitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Button
              variant="secondary"
              onClick={step === 1 ? () => navigate("/employees") : goBack}
              leftIcon={step === 1 ? undefined : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              )}
            >
              {step === 1 ? t("common.actions.cancel", { defaultValue: "Cancel" }) : t("common.actions.back", { defaultValue: "Back" })}
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
              {/* Dot indicator */}
              <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                {STEPS.map((s) => (
                  <div key={s.id} style={{
                    height: "6px",
                    width: s.id === step ? "18px" : "6px",
                    borderRadius: "var(--radius-full)",
                    background: completedSteps.has(s.id) || s.id === step
                      ? "var(--clr-primary-400)" : "var(--bg-surface-sub)",
                    transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
                  }} />
                ))}
              </div>

              {step < STEPS.length ? (
                <Button
                  variant="primary"
                  onClick={goNext}
                  rightIcon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  }
                >
                  {t("employees.addEmployee.nav.next", { defaultValue: "Next" })}
                </Button>
              ) : (
                <Button
                  variant="success"
                  onClick={handleSubmit}
                  leftIcon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  }
                >
                  {t("employees.addEmployee.nav.createEmployee", { defaultValue: "Create Employee" })}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {showToast && (
          <div className="toast toast-success" role="alert">
            <span className="toast-icon" style={{ display: "inline-flex", color: "var(--txt-success)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="toast-message">{t("employees.addEmployee.toastSuccess", { defaultValue: "Employee added successfully!" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddEmployee;
