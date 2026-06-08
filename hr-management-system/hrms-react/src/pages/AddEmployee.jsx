import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";

/* ─────────────────────────────────
   Step config
───────────────────────────────── */
const STEPS = [
  { id: 1, label: "Cá nhân",   icon: "👤", desc: "Thông tin cơ bản" },
  { id: 2, label: "Công việc", icon: "💼", desc: "Vị trí & hợp đồng" },
  { id: 3, label: "Tài chính", icon: "💰", desc: "Lương & phúc lợi" },
  { id: 4, label: "Xác nhận",  icon: "✅", desc: "Kiểm tra & lưu" },
];

/* ─────────────────────────────────
   Validation rules
───────────────────────────────── */
const RULES = {
  name:        (v) => !v.trim() ? "Họ tên là bắt buộc" : v.trim().length < 2 ? "Tên quá ngắn" : "",
  age:         (v) => !v ? "Tuổi là bắt buộc" : (Number(v) < 18 || Number(v) > 80) ? "Tuổi phải từ 18–80" : "",
  sex:         (v) => !v ? "Vui lòng chọn giới tính" : "",
  email:       (v) => v && !/\S+@\S+\.\S+/.test(v) ? "Email không hợp lệ" : "",
  employeeId:  (v) => !v.trim() ? "Mã nhân viên là bắt buộc" : !/^[A-Z]{2,4}\d{2,6}$/i.test(v.trim()) ? "Định dạng: EMP001" : "",
  department:  (v) => !v ? "Vui lòng chọn phòng ban" : "",
  designation: (v) => !v.trim() ? "Chức danh là bắt buộc" : "",
  salary:      (v) => !v ? "Lương là bắt buộc" : Number(v) <= 0 ? "Lương phải lớn hơn 0" : "",
};

const STEP_FIELDS = {
  1: ["name", "age", "sex", "email"],
  2: ["employeeId", "department", "designation"],
  3: ["salary"],
};

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

/* ─────────────────────────────────
   Field component — realtime validation
───────────────────────────────── */
function Field({ label, required, error, touched, hint, success, children }) {
  const showError   = error && touched;
  const showSuccess = success && touched && !error;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
        {label}
        {required && <span style={{ color: "var(--txt-danger)", marginLeft: "2px" }}>*</span>}
      </label>
      {hint && <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "-2px" }}>{hint}</span>}
      {children}
      {showError && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-danger)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span aria-hidden="true">⚠</span>{error}
        </span>
      )}
      {showSuccess && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-success)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span aria-hidden="true">✓</span> Hợp lệ
        </span>
      )}
    </div>
  );
}

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
                fontSize: done ? "18px" : "20px",
                background: done ? "var(--clr-primary-400)" : current ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                border: `2px solid ${done ? "var(--clr-primary-400)" : current ? "var(--clr-primary-400)" : "var(--bdr-default)"}`,
                boxShadow: current ? "0 0 0 4px var(--bg-primary-subtle)" : "none",
                transition: "all 0.25s",
                color: done ? "white" : "inherit",
              }}>
                {done ? "✓" : s.icon}
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
function ReviewStep({ formData, onEdit }) {
  const sections = [
    {
      title: "Cá nhân", stepId: 1,
      rows: [
        { label: "Họ và tên",   value: formData.name },
        { label: "Tuổi",        value: formData.age },
        { label: "Giới tính",   value: formData.sex },
        { label: "Email",       value: formData.email },
        { label: "Điện thoại",  value: formData.phone },
        { label: "Địa chỉ",    value: formData.address },
      ],
    },
    {
      title: "Công việc", stepId: 2,
      rows: [
        { label: "Mã nhân viên",  value: formData.employeeId },
        { label: "Phòng ban",     value: formData.department },
        { label: "Chức danh",     value: formData.designation },
        { label: "Loại HĐ",      value: formData.type },
        { label: "Ngày bắt đầu", value: formData.startDate },
        { label: "Trạng thái",   value: formData.status },
      ],
    },
    {
      title: "Tài chính", stepId: 3,
      rows: [
        { label: "Lương/năm",   value: formData.salary ? `$${Number(formData.salary).toLocaleString()}` : "" },
        { label: "Lương/tháng", value: formData.salary ? `$${Math.round(formData.salary / 12).toLocaleString()}` : "" },
        { label: "Ghi chú",    value: formData.notes },
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
                ${Number(formData.salary).toLocaleString()}/năm
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
              >✏ Sửa</button>
            </div>
            {sec.rows
              .filter((r) => sec.stepId === 3 ? r.label !== "Lương/tháng" : true)
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
                  }}>{row.value || "Chưa điền"}</span>
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
        <span>Kiểm tra kỹ trước khi bấm <strong>Tạo nhân viên</strong>. Bấm <strong>✏ Sửa</strong> trên từng mục để quay lại chỉnh sửa.</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────
   Success screen
───────────────────────────────── */
function SuccessScreen({ name }) {
  return (
    <div style={{ textAlign: "center", padding: "var(--sp-12) var(--sp-6)" }}>
      <div style={{
        width: "80px", height: "80px", borderRadius: "50%",
        background: "var(--bg-success-subtle)", border: "2px solid var(--bdr-success)",
        display: "grid", placeItems: "center", fontSize: "36px",
        margin: "0 auto var(--sp-5)",
      }}>🎉</div>
      <h3 style={{ fontSize: "var(--fs-3xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-2)" }}>
        Thêm thành công!
      </h3>
      <p style={{ fontSize: "var(--fs-md)", color: "var(--txt-secondary)" }}>
        <strong>{name}</strong> đã được thêm vào hệ thống.<br />
        Đang chuyển về danh sách nhân viên...
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
function AddEmployee() {
  const navigate = useNavigate();
  const { addEmployee, departments } = useStore();

  const [step, setStep]             = useState(1);
  const [errors, setErrors]         = useState({});
  const [touched, setTouched]       = useState({});
  const [submitted, setSubmitted]   = useState(false);
  const [showToast, setShowToast]   = useState(false);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const [form, setForm] = useState({
    name: "", email: "", phone: "", age: "", sex: "", address: "",
    employeeId: "", department: "", designation: "", type: "Full-time", status: "Active",
    salary: "", startDate: "", notes: "",
  });

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

  const handleSubmit = () => {
    addEmployee({
      ...form,
      age: Number(form.age),
      salary: Number(form.salary),
      createdAt: new Date().toISOString().split("T")[0],
    });
    setSubmitted(true);
    setShowToast(true);
    setTimeout(() => navigate("/employees"), 2500);
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
            aria-label="Quay lại"
          >←</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
              Thêm nhân viên mới
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              Bước {step}/{STEPS.length} · {STEPS[step - 1]?.desc}
            </p>
          </div>
          {/* Step completion mini indicator */}
          {step < 4 && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginBottom: "4px" }}>
                Hoàn thành bước này
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
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
                👤 Thông tin cá nhân
              </h3>
              <div className="form-grid">
                <Field label="Họ và tên" required error={errors.name} touched={touched.name} success={!errors.name && !!form.name}>
                  <input {...fieldProps("name")} placeholder="Nguyễn Văn A" />
                </Field>

                <Field label="Tuổi" required error={errors.age} touched={touched.age} success={!errors.age && !!form.age}>
                  <input {...fieldProps("age")} type="number" placeholder="25" min="18" max="80" />
                </Field>

                <Field label="Giới tính" required error={errors.sex} touched={touched.sex} success={!errors.sex && !!form.sex}>
                  <select {...fieldProps("sex")}>
                    <option value="">Chọn...</option>
                    <option value="Male">Nam</option>
                    <option value="Female">Nữ</option>
                    <option value="Other">Khác</option>
                  </select>
                </Field>

                <Field label="Số điện thoại">
                  <input
                    name="phone" value={form.phone} onChange={handleChange}
                    style={inputStyle("phone")} type="tel" placeholder="0901 234 567"
                  />
                </Field>

                <Field label="Email" error={errors.email} touched={touched.email} success={!errors.email && !!form.email} hint="Dùng để đăng nhập hệ thống">
                  <input {...fieldProps("email")} type="email" placeholder="nguyenvana@company.com" />
                </Field>

                <Field label="Địa chỉ">
                  <input
                    name="address" value={form.address} onChange={handleChange}
                    style={inputStyle("address")} placeholder="Số nhà, Đường, Quận/Huyện, Tỉnh/TP"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
                💼 Thông tin công việc
              </h3>
              <div className="form-grid">
                <Field label="Mã nhân viên" required error={errors.employeeId} touched={touched.employeeId} success={!errors.employeeId && !!form.employeeId} hint="Định dạng: EMP001">
                  <input {...fieldProps("employeeId")} placeholder="EMP009" />
                </Field>

                <Field label="Ngày bắt đầu">
                  <input
                    name="startDate" value={form.startDate} onChange={handleChange}
                    style={inputStyle("startDate")} type="date"
                  />
                </Field>

                <Field label="Phòng ban" required error={errors.department} touched={touched.department} success={!errors.department && !!form.department}>
                  <select {...fieldProps("department")}>
                    <option value="">Chọn phòng ban...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Chức danh" required error={errors.designation} touched={touched.designation} success={!errors.designation && !!form.designation}>
                  <input {...fieldProps("designation")} placeholder="Frontend Developer" />
                </Field>

                <Field label="Loại hợp đồng">
                  <select name="type" value={form.type} onChange={handleChange} style={inputStyle("type")}>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Hợp đồng thời vụ</option>
                    <option value="Intern">Thực tập sinh</option>
                  </select>
                </Field>

                <Field label="Trạng thái ban đầu">
                  <select name="status" value={form.status} onChange={handleChange} style={inputStyle("status")}>
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
                💰 Thông tin tài chính
              </h3>
              <div className="form-grid">
                <Field label="Lương hàng năm (USD)" required error={errors.salary} touched={touched.salary} success={!errors.salary && !!form.salary} hint="Lương gross, trước thuế">
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
                    Phân tích lương
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-3)", textAlign: "center" }}>
                    {[
                      { label: "Hàng năm",  value: `$${Number(form.salary).toLocaleString()}` },
                      { label: "Hàng tháng", value: `$${Math.round(form.salary / 12).toLocaleString()}` },
                      { label: "Hàng tuần",  value: `$${Math.round(form.salary / 52).toLocaleString()}` },
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
                <Field label="Ghi chú">
                  <textarea
                    name="notes" value={form.notes} onChange={handleChange}
                    style={{ ...inputStyle("notes"), resize: "vertical" }} rows={3}
                    placeholder="Thông tin bổ sung về nhân viên..."
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 4: Review ── */}
          {step === 4 && !submitted && (
            <ReviewStep formData={form} onEdit={jumpTo} />
          )}

          {/* ── Success ── */}
          {submitted && <SuccessScreen name={form.name} />}
        </div>

        {/* ── Navigation ── */}
        {!submitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button" className="btn btn-secondary"
              onClick={step === 1 ? () => navigate("/employees") : goBack}
            >
              {step === 1 ? "Hủy" : "← Quay lại"}
            </button>

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
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Tiếp theo →
                </button>
              ) : (
                <button type="button" className="btn btn-success" onClick={handleSubmit}>
                  ✓ Tạo nhân viên
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {showToast && (
          <div className="toast toast-success" role="alert">
            <span className="toast-icon">✓</span>
            <span className="toast-message">Thêm nhân viên thành công!</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddEmployee;
