import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NotificationsAPI } from "../api";
import { translateApiError } from "../utils/apiError";
import Button from "./Button";

const TITLE_MAX = 120;
const MESSAGE_MAX = 2000;

/**
 * AddNotificationModal — HR/Admin composes a custom notice.
 *
 * Props:
 *   onClose — close handler
 *   onSend  — async (payload) => void, called with the composed notification payload
 */
function AddNotificationModal({ onClose, onSend }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [recipientMode, setRecipientMode] = useState("all"); // "all" | "employees" | "hr" | "individual"
  const [recipientIds, setRecipientIds] = useState([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (recipientMode !== "individual" || employees.length > 0) return;
    setLoadingEmployees(true);
    NotificationsAPI.recipients()
      .then((res) => setEmployees(res.items || []))
      .catch((err) => setError(translateApiError(err, t) || t("notifications.addModal.errors.loadEmployeesFailed", { defaultValue: "Failed to load employees." })))
      .finally(() => setLoadingEmployees(false));
  }, [recipientMode, employees.length, t]);

  const toggleRecipient = (id) => {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const filteredEmployees = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employeeId?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q),
    );
  }, [employees, recipientSearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();

    if (!trimmedTitle) {
      setError(t("notifications.addModal.errors.titleRequired", { defaultValue: "A title is required." }));
      return;
    }
    if (trimmedTitle.length > TITLE_MAX) {
      setError(t("notifications.addModal.errors.titleTooLong", { max: TITLE_MAX, defaultValue: "Title must be {{max}} characters or fewer." }));
      return;
    }
    if (trimmedMessage.length > MESSAGE_MAX) {
      setError(t("notifications.addModal.errors.messageTooLong", { max: MESSAGE_MAX, defaultValue: "Message must be {{max}} characters or fewer." }));
      return;
    }
    if (recipientMode === "individual" && recipientIds.length === 0) {
      setError(t("notifications.addModal.errors.selectRecipient", { defaultValue: "Select at least one recipient." }));
      return;
    }

    const payload = {
      title: trimmedTitle,
      message: trimmedMessage,
      category: "announcement",
      link: link.trim() || undefined,
      linkLabel: link.trim() ? "View" : undefined,
    };

    if (recipientMode === "individual") {
      payload.recipientIds = recipientIds;
    } else if (recipientMode === "employees") {
      payload.audience = "employees";
    } else if (recipientMode === "hr") {
      payload.audience = "hr";
    } else {
      payload.audience = "all";
    }

    setSubmitting(true);
    try {
      await onSend(payload);
      onClose();
    } catch (err) {
      setError(translateApiError(err, t) || t("notifications.addModal.errors.sendFailed", { defaultValue: "Failed to send notice." }));
    } finally {
      setSubmitting(false);
    }
  };

  const titleOverLimit = title.length > TITLE_MAX;
  const messageOverLimit = message.length > MESSAGE_MAX;

  const recipientOptions = [
    { value: "all", label: t("notifications.addModal.recipientOptions.all", { defaultValue: "Everyone" }) },
    { value: "employees", label: t("notifications.addModal.recipientOptions.employees", { defaultValue: "All Employees (excludes HR/Admin)" }) },
    { value: "hr", label: t("notifications.addModal.recipientOptions.hr", { defaultValue: "HR & Admin only" }) },
    { value: "individual", label: t("notifications.addModal.recipientOptions.individual", { defaultValue: "Specific employee(s)" }) },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <h2>{t("notifications.addModal.title", { defaultValue: "Send Notice" })}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.actions.close", { defaultValue: "Close" })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <p className="form-error-msg" style={{ marginBottom: "var(--sp-4)" }}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="notice-title">
              {t("notifications.addModal.titleLabel", { defaultValue: "Title" })}<span className="required">*</span>
            </label>
            <input
              type="text"
              id="notice-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("notifications.addModal.titlePlaceholder", { defaultValue: "e.g. Office closed Friday" })}
              maxLength={TITLE_MAX + 20}
              required
              className={titleOverLimit ? "error" : ""}
            />
            <span
              className="form-hint"
              style={{
                display: "block",
                textAlign: "right",
                color: titleOverLimit ? "var(--txt-danger)" : "var(--txt-secondary)",
              }}
            >
              {title.length}/{TITLE_MAX}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notice-message">
              {t("notifications.addModal.messageLabel", { defaultValue: "Message" })}
            </label>
            <textarea
              id="notice-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t("notifications.addModal.messagePlaceholder", { defaultValue: "Details for the recipient(s)..." })}
              style={{ resize: "vertical" }}
              className={messageOverLimit ? "error" : ""}
            />
            <span
              className="form-hint"
              style={{
                display: "block",
                textAlign: "right",
                color: messageOverLimit ? "var(--txt-danger)" : "var(--txt-secondary)",
              }}
            >
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notice-link">
              {t("notifications.addModal.linkLabel", { defaultValue: "Link" })} <span style={{ fontWeight: "var(--fw-regular)", color: "var(--txt-secondary)" }}>{t("settings.optional", { defaultValue: "(optional)" })}</span>
            </label>
            <input
              type="text"
              id="notice-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t("notifications.addModal.linkPlaceholder", { defaultValue: "e.g. /holidays" })}
            />
            <span className="form-hint">
              {t("notifications.addModal.linkHint", { defaultValue: "An in-app path the notice will open when clicked, e.g. /holidays or /employees/123" })}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">{t("notifications.addModal.recipientsLabel", { defaultValue: "Recipients" })}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {recipientOptions.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-2)",
                    cursor: "pointer",
                    fontSize: "var(--fs-sm)",
                    color: "var(--txt-primary)",
                  }}
                >
                  <input
                    type="radio"
                    name="recipient-mode"
                    value={opt.value}
                    checked={recipientMode === opt.value}
                    onChange={() => setRecipientMode(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {recipientMode === "individual" && (
            <div className="form-group">
              {loadingEmployees ? (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("notifications.addModal.loadingEmployees", { defaultValue: "Loading employees…" })}</p>
              ) : (
                <>
                  {employees.length > 5 && (
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder={t("notifications.addModal.recipientSearchPlaceholder", { defaultValue: "Search by name, ID, or email..." })}
                      style={{ marginBottom: "var(--sp-2)" }}
                    />
                  )}
                  <div
                    style={{
                      maxHeight: "200px",
                      overflowY: "auto",
                      border: "1px solid var(--bdr-default)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--sp-2)",
                    }}
                  >
                    {filteredEmployees.length === 0 && (
                      <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", padding: "var(--sp-2)" }}>
                        {employees.length === 0
                          ? t("notifications.addModal.noEmployeesFound", { defaultValue: "No employees found." })
                          : t("notifications.addModal.noSearchMatches", { defaultValue: "No matches for your search." })}
                      </p>
                    )}
                    {filteredEmployees.map((emp) => (
                      <label
                        key={emp.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          padding: "6px var(--sp-2)",
                          cursor: "pointer",
                          fontSize: "var(--fs-sm)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={recipientIds.includes(emp.id)}
                          onChange={() => toggleRecipient(emp.id)}
                        />
                        <span>{emp.name}</span>
                        <span style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-xs)" }}>
                          {emp.employeeId}
                          {!emp.hasAccount && t("notifications.addModal.noAccountSuffix", { defaultValue: " · no account" })}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              {recipientIds.length > 0 && (
                <span className="form-hint">{t("notifications.addModal.selectedCount", { count: recipientIds.length, defaultValue_one: "{{count}} selected", defaultValue_other: "{{count}} selected" })}</span>
              )}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || titleOverLimit || messageOverLimit}
            >
              {submitting ? t("notifications.addModal.sendingEllipsis", { defaultValue: "Sending…" }) : t("notifications.addModal.title", { defaultValue: "Send Notice" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddNotificationModal;
