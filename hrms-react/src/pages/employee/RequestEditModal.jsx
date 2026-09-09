import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileEditRequestsAPI } from "../../api";
import Button from "../../components/Button";
import { translateApiError } from "../../utils/apiError";

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
export function RequestEditModal({ employee, onClose, onSubmitted }) {
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
