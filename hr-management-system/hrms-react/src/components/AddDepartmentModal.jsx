import { useState } from "react";
import { useStore } from "../context/StoreContext";

function AddDepartmentModal({ onClose }) {
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

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const manager = formData.manager.trim();
    const budget = parseInt(formData.budget, 10) || 0;

    if (
      departments.some(
        (dept) => dept.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("A department with this name already exists.");
      return;
    }

    addDepartment({ name, manager, budget });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Department</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="dept-name">Department Name *</label>
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
            <label htmlFor="dept-manager">Manager *</label>
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
            <label htmlFor="dept-budget">Budget (USD)</label>
            <input
              type="number"
              id="dept-budget"
              name="budget"
              value={formData.budget}
              onChange={handleChange}
              min="0"
              placeholder="0"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Department
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddDepartmentModal;
