import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import Button from "./Button";
import { translateApiError } from "../utils/apiError";

function EmployeeModal({ onClose }) {
  const { t } = useTranslation();
  const { addEmployee, departments } = useStore();
  const [formData, setFormData] = useState({
    name: "",
    employeeId: "",
    department: "",
    designation: "",
    type: "Full-time",
    status: "Active",
    age: "",
    sex: "",
    address: "",
    salary: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // Focus trap for accessibility
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t("employees.addEmployee.errors.nameRequired", { defaultValue: "Full name is required" });
    }
    if (!formData.employeeId.trim()) {
      newErrors.employeeId = t("employees.addEmployee.errors.employeeIdRequired", { defaultValue: "Employee ID is required" });
    }
    if (!formData.department) {
      newErrors.department = t("employees.employeeModal.errors.departmentRequired", { defaultValue: "Department is required" });
    }
    if (!formData.designation.trim()) {
      newErrors.designation = t("employees.addEmployee.errors.designationRequired", { defaultValue: "Designation is required" });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitError("");
    try {
      await addEmployee(formData);
      onClose();
    } catch (err) {
      setSubmitError(translateApiError(err, t) || t("employees.employeeModal.submitFailed", { defaultValue: "Failed to add employee." }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">{t("employees.employeeModal.title", { defaultValue: "Add Employee" })}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t("employees.employeeModal.closeAria", { defaultValue: "Close modal" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {submitError && (
            <div
              className="form-error"
              style={{ marginBottom: "16px" }}
            >
              {submitError}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="modal-name">{t("employees.employeeModal.fullNameLabel", { defaultValue: "Full Name *" })}</label>
            <input
              type="text"
              id="modal-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? "error" : ""}
              aria-invalid={errors.name ? "true" : "false"}
              aria-describedby={errors.name ? "modal-name-error" : undefined}
            />
            {errors.name && (
              <span
                id="modal-name-error"
                className="form-error"
                style={{
                  marginTop: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                }}
              >
                {errors.name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="modal-employeeId">{t("employees.employeeModal.employeeIdLabel", { defaultValue: "Employee ID *" })}</label>
            <input
              type="text"
              id="modal-employeeId"
              name="employeeId"
              value={formData.employeeId}
              onChange={handleChange}
              className={errors.employeeId ? "error" : ""}
              aria-invalid={errors.employeeId ? "true" : "false"}
              aria-describedby={
                errors.employeeId ? "modal-employeeId-error" : undefined
              }
            />
            {errors.employeeId && (
              <span
                id="modal-employeeId-error"
                className="form-error"
                style={{
                  marginTop: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                }}
              >
                {errors.employeeId}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="modal-department">{t("employees.employeeModal.departmentLabel", { defaultValue: "Department *" })}</label>
            <select
              id="modal-department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              className={errors.department ? "error" : ""}
              aria-invalid={errors.department ? "true" : "false"}
              aria-describedby={
                errors.department ? "modal-department-error" : undefined
              }
            >
              <option value="">{t("employees.employeeModal.selectDepartmentOption", { defaultValue: "Select Department" })}</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
            {errors.department && (
              <span
                id="modal-department-error"
                className="form-error"
                style={{
                  marginTop: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                }}
              >
                {errors.department}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="modal-designation">{t("employees.employeeModal.designationLabel", { defaultValue: "Designation *" })}</label>
            <input
              type="text"
              id="modal-designation"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              className={errors.designation ? "error" : ""}
              aria-invalid={errors.designation ? "true" : "false"}
              aria-describedby={
                errors.designation ? "modal-designation-error" : undefined
              }
            />
            {errors.designation && (
              <span
                id="modal-designation-error"
                className="form-error"
                style={{
                  marginTop: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                }}
              >
                {errors.designation}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="modal-type">{t("common.fieldLabels.employmentType", { defaultValue: "Employment Type" })}</label>
            <select
              id="modal-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
            >
              <option value="Full-time">{t("common.contractType.Full-time", { defaultValue: "Full-time" })}</option>
              <option value="Part-time">{t("common.contractType.Part-time", { defaultValue: "Part-time" })}</option>
              <option value="Contract">{t("common.contractType.Contract", { defaultValue: "Contract" })}</option>
              <option value="Intern">{t("common.contractType.Intern", { defaultValue: "Intern" })}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="modal-age">{t("common.fieldLabels.age", { defaultValue: "Age" })}</label>
            <input
              type="number"
              id="modal-age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min="18"
              max="100"
            />
          </div>

          <div className="form-group">
            <label htmlFor="modal-sex">{t("common.fieldLabels.sex", { defaultValue: "Sex" })}</label>
            <select
              id="modal-sex"
              name="sex"
              value={formData.sex}
              onChange={handleChange}
            >
              <option value="">{t("employees.employeeModal.selectOption", { defaultValue: "Select" })}</option>
              <option value="Male">{t("common.gender.Male", { defaultValue: "Male" })}</option>
              <option value="Female">{t("common.gender.Female", { defaultValue: "Female" })}</option>
              <option value="Other">{t("common.gender.Other", { defaultValue: "Other" })}</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="modal-address">{t("common.fieldLabels.address", { defaultValue: "Address" })}</label>
            <input
              type="text"
              id="modal-address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder={t("common.placeholders.streetCityStateZip", { defaultValue: "Street, City, State, ZIP" })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="modal-salary">{t("common.fieldLabels.salary", { defaultValue: "Salary" })}</label>
            <input
              type="number"
              id="modal-salary"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder={t("employees.employeeModal.salaryPlaceholder", { defaultValue: "Annual salary" })}
              min="0"
              step="1000"
            />
          </div>

          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="primary" type="submit">
              {t("employees.employeeModal.title", { defaultValue: "Add Employee" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmployeeModal;
