import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge } from "../components/Badge";

/* ─── Stepper config ─── */
const STEPS = [
  { id: 1, label: "Cá nhân",      icon: "👤", desc: "Thông tin cơ bản" },
  { id: 2, label: "Công việc",    icon: "💼", desc: "Vị trí & hợp đồng" },
  { id: 3, label: "Tài chính",    icon: "💰", desc: "Lương & phúc lợi" },
  { id: 4, label: "Xác nhận",     icon: "✅", desc: "Kiểm tra & lưu" },
];

/* ─── Validation per step ─── */
function validateStep(step, data) {
  const errs = {};
  if (step === 1) {
    if (!data.name.trim())        errs.name = "Họ tên là bắt buộc";
    if (!data.age || data.age < 18 || data.age > 80) errs.age = "Tuổi phải từ 18–80";
    if (!data.sex)                errs.sex = "Vui lòng chọn giới tính";
    if (data.email && !/\S+@\S+\.\S+/.test(data.email)) errs.email = "Email không hợp lệ";
  }
  if (step === 2) {
    if (!data.employeeId.trim())  errs.employeeId = "Mã nhân viên là bắt buộc";
    if (!data.department)         errs.department = "Chọn phòng ban";
    if (!data.designation.trim()) errs.designation = "Chức danh là bắt buộc";
    if (!data.type)               errs.type = "Chọn loại hợp đồng";
  }
  if (step === 3) {
    if (!data.salary || Number(data.salary) < 0) errs.salary = "Lương phải là số dương";
  }
  return errs;
}

/* ─── FormField component ─── */
function Field({ label, required, error, hint, children }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">
        {label}{required && <span className="required"> *</span>}
      </label>
      {hint && <span className="form-hint">{hint}</span>}
      {children}
      {error && (
        <span className="form-error-msg">
          <span aria-hidden="true">⚠</span> {error}
        </span>
      )}
    </div>
  );
}

/* ─── Review row ─── */
function ReviewRow({ label, value }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{label}</span>
      <span style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
        {value || <span style={{ color: "var(--txt-disabled)", fontStyle: "italic" }}>—</span>}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
function AddEmployee() {
  const navigate = useNavigate();
  const { addEmployee, departments } = useStore();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", age: "", sex: "", address: "",
    employeeId: "", department: "", designation: "", type: "Full-time", status: "Active",
    salary: "", startDate: "", notes: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const goNext = () => {
    const errs = validateStep(step, formData);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = () => {
    addEmployee({
      ...formData,
      age: Number(formData.age),
      salary: Number(formData.salary),
      createdAt: new Date().toISOString().split("T")[0],
    });
    setSubmitted(true);
    setShowToast(true);
    setTimeout(() => navigate("/employees"), 2000);
  };

  const progressPct = ((step - 1) / (STEPS.length - 1)) * 100;

  /* ── Styles ── */
  const inputClass = (field) => `form-input${errors[field] ? " error" : ""}`;

  return (
    <div className="content-card" style={{ maxWidth: "720px", margin: "0 auto" }}>

      {/* ── PAGE HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginBottom: "var(--sp-8)" }}>
        <button
          type="button"
          onClick={() => navigate("/employees")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-secondary)", fontSize: "20px", lineHeight: 1, padding: "4px" }}
          aria-label="Quay lại"
        >←</button>
        <div>
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            Thêm nhân viên mới
          </h2>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            Điền đầy đủ thông tin để tạo hồ sơ nhân viên
          </p>
        </div>
      </div>

      {/* ── STEPPER ── */}
      <div style={{ marginBottom: "var(--sp-8)" }}>
        {/* Progress bar */}
        <div style={{ position: "relative", marginBottom: "var(--sp-5)" }}>
          <div style={{ height: "3px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)" }} />
          <div style={{
            position: "absolute", top: 0, left: 0, height: "3px",
            background: "var(--bg-primary)", borderRadius: "var(--radius-full)",
            width: `${progressPct}%`, transition: "width 0.4s ease",
          }} />
        </div>

        {/* Step labels */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: "var(--sp-2)" }}>
          {STEPS.map((s) => {
            const done    = s.id < step;
            const current = s.id === step;
            return (
              <div
                key={s.id}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: done ? "pointer" : "default" }}
                onClick={() => done && setStep(s.id)}
                role={done ? "button" : undefined}
                aria-label={done ? `Quay lại bước ${s.id}: ${s.label}` : undefined}
              >
                <div style={{
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: done ? "var(--bg-primary)" : current ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                  border: `2px solid ${done || current ? "var(--bdr-brand)" : "var(--bdr-default)"}`,
                  display: "grid", placeItems: "center",
                  fontSize: done ? "16px" : "18px",
                  transition: "all 0.2s",
                  color: done ? "white" : "inherit",
                }}>
                  {done ? "✓" : s.icon}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontSize: "var(--fs-xs)", fontWeight: current ? "var(--fw-semibold)" : "var(--fw-regular)",
                    color: current ? "var(--txt-primary-brand)" : done ? "var(--txt-primary)" : "var(--txt-secondary)",
                  }}>{s.label}</div>
                  <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-disabled)" }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FORM CONTENT ── */}
      <div style={{
        background: "var(--bg-surface-alt)", borderRadius: "var(--radius-lg)",
        padding: "var(--sp-7)", border: "1px solid var(--bdr-subtle)",
        marginBottom: "var(--sp-6)",
        minHeight: "340px",
      }}>

        {/* ─── STEP 1: Thông tin cá nhân ─── */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
              👤 Thông tin cá nhân
            </h3>
            <div className="form-grid">
              <Field label="Họ và tên" required error={errors.name}>
                <input className={inputClass("name")} name="name" value={formData.name}
                  onChange={handleChange} placeholder="Nguyễn Văn A" />
              </Field>
              <Field label="Tuổi" required error={errors.age}>
                <input className={inputClass("age")} type="number" name="age" value={formData.age}
                  onChange={handleChange} placeholder="25" min="18" max="80" />
              </Field>
              <Field label="Giới tính" required error={errors.sex}>
                <select className={inputClass("sex")} name="sex" value={formData.sex} onChange={handleChange}>
                  <option value="">Chọn...</option>
                  <option value="Male">Nam</option>
                  <option value="Female">Nữ</option>
                  <option value="Other">Khác</option>
                </select>
              </Field>
              <Field label="Email" error={errors.email} hint="Dùng để đăng nhập hệ thống">
                <input className={inputClass("email")} type="email" name="email" value={formData.email}
                  onChange={handleChange} placeholder="nguyenvana@company.com" />
              </Field>
              <Field label="Số điện thoại">
                <input className="form-input" type="tel" name="phone" value={formData.phone}
                  onChange={handleChange} placeholder="0901 234 567" />
              </Field>
              <div className="employee-detail-grid-span">
                <Field label="Địa chỉ">
                  <input className="form-input" name="address" value={formData.address}
                    onChange={handleChange} placeholder="Số nhà, Đường, Quận/Huyện, Tỉnh/TP" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Công việc ─── */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
              💼 Thông tin công việc
            </h3>
            <div className="form-grid">
              <Field label="Mã nhân viên" required error={errors.employeeId} hint="Ví dụ: EMP009">
                <input className={inputClass("employeeId")} name="employeeId" value={formData.employeeId}
                  onChange={handleChange} placeholder="EMP009" />
              </Field>
              <Field label="Ngày bắt đầu">
                <input className="form-input" type="date" name="startDate" value={formData.startDate}
                  onChange={handleChange} />
              </Field>
              <Field label="Phòng ban" required error={errors.department}>
                <select className={inputClass("department")} name="department" value={formData.department} onChange={handleChange}>
                  <option value="">Chọn phòng ban...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Chức danh" required error={errors.designation}>
                <input className={inputClass("designation")} name="designation" value={formData.designation}
                  onChange={handleChange} placeholder="Frontend Developer" />
              </Field>
              <Field label="Loại hợp đồng" required error={errors.type}>
                <select className={inputClass("type")} name="type" value={formData.type} onChange={handleChange}>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Hợp đồng thời vụ</option>
                  <option value="Intern">Thực tập sinh</option>
                </select>
              </Field>
              <Field label="Trạng thái ban đầu">
                <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Tài chính ─── */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
              💰 Thông tin tài chính
            </h3>
            <div className="form-grid">
              <Field label="Lương hàng năm (USD)" required error={errors.salary} hint="Lương gross, trước thuế">
                <input className={inputClass("salary")} type="number" name="salary" value={formData.salary}
                  onChange={handleChange} placeholder="60000" min="0" step="1000" />
              </Field>
              <div />
            </div>

            {/* Salary preview card */}
            {formData.salary > 0 && (
              <div style={{
                marginTop: "var(--sp-5)", padding: "var(--sp-5)",
                background: "var(--bg-primary-subtle)", border: "1px solid var(--bdr-brand)",
                borderRadius: "var(--radius-md)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-3)" }}>
                  Phân tích lương ước tính
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-4)" }}>
                  {[
                    { label: "Hàng năm",  value: `$${Number(formData.salary).toLocaleString()}` },
                    { label: "Hàng tháng", value: `$${Math.round(formData.salary / 12).toLocaleString()}` },
                    { label: "Hàng tuần",  value: `$${Math.round(formData.salary / 52).toLocaleString()}` },
                  ].map((item) => (
                    <div key={item.label} style={{ textAlign: "center" }}>
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
                  className="form-input" name="notes" value={formData.notes}
                  onChange={handleChange} rows={3} style={{ resize: "vertical" }}
                  placeholder="Thông tin bổ sung về nhân viên..."
                />
              </Field>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Xác nhận ─── */}
        {step === 4 && !submitted && (
          <div>
            <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)" }}>
              ✅ Xác nhận thông tin
            </h3>

            {/* Avatar preview */}
            <div style={{
              display: "flex", alignItems: "center", gap: "var(--sp-4)",
              padding: "var(--sp-5)", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--bdr-subtle)", marginBottom: "var(--sp-5)",
            }}>
              <Avatar name={formData.name || "New Employee"} size="lg" />
              <div>
                <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                  {formData.name || "—"}
                </div>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                  {formData.designation || "—"} · {formData.department || "—"}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <StatusBadge status={formData.status} dot />
              </div>
            </div>

            {/* Review grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-5)" }}>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt-secondary)", marginBottom: "var(--sp-2)" }}>Cá nhân</div>
                <ReviewRow label="Họ tên" value={formData.name} />
                <ReviewRow label="Tuổi" value={formData.age} />
                <ReviewRow label="Giới tính" value={formData.sex} />
                <ReviewRow label="Email" value={formData.email} />
                <ReviewRow label="Điện thoại" value={formData.phone} />
              </div>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt-secondary)", marginBottom: "var(--sp-2)" }}>Công việc</div>
                <ReviewRow label="Mã NV" value={formData.employeeId} />
                <ReviewRow label="Phòng ban" value={formData.department} />
                <ReviewRow label="Chức danh" value={formData.designation} />
                <ReviewRow label="Hợp đồng" value={formData.type} />
                <ReviewRow label="Lương/năm" value={formData.salary ? `$${Number(formData.salary).toLocaleString()}` : ""} />
              </div>
            </div>

            <div style={{
              marginTop: "var(--sp-5)", padding: "var(--sp-4)",
              background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
              borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)", color: "var(--txt-info)",
            }}>
              ℹ️ Kiểm tra kỹ thông tin trước khi bấm <strong>Tạo nhân viên</strong>. Bạn có thể chỉnh sửa sau trong trang hồ sơ.
            </div>
          </div>
        )}

        {/* ─── Success state ─── */}
        {submitted && (
          <div style={{ textAlign: "center", padding: "var(--sp-12) var(--sp-6)" }}>
            <div style={{ fontSize: "56px", marginBottom: "var(--sp-4)" }}>🎉</div>
            <h3 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-2)", color: "var(--txt-primary)" }}>
              Thêm thành công!
            </h3>
            <p style={{ fontSize: "var(--fs-md)", color: "var(--txt-secondary)" }}>
              Đang chuyển về danh sách nhân viên...
            </p>
          </div>
        )}
      </div>

      {/* ── NAVIGATION BUTTONS ── */}
      {!submitted && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={step === 1 ? () => navigate("/employees") : goBack}
          >
            {step === 1 ? "Hủy" : "← Quay lại"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            {/* Step dots */}
            <div style={{ display: "flex", gap: "6px" }}>
              {STEPS.map((s) => (
                <div key={s.id} style={{
                  width: s.id === step ? "20px" : "7px",
                  height: "7px", borderRadius: "var(--radius-full)",
                  background: s.id <= step ? "var(--bg-primary)" : "var(--bg-surface-sub)",
                  transition: "all 0.3s",
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

      {/* ── TOAST ── */}
      {showToast && (
        <div className="toast toast-success">
          <span className="toast-icon">✓</span>
          <span className="toast-message">Nhân viên đã được thêm thành công!</span>
        </div>
      )}
    </div>
  );
}

export default AddEmployee;
