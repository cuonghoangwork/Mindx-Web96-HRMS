import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import FormField from "../components/FormField";
import Button from "../components/Button";

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
  { id: 1, label: "Personal",  icon: StepIcons.personal, desc: "Basic information" },
  { id: 2, label: "Job",       icon: StepIcons.job,      desc: "Position & contract" },
  { id: 3, label: "Finance",   icon: StepIcons.finance,  desc: "Salary & benefits" },
  { id: 4, label: "Review",    icon: StepIcons.review,   desc: "Check & save" },
];

/* ─────────────────────────────────
   Validation rules
───────────────────────────────── */
const RULES = {
  name:        (v) => !v.trim() ? "Full name is required" : v.trim().length < 2 ? "Name is too short" : "",
  age:         (v) => !v ? "Age is required" : (Number(v) < 18 || Number(v) > 80) ? "Age must be 18–80" : "",
  sex:         (v) => !v ? "Please select a gender" : "",
  email:       (v) => v && !/\S+@\S+\.\S+/.test(v) ? "Invalid email address" : "",
  employeeId:  (v) => !v.trim() ? "Employee ID is required" : !/^[A-Z]{2,4}\d{2,6}$/i.test(v.trim()) ? "Format: EMP001" : "",
  department:  (v) => !v ? "Please select a department" : "",
  designation: (v) => !v.trim() ? "Designation is required" : "",
  salary:      (v) => !v ? "Salary is required" : Number(v) <= 0 ? "Salary must be greater than 0" : "",
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

function deriveLoginEmail(email, employeeId, domain) {
  const supplied = (email || "").trim();
  if (supplied) return supplied.toLowerCase();
  const code = (employeeId || "").trim();
  if (!code) return "";
  return `${code.toLowerCase()}@${(domain || "hrms.com").toLowerCase()}`;
}

function validateField(name, value) {
  return RULES[name] ? RULES[name](value) : "";
}

function validateStep(stepId, data) {
  const errs = {};
  (STEP_FIELDS[stepId] || []).forEach((f) => {
    const e = validateField(f, data[f]);
    if (e) errs[f] = e;
  });
  return errs;
}

function isStepComplete(stepId, data) {
  return Object.keys(validateStep(stepId, data)).length === 0;
}

/* Field = FormField alias for convenience inside this file */
const Field = FormField;

/* ─────────────────────────────────
   Stepper header
───────────────────────────────── */
function StepperHeader({ step, completedSteps, onJump }) {
  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  return (
    <div style={{ marginBottom: "var(--sp-8)" }}>
      {/* Progress bar */}
      <div style={{ position: "relative", height: "4px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", marginBottom: "var(--sp-6)" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "4px",
          background: "linear-gradient(90deg, var(--clr-primary-400), var(--clr-primary-300))",
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
                }}>{s.label}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-disabled)", marginTop: "1px" }}>{s.desc}</div>
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
  const sections = [
    {
      title: "Personal", stepId: 1,
      rows: [
        { label: "Full Name",    value: formData.name },
        { label: "Age",          value: formData.age },
        { label: "Gender",       value: formData.sex },
        { label: "Email",       value: formData.email },
        { label: "Phone",        value: formData.phone },
        { label: "Address",      value: formData.address },
      ],
    },
    {
      title: "Job", stepId: 2,
      rows: [
        { label: "Employee ID",   value: formData.employeeId },
        { label: "Department",    value: formData.department },
        { label: "Designation",   value: formData.designation },
        { label: "Contract Type", value: formData.type },
        { label: "Start Date",    value: formData.startDate },
        { label: "Status",        value: formData.status },
      ],
    },
    {
      title: "Account", stepId: 2,
      rows: [
        { label: "Login account", value: formData.createAccount ? "Will be created" : "Not created" },
        { label: "Login email",   value: formData.createAccount ? loginEmail : "" },
        { label: "Role",          value: formData.createAccount ? ROLE_LABELS[formData.accountRole] : "" },
      ],
    },
    {
      title: "Finance", stepId: 3,
      rows: [
        { label: "Annual Salary", value: formData.salary ? `$${Number(formData.salary).toLocaleString("en-US")}` : "" },
        { label: "Monthly",       value: formData.salary ? `$${Math.round(formData.salary / 12).toLocaleString("en-US")}` : "" },
        { label: "Notes",         value: formData.notes },
      ],
    },
  ];

  return (
    <div>
      {/* Profile card */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-4)",
        padding: "var(--sp-5)", marginBottom: "var(--sp-6)",
        background: "linear-gradient(135deg, var(--bg-primary-subtle), var(--bg-surface))",
        border: "1px solid var(--bdr-brand)", borderRadius: "var(--radius-lg)",
      }}>
        <Avatar name={formData.name || "New Employee"} size="lg" status={formData.status === "Active" ? "active" : "leave"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            {formData.name || "—"}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "3px" }}>
            {[formData.designation, formData.department, formData.employeeId].filter(Boolean).join(" · ") || "—"}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            <StatusBadge status={formData.status} dot />
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
              >✏ Edit</button>
            </div>
            {sec.rows
              .filter((r) => sec.stepId === 3 ? r.label !== "Monthly" : true)
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
                  }}>{row.value || "Not filled"}</span>
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
        <span>Please review carefully before clicking <strong>Create Employee</strong>. Click <strong>✏ Edit</strong> on any section to go back and make changes.</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────
   Success screen
───────────────────────────────── */
function CredentialRow({ label, value }) {
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
      >{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

function SuccessScreen({ name, account, onDone }) {
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
        Added successfully!
      </h3>
      <p style={{ fontSize: "var(--fs-md)", color: "var(--txt-secondary)" }}>
        <strong>{name}</strong> has been added to the system.
        {!hasCredentials && (
          <>
            <br />
            Redirecting to employee list...
          </>
        )}
      </p>

      {account?.linked && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "var(--sp-3)" }}>
          Linked to the existing account <strong>{account.email}</strong>.
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
            }}>Login details</div>
            <CredentialRow label="Email" value={account.email} />
            <CredentialRow label="Temp password" value={account.tempPassword} />
            <CredentialRow label="Role" value={ROLE_LABELS[account.role] || account.role} />
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
              This password is shown <strong>once only</strong> and is not stored anywhere.
              Copy it now and hand it over securely. The employee must change it at first sign-in.
            </span>
          </div>

          <Button
            variant="primary"
            onClick={onDone}
            style={{ marginTop: "var(--sp-6)" }}
          >
            Done
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
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    }
  }, [touched]);

  /* ── validate on blur ── */
  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  }, []);

  /* ── navigation ── */
  const goNext = () => {
    const stepErrors = validateStep(step, form);
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
      setSubmitError(err.message || "Failed to create employee.");
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
    boxShadow: errors[field] && touched[field] ? "0 0 0 3px rgba(239,68,68,.12)" : "none",
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
    const valid = fields.filter((f) => !validateField(f, form[f])).length;
    return Math.round((valid / fields.length) * 100);
  };

  return (
    <div style={{ maxWidth: "740px", margin: "0 auto" }}>
      <div className="content-card">

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginBottom: "var(--sp-7)" }}>
          <button
            type="button" onClick={() => navigate("/employees")}
            style={{ background: "none", border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1, padding: "6px 10px", transition: "all 0.15s" }}
            aria-label="Go back"
          >←</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
              Add New Employee
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              Step {step}/{STEPS.length} · {STEPS[step - 1]?.desc}
            </p>
          </div>
          {/* Step completion mini indicator */}
          {step < 4 && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginBottom: "4px" }}>
                Step completion
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
                Personal Information
              </h3>
              <div className="form-grid">
                <Field label="Full Name" required error={errors.name} touched={touched.name} success={!errors.name && !!form.name}>
                  <input {...fieldProps("name")} placeholder="John Smith" />
                </Field>

                <Field label="Age" required error={errors.age} touched={touched.age} success={!errors.age && !!form.age}>
                  <input {...fieldProps("age")} type="number" placeholder="25" min="18" max="80" />
                </Field>

                <Field label="Gender" required error={errors.sex} touched={touched.sex} success={!errors.sex && !!form.sex}>
                  <select {...fieldProps("sex")}>
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>

                <Field label="Phone Number">
                  <input
                    name="phone" value={form.phone} onChange={handleChange}
                    style={inputStyle("phone")} type="tel" placeholder="+1 555 123 4567"
                  />
                </Field>

                <Field label="Email" error={errors.email} touched={touched.email} success={!errors.email && !!form.email} hint="Used for system login">
                  <input {...fieldProps("email")} type="email" placeholder="john.smith@company.com" />
                </Field>

                <Field label="Address">
                  <input
                    name="address" value={form.address} onChange={handleChange}
                    style={inputStyle("address")} placeholder="Street, City, State, ZIP"
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
                Job Information
              </h3>
              <div className="form-grid">
                <Field label="Employee ID" required error={errors.employeeId} touched={touched.employeeId} success={!errors.employeeId && !!form.employeeId} hint="Format: EMP001">
                  <input {...fieldProps("employeeId")} placeholder="EMP009" />
                </Field>

                <Field label="Start Date">
                  <input
                    name="startDate" value={form.startDate} onChange={handleChange}
                    style={inputStyle("startDate")} type="date"
                  />
                </Field>

                <Field label="Department" required error={errors.department} touched={touched.department} success={!errors.department && !!form.department}>
                  <select {...fieldProps("department")}>
                    <option value="">Select department...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Designation" required error={errors.designation} touched={touched.designation} success={!errors.designation && !!form.designation}>
                  <input {...fieldProps("designation")} placeholder="Frontend Developer" />
                </Field>

                <Field label="Contract Type">
                  <select name="type" value={form.type} onChange={handleChange} style={inputStyle("type")}>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </Field>

                <Field label="Initial Status">
                  <select name="status" value={form.status} onChange={handleChange} style={inputStyle("status")}>
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
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
                }}>Account access</div>

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
                      Create a login account
                    </span>
                    <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                      A temporary password is generated and shown once after saving. The employee must change it at first sign-in.
                    </span>
                  </span>
                </label>

                {form.createAccount && (
                  <div className="form-grid">
                    <Field label="Role" hint={isAdmin ? undefined : "Only an Administrator can create HR or Admin accounts"}>
                      <select
                        name="accountRole"
                        value={form.accountRole}
                        onChange={handleChange}
                        style={inputStyle("accountRole")}
                        disabled={roleOptions.length === 1}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Login email" hint={form.email ? "Taken from the Personal step" : "Derived from the Employee ID"}>
                      <input
                        value={loginEmail}
                        readOnly
                        placeholder="Enter an Employee ID or email"
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
                Finance Information
              </h3>
              <div className="form-grid">
                <Field label="Annual Salary (USD)" required error={errors.salary} touched={touched.salary} success={!errors.salary && !!form.salary} hint="Gross salary, before tax">
                  <input {...fieldProps("salary")} type="number" placeholder="60000" min="0" step="1000" />
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
                    Salary Breakdown
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-3)", textAlign: "center" }}>
                    {[
                      { label: "Annual",   value: `$${Number(form.salary).toLocaleString("en-US")}` },
                      { label: "Monthly",  value: `$${Math.round(form.salary / 12).toLocaleString("en-US")}` },
                      { label: "Weekly",   value: `$${Math.round(form.salary / 52).toLocaleString("en-US")}` },
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
                <Field label="Notes">
                  <textarea
                    name="notes" value={form.notes} onChange={handleChange}
                    style={{ ...inputStyle("notes"), resize: "vertical" }} rows={3}
                    placeholder="Additional information about the employee..."
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
            >
              {step === 1 ? "Cancel" : "← Back"}
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
                <Button variant="primary" onClick={goNext}>
                  Next →
                </Button>
              ) : (
                <Button variant="success" onClick={handleSubmit}>
                  ✓ Create Employee
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {showToast && (
          <div className="toast toast-success" role="alert">
            <span className="toast-icon">✓</span>
            <span className="toast-message">Employee added successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddEmployee;
