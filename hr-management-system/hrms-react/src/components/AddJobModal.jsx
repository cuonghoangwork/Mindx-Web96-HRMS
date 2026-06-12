import { useState } from "react";

/**
 * AddJobModal — Add or edit a job opening
 *
 * Props:
 *   onClose      — close handler
 *   onSave       — (job) => void, called with the new/updated job
 *   job          — optional existing job to edit (presence => edit mode)
 *   departments  — array of department names for the select
 */
function AddJobModal({ onClose, onSave, job = null, departments = [] }) {
  const isEdit = Boolean(job);

  const [formData, setFormData] = useState({
    title: job?.title ?? "",
    department: job?.department ?? departments[0] ?? "",
    location: job?.location ?? "",
    type: job?.type ?? "Full-time",
    status: job?.status ?? "Open",
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

    const title = formData.title.trim();
    const location = formData.location.trim();

    if (!title) {
      setError("Job title is required.");
      return;
    }
    if (!location) {
      setError("Location is required.");
      return;
    }

    onSave({
      id: job?.id,
      title,
      department: formData.department,
      location,
      type: formData.type,
      status: formData.status,
      postedDate: job?.postedDate ?? new Date().toISOString().split("T")[0],
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Job" : "Post New Job"}</h2>
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
            <label className="form-label" htmlFor="job-title">
              Job Title<span className="required">*</span>
            </label>
            <input
              type="text"
              id="job-title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. Senior Software Engineer"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-department">
              Department
            </label>
            <select
              id="job-department"
              name="department"
              value={formData.department}
              onChange={handleChange}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-location">
              Location<span className="required">*</span>
            </label>
            <input
              type="text"
              id="job-location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g. Remote, Hanoi, New York"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-type">
              Employment Type
            </label>
            <select
              id="job-type"
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
            <label className="form-label" htmlFor="job-status">
              Status
            </label>
            <select
              id="job-status"
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="Open">Open</option>
              <option value="Filled">Filled</option>
              <option value="Closed">Closed</option>
            </select>
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
              {isEdit ? "Save Changes" : "Post Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddJobModal;
