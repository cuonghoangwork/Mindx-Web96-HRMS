import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setError(t("jobs.addJobModal.titleRequired", { defaultValue: "Job title is required." }));
      return;
    }
    if (!location) {
      setError(t("jobs.addJobModal.locationRequired", { defaultValue: "Location is required." }));
      return;
    }
    if (
      formData.salaryMin !== "" &&
      formData.salaryMax !== "" &&
      Number(formData.salaryMin) > Number(formData.salaryMax)
    ) {
      setError(t("jobs.addJobModal.salaryRangeInvalid", { defaultValue: "Minimum salary cannot be greater than maximum salary." }));
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
          <h2>{isEdit ? t("jobs.addJobModal.titleEdit", { defaultValue: "Edit Job" }) : t("jobs.addJobModal.titleAdd", { defaultValue: "Post New Job" })}</h2>
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
            <label className="form-label" htmlFor="job-title">
              {t("jobs.addJobModal.titleLabel", { defaultValue: "Job Title" })}<span className="required">*</span>
            </label>
            <input
              type="text"
              id="job-title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.titlePlaceholder", { defaultValue: "e.g. Senior Software Engineer" })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-department">
              {t("common.fieldLabels.department", { defaultValue: "Department" })}
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
              {t("jobs.addJobModal.locationLabel", { defaultValue: "Location" })}<span className="required">*</span>
            </label>
            <input
              type="text"
              id="job-location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.locationPlaceholder", { defaultValue: "e.g. Remote, Hanoi, New York" })}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-type">
                {t("jobs.addJobModal.employmentTypeLabel", { defaultValue: "Employment Type" })}
              </label>
              <select
                id="job-type"
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

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-status">
                {t("common.fieldLabels.status", { defaultValue: "Status" })}
              </label>
              <select
                id="job-status"
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="Open">{t("common.jobStatus.Open", { defaultValue: "Open" })}</option>
                <option value="Filled">{t("common.jobStatus.Filled", { defaultValue: "Filled" })}</option>
                <option value="Closed">{t("common.jobStatus.Closed", { defaultValue: "Closed" })}</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-description">
              {t("jobs.addJobModal.descriptionLabel", { defaultValue: "Job Description" })}
            </label>
            <textarea
              id="job-description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.descriptionPlaceholder", { defaultValue: "What this role does day-to-day…" })}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-requirements">
              {t("jobs.addJobModal.requirementsLabel", { defaultValue: "Requirements" })} <span style={{ fontWeight: 400, color: "var(--txt-secondary)" }}>{t("jobs.addJobModal.onePerLine", { defaultValue: "(one per line)" })}</span>
            </label>
            <textarea
              id="job-requirements"
              name="requirements"
              rows={3}
              value={formData.requirements}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.requirementsPlaceholder", { defaultValue: "3+ years of relevant experience\nStrong communication skills" })}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-benefits">
              {t("jobs.addJobModal.benefitsLabel", { defaultValue: "Pay & Benefits" })} <span style={{ fontWeight: 400, color: "var(--txt-secondary)" }}>{t("jobs.addJobModal.onePerLine", { defaultValue: "(one per line)" })}</span>
            </label>
            <textarea
              id="job-benefits"
              name="benefits"
              rows={3}
              value={formData.benefits}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.benefitsPlaceholder", { defaultValue: "Health insurance\n13th-month bonus" })}
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-salary-min">
                {t("jobs.addJobModal.minSalaryLabel", { defaultValue: "Min Salary" })}
              </label>
              <input
                type="number"
                id="job-salary-min"
                name="salaryMin"
                min="0"
                value={formData.salaryMin}
                onChange={handleChange}
                placeholder={t("jobs.addJobModal.minSalaryPlaceholder", { defaultValue: "e.g. 50000" })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="job-salary-max">
                {t("jobs.addJobModal.maxSalaryLabel", { defaultValue: "Max Salary" })}
              </label>
              <input
                type="number"
                id="job-salary-max"
                name="salaryMax"
                min="0"
                value={formData.salaryMax}
                onChange={handleChange}
                placeholder={t("jobs.addJobModal.maxSalaryPlaceholder", { defaultValue: "e.g. 70000" })}
              />
            </div>
            <div className="form-group" style={{ flex: "0 0 100px" }}>
              <label className="form-label" htmlFor="job-salary-currency">
                {t("jobs.addJobModal.currencyLabel", { defaultValue: "Currency" })}
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
              {t("jobs.addJobModal.deadlineLabel", { defaultValue: "Application Deadline" })}
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
              {t("jobs.addJobModal.companyInfoLabel", { defaultValue: "Company Info" })}
            </label>
            <textarea
              id="job-company-info"
              name="companyInfo"
              rows={2}
              value={formData.companyInfo}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.companyInfoPlaceholder", { defaultValue: "A short blurb about the company shown on the posting…" })}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="job-application-instructions">
              {t("jobs.addJobModal.applicationInstructionsLabel", { defaultValue: "How to Apply" })}
            </label>
            <textarea
              id="job-application-instructions"
              name="applicationInstructions"
              rows={2}
              value={formData.applicationInstructions}
              onChange={handleChange}
              placeholder={t("jobs.addJobModal.applicationInstructionsPlaceholder", { defaultValue: "Application link, email, or instructions…" })}
              style={{ resize: "vertical" }}
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
              {isEdit ? t("jobs.addJobModal.saveChanges", { defaultValue: "Save Changes" }) : t("jobs.addJobModal.postJob", { defaultValue: "Post Job" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddJobModal;
