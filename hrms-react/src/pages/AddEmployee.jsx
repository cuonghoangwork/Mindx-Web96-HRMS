import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { translateApiError } from "../utils/apiError";
import { STEPS } from './add-employee/stepIcons'
import { validateStep, validateField, RULES, STEP_FIELDS, deriveLoginEmail } from './add-employee/formRules'
import { StepperHeader } from './add-employee/StepperHeader'
import { PersonalStep } from './add-employee/PersonalStep'
import { JobStep } from './add-employee/JobStep'
import { FinanceStep } from './add-employee/FinanceStep'
import { ReviewStep } from './add-employee/ReviewStep'
import { SuccessScreen } from './add-employee/SuccessScreen'

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
            <PersonalStep
              form={form}
              errors={errors}
              touched={touched}
              fieldProps={fieldProps}
              handleChange={handleChange}
              inputStyle={inputStyle}
            />
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <JobStep
              form={form}
              setForm={setForm}
              errors={errors}
              touched={touched}
              fieldProps={fieldProps}
              handleChange={handleChange}
              inputStyle={inputStyle}
              departments={departments}
              isAdmin={isAdmin}
              roleOptions={roleOptions}
              loginEmail={loginEmail}
            />
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <FinanceStep
              form={form}
              errors={errors}
              touched={touched}
              fieldProps={fieldProps}
              handleChange={handleChange}
              inputStyle={inputStyle}
            />
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
