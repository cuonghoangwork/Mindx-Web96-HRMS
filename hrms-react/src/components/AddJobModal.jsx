import { useState } from "react";
import Button from "./Button";

/**
 * AddJobModal — Add or edit a job opening
 *
 * Props:
 *   onClose      — close handler
 *   onSave       — (job) => void, called with the new/updated job
 *   job          — optional existing job to edit (presence => edit mode)
 *   departments  — array of department names for the select
 *
 * Task 5.1: expanded beyond title/department/location/type/status to also
 * collect the JD, requirements, benefits, pay range, company info,
 * application instructions and deadline. requirements/benefits are edited
 * as one-per-line textareas and sent to the backend as newline-separated
 * text — jobFromClient() on the server splits them into an array (see
 * hrms-backend/utils/mappers.js toBulletList()).
 */
function AddJobModal({ onClose, onSave, job = null, departments = [] }) {
  const isEdit = Boolean(job);

  const [formData, setFormData] = useState({
    title: job?.title ?? "",
    department: job?.department ?? departments[0] ?? "",
    location: job?.location ?? "",
    type: job?.type ?? "Full-time",
    status: job?.status ?? "Open",
    description: job?.description ?? "",
    requirements: (job?.requirements ?? []).join("\n"),
    benefits: (job?.benefits ?? []).join("\n"),
    salaryMin: job?.salaryMin ?? "",
    salaryMax: job?.salaryMax ?? "",
    salaryCurrency: job?.salaryCurrency ?? "USD",
    companyInfo: job?.companyInfo ?? "",
    applicationInstructions: job?.applicationInstructions ?? "",
    deadline: job?.deadline ?? "",
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
    if (
      formData.salaryMin !== "" &&
      formData.salaryMax !== "" &&
      Number(formData.salaryMin) > Number(formData.salaryMax)
    ) {
      setError("Minimum salary cannot be greater than maximum salary.");
      return;
    }

    onSave({
      id: job?.id,
      title,
      department: formData.department,
      location,
      type: formData.type,
      status: formData.status,
      description: formData.description.trim(),
      requirements: formData.requirements,
      benefits: formData.benefits,
      salaryMin: formData.salaryMin === "" ? "" : Number(formData.salaryMin),
      salaryMax: formData.salaryMax === "" ? "" : Number(formData.salaryMax),
      salaryCurrency: formData.salaryCurrency.trim() || "USD",
      companyInfo: formData.companyInfo.trim(),
      applicationInstructions: formData.applicationInstructions.trim(),
      deadline: formData.deadline || null,
      postedDate: job?.postedDate ?? new Date().toISOString().split("T")[0],
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
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

          <div style={{ display: "flex", gap: "12px" }}>
            <div className="form-group" style={{ flex: 1 }}>
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

            <div className="form-group" style={{ flex: 1 }}>
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
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-description">
              Job Description
            </label>
            <textarea
              id="job-description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="What this role does day-to-day…"
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-requirements">
              Requirements <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(one per line)</span>
            </label>
            <textarea
              id="job-requirements"
              name="requirements"
              rows={3}
              value={formData.requirements}
              onChange={handleChange}
              placeholder={"3+ years of relevant experience\nStrong communication skills"}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-benefits">
              Pay &amp; Benefits <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(one per line)</span>
            </label>
            <textarea
              id="job-benefits"
              name="benefits"
              rows={3}
              value={formData.benefits}
              onChange={handleChange}
              placeholder={"Health insurance\n13th-month bonus"}
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-salary-min">
                Min Salary
              </label>
              <input
                type="number"
                id="job-salary-min"
                name="salaryMin"
                min="0"
                value={formData.salaryMin}
                onChange={handleChange}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-salary-max">
                Max Salary
              </label>
              <input
                type="number"
                id="job-salary-max"
                name="salaryMax"
                min="0"
                value={formData.salaryMax}
                onChange={handleChange}
                placeholder="e.g. 70000"
              />
            </div>
            <div className="form-group" style={{ flex: "0 0 100px" }}>
              <label className="form-label" htmlFor="job-salary-currency">
                Currency
              </label>
              <input
                type="text"
                id="job-salary-currency"
                name="salaryCurrency"
                value={formData.salaryCurrency}
                onChange={handleChange}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-deadline">
              Application Deadline
            </label>
            <input
              type="date"
              id="job-deadline"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-company-info">
              Company Info
            </label>
            <textarea
              id="job-company-info"
              name="companyInfo"
              rows={2}
              value={formData.companyInfo}
              onChange={handleChange}
              placeholder="A short blurb about the company shown on the posting…"
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-application-instructions">
              How to Apply
            </label>
            <textarea
              id="job-application-instructions"
              name="applicationInstructions"
              rows={2}
              value={formData.applicationInstructions}
              onChange={handleChange}
              placeholder="Application link, email, or instructions…"
              style={{ resize: "vertical" }}
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
              {isEdit ? "Save Changes" : "Post Job"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddJobModal;
