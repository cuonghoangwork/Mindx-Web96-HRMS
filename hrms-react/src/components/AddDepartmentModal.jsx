import { useState } from "react";
import { useStore } from "../context/StoreContext";
import Button from "./Button";

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
      setError("A department with this name already exists.");
      return;
    }

    try {
      await addDepartment({ name, manager, budget });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create department.");
    }
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
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add Department
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddDepartmentModal;
