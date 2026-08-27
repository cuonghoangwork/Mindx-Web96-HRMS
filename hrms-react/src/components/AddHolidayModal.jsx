import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";

/**
 * AddHolidayModal — Add or edit a holiday entry
 *
 * Props:
 *   onClose    — close handler
 *   onSave     — (holiday) => void, called with the new/updated holiday
 *   holiday    — optional existing holiday to edit (presence => edit mode)
 *   existing   — array of existing holidays, used for duplicate-name check
 */
function AddHolidayModal({ onClose, onSave, holiday = null, existing = [] }) {
  const { t } = useTranslation();
  const isEdit = Boolean(holiday);

  const [formData, setFormData] = useState({
    name: holiday?.name ?? "",
    date: holiday?.date ?? "",
    type: holiday?.type ?? "Public",
  });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const date = formData.date;
    const type = formData.type;

    if (!name) {
      setError(t("holidays.addHolidayModal.nameRequired", { defaultValue: "Holiday name is required." }));
      return;
    }
    if (!date) {
      setError(t("holidays.addHolidayModal.dateRequired", { defaultValue: "Date is required." }));
      return;
    }

    const duplicate = existing.some(
      (h) =>
        h.id !== holiday?.id &&
        h.name.toLowerCase() === name.toLowerCase() &&
        h.date === date,
    );
    if (duplicate) {
      setError(t("holidays.addHolidayModal.duplicate", { defaultValue: "A holiday with this name and date already exists." }));
      return;
    }

    onSave({
      id: holiday?.id,
      name,
      date,
      type,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? t("holidays.addHolidayModal.titleEdit", { defaultValue: "Edit Holiday" }) : t("holidays.addHolidayModal.titleAdd", { defaultValue: "Add Holiday" })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <p className="form-error-msg">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="holiday-name">
              {t("holidays.addHolidayModal.nameLabel", { defaultValue: "Holiday Name" })}<span className="required">*</span>
            </label>
            <input
              type="text"
              id="holiday-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder={t("holidays.addHolidayModal.namePlaceholder", { defaultValue: "e.g. Tet Holiday" })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="holiday-date">
              {t("holidays.addHolidayModal.dateLabel", { defaultValue: "Date" })}<span className="required">*</span>
            </label>
            <input
              type="date"
              id="holiday-date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="holiday-type">
              {t("holidays.addHolidayModal.typeLabel", { defaultValue: "Type" })}
            </label>
            <select
              id="holiday-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
            >
              <option value="Public">{t("common.holidayType.Public", { defaultValue: "Public" })}</option>
              <option value="Company">{t("common.holidayType.Company", { defaultValue: "Company" })}</option>
              <option value="Optional">{t("common.holidayType.Optional", { defaultValue: "Optional" })}</option>
            </select>
          </div>

          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="primary" type="submit">
              {isEdit ? t("holidays.addHolidayModal.saveChanges", { defaultValue: "Save Changes" }) : t("holidays.addHolidayModal.addHoliday", { defaultValue: "Add Holiday" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddHolidayModal;
