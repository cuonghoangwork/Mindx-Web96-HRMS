import { useState } from "react";
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
      setError("Holiday name is required.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }

    const duplicate = existing.some(
      (h) =>
        h.id !== holiday?.id &&
        h.name.toLowerCase() === name.toLowerCase() &&
        h.date === date,
    );
    if (duplicate) {
      setError("A holiday with this name and date already exists.");
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
          <h2>{isEdit ? "Edit Holiday" : "Add Holiday"}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className="form-error-msg">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="holiday-name">
              Holiday Name<span className="required">*</span>
            </label>
            <input
              type="text"
              id="holiday-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Tet Holiday"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="holiday-date">
              Date<span className="required">*</span>
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
              Type
            </label>
            <select
              id="holiday-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
            >
              <option value="Public">Public</option>
              <option value="Company">Company</option>
              <option value="Optional">Optional</option>
            </select>
          </div>

          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {isEdit ? "Save Changes" : "Add Holiday"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddHolidayModal;
