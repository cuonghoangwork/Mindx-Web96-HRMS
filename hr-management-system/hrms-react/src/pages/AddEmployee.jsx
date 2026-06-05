import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";

function AddEmployee() {
  const navigate = useNavigate();
  const { addEmployee, departments } = useStore();
  const [formData, setFormData] = useState({
    name: "",
    employeeId: "",
    department: "",
    designation: "",
    type: "Full-time",
    status: "Active",
    email: "",
    phone: "",
    age: "",
    sex: "",
    address: "",
    salary: "",
  });
  const [errors, setErrors] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

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
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    addEmployee({
      ...formData,
      createdAt: new Date().toISOString().split("T")[0],
    });

    setToastMessage("New employee added successfully!");
    setToastType("success");
    setShowToast(true);

    setTimeout(() => {
      navigate("/employees");
    }, 1500);
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
    <div className="content-card">
      <div className="page-header">
        <h2>Add New Employee</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="name">Full Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? "error" : ""}
              aria-invalid={errors.name ? "true" : "false"}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <span
                id="name-error"
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
            <label htmlFor="employeeId">Employee ID *</label>
            <input
              type="text"
              id="employeeId"
              name="employeeId"
              value={formData.employeeId}
              onChange={handleChange}
              className={errors.employeeId ? "error" : ""}
              aria-invalid={errors.employeeId ? "true" : "false"}
              aria-describedby={
                errors.employeeId ? "employeeId-error" : undefined
              }
            />
            {errors.employeeId && (
              <span
                id="employeeId-error"
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
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <span
                id="email-error"
                className="form-error"
                style={{
                  marginTop: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                }}
              >
                {errors.email}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="department">Department *</label>
            <select
              id="department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              className={errors.department ? "error" : ""}
              aria-invalid={errors.department ? "true" : "false"}
              aria-describedby={
                errors.department ? "department-error" : undefined
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
                id="department-error"
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
            <label htmlFor="designation">Designation *</label>
            <input
              type="text"
              id="designation"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              className={errors.designation ? "error" : ""}
              aria-invalid={errors.designation ? "true" : "false"}
              aria-describedby={
                errors.designation ? "designation-error" : undefined
              }
            />
            {errors.designation && (
              <span
                id="designation-error"
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
            <label htmlFor="type">Employment Type</label>
            <select
              id="type"
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
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="age">Age</label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min="18"
              max="100"
            />
          </div>

          <div className="form-group">
            <label htmlFor="sex">Sex</label>
            <select
              id="sex"
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

          <div className="form-group employee-detail-grid-span">
            <label htmlFor="address">Address</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Street, City, State, ZIP"
            />
          </div>

          <div className="form-group employee-detail-grid-span">
            <label htmlFor="salary">Salary</label>
            <input
              type="number"
              id="salary"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder="Annual salary"
              min="0"
              step="1000"
            />
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: "32px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/employees")}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add Employee
          </button>
        </div>
      </form>

      {showToast && (
        <div className={`toast toast-${toastType}`}>
          <span className="toast-icon">
            {toastType === "success" ? "✓" : "✕"}
          </span>
          <span className="toast-message">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default AddEmployee;
