import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import Button from "./Button";
import { translateApiError } from "../utils/apiError";

function AddDepartmentModal({ onClose }) {
  const { t } = useTranslation();
  const { departments, addDepartment } = useStore();
  const [formData, setFormData] = useState({
    name: "",
    manager: "",
    budget: "",
  });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const manager = formData.manager.trim();
    const budget = parseInt(formData.budget, 10) || 0;

    if (
      departments.some(
        (dept) => dept.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError(t("employees.addDepartmentModal.duplicateNameError", { defaultValue: "A department with this name already exists." }));
      return;
    }

    try {
      await addDepartment({ name, manager, budget });
      onClose();
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.addDepartmentModal.submitFailed", { defaultValue: "Failed to create department." }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("employees.addDepartmentModal.title", { defaultValue: "Add Department" })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="dept-name">{t("employees.addDepartmentModal.nameLabel", { defaultValue: "Department Name *" })}</label>
            <input
              type="text"
              id="dept-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="dept-manager">{t("employees.addDepartmentModal.managerLabel", { defaultValue: "Manager *" })}</label>
            <input
              type="text"
              id="dept-manager"
              name="manager"
              value={formData.manager}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="dept-budget">{t("employees.addDepartmentModal.budgetLabel", { defaultValue: "Budget (USD)" })}</label>
            <input
              type="number"
              id="dept-budget"
              name="budget"
              value={formData.budget}
              onChange={handleChange}
              min="0"
              placeholder={t("employees.addDepartmentModal.budgetPlaceholder", { defaultValue: "0" })}
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
              {t("employees.addDepartmentModal.title", { defaultValue: "Add Department" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddDepartmentModal;
