import { useState, useEffect } from "react";
import { useStore } from "../context/StoreContext";

function EmployeeModal({ onClose }) {
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
      newErrors.name = "Full name is required";
    }
    if (!formData.employeeId.trim()) {
      newErrors.employeeId = "Employee ID is required";
    }
    if (!formData.department) {
      newErrors.department = "Department is required";
    }
    if (!formData.designation.trim()) {
      newErrors.designation = "Designation is required";
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
      await addEmployee({
        ...formData,
        createdAt: new Date().toISOString().split("T")[0],
      });
      onClose();
    } catch (err) {
      setSubmitError(err.message || "Failed to add employee.");
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
          <h2 id="modal-title">Add Employee</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
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
            <label htmlFor="modal-name">Full Name *</label>
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
            <label htmlFor="modal-employeeId">Employee ID *</label>
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
            <label htmlFor="modal-department">Department *</label>
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
              <option value="">Select Department</option>
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
            <label htmlFor="modal-designation">Designation *</label>
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
            <label htmlFor="modal-type">Employment Type</label>
            <select
              id="modal-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Intern">Intern</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="modal-age">Age</label>
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
            <label htmlFor="modal-sex">Sex</label>
            <select
              id="modal-sex"
              name="sex"
              value={formData.sex}
              onChange={handleChange}
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="modal-address">Address</label>
            <input
              type="text"
              id="modal-address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Street, City, State, ZIP"
            />
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="modal-salary">Salary</label>
            <input
              type="number"
              id="modal-salary"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder="Annual salary"
              min="0"
              step="1000"
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
              Add Employee
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmployeeModal;
