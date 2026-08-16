import { useState, useMemo } from "react";
import { PromotionRequestsAPI } from "../api";
import Button from "./Button";

// Extracted out of AllEmployees.jsx so ViewDepartment.jsx's "My Department"
// roster can offer the same Promote action per row, instead of duplicating
// the form (backend already scopes creation to the reviewer's own
// department for MANAGER — see promotionRequestController.js).
const POSITION_LEVELS = ["Intern", "Full-time", "Senior", "Manager"];
const usd = (n) => (n === null || n === undefined || n === "" ? "—" : `$${Number(n).toLocaleString("en-US")}`);

function ProposePromotionModal({ employee, employees, departments, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    employeeId: employee?.id ?? "",
    designation: "", department: "", salary: "", positionLevel: "", effectiveDate: "", reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => employees.find((e) => String(e.id) === String(form.employeeId)) ?? null,
    [employees, form.employeeId],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.employeeId) { setError("Pick an employee first."); return; }
    setSubmitting(true);
    try {
      const body = { employeeId: form.employeeId };
      if (form.designation.trim()) body.designation = form.designation.trim();
      if (form.department) body.department = form.department;
      if (form.salary !== "") body.salary = Number(form.salary);
      if (form.positionLevel) body.positionLevel = form.positionLevel;
      if (form.effectiveDate) body.effectiveDate = form.effectiveDate;
      if (form.reason.trim()) body.reason = form.reason.trim();
      await PromotionRequestsAPI.create(body);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to submit proposal.");
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px" }}>
        <div className="modal-header">
          <h2>Propose a promotion</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "-8px", marginBottom: "var(--sp-4)" }}>
          Propose a new designation, department, level or salary for an employee. An administrator must approve it before it takes effect.
        </p>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="promo-employee">Employee <span className="required">*</span></label>
              <select id="promo-employee" name="employeeId" value={form.employeeId} onChange={handleChange}>
                <option value="">Select an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="promo-effective">Effective date</label>
              <input id="promo-effective" name="effectiveDate" type="date"
                value={form.effectiveDate} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="promo-designation">New designation</label>
              <input id="promo-designation" name="designation" value={form.designation}
                onChange={handleChange} placeholder={selected?.designation || "Senior Developer"} />
              {selected && <span className="form-hint">Currently: {selected.designation || "—"}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="promo-department">New department</label>
              <select id="promo-department" name="department" value={form.department} onChange={handleChange}>
                <option value="">Leave unchanged</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              {selected && <span className="form-hint">Currently: {selected.department || "—"}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="promo-position-level">New position level</label>
              <select id="promo-position-level" name="positionLevel" value={form.positionLevel} onChange={handleChange}>
                <option value="">Leave unchanged</option>
                {POSITION_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
              {selected && <span className="form-hint">Currently: {selected.positionLevel || "—"}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="promo-salary">New annual salary (USD)</label>
              <input id="promo-salary" name="salary" type="number" min="0" step="1000"
                value={form.salary} onChange={handleChange} placeholder={selected?.salary ?? "75000"} />
              {selected && <span className="form-hint">Currently: {usd(selected.salary)}</span>}
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label" htmlFor="promo-reason">Reason</label>
              <textarea id="promo-reason" name="reason" rows={3} value={form.reason}
                onChange={handleChange} placeholder="Why this promotion is justified..."
                style={{ resize: "vertical" }} />
            </div>
          </div>

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" loading={submitting}>Submit proposal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProposePromotionModal;
