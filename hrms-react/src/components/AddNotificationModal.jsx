import { useState, useEffect, useMemo } from "react";
import { NotificationsAPI } from "../api";
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
      .catch((err) => setError(err.message || "Failed to load employees."))
      .finally(() => setLoadingEmployees(false));
  }, [recipientMode, employees.length]);

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
      setError("A title is required.");
      return;
    }
    if (trimmedTitle.length > TITLE_MAX) {
      setError(`Title must be ${TITLE_MAX} characters or fewer.`);
      return;
    }
    if (trimmedMessage.length > MESSAGE_MAX) {
      setError(`Message must be ${MESSAGE_MAX} characters or fewer.`);
      return;
    }
    if (recipientMode === "individual" && recipientIds.length === 0) {
      setError("Select at least one recipient.");
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
      setError(err.message || "Failed to send notice.");
    } finally {
      setSubmitting(false);
    }
  };

  const titleOverLimit = title.length > TITLE_MAX;
  const messageOverLimit = message.length > MESSAGE_MAX;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <h2>Send Notice</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <p className="form-error-msg" style={{ marginBottom: "var(--sp-4)" }}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="notice-title">
              Title<span className="required">*</span>
            </label>
            <input
              type="text"
              id="notice-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office closed Friday"
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
              Message
            </label>
            <textarea
              id="notice-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Details for the recipient(s)..."
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
              Link <span style={{ fontWeight: "var(--fw-regular)", color: "var(--txt-secondary)" }}>(optional)</span>
            </label>
            <input
              type="text"
              id="notice-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="e.g. /holidays"
            />
            <span className="form-hint">
              An in-app path the notice will open when clicked, e.g. /holidays or /employees/123
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Recipients</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {[
                { value: "all", label: "Everyone" },
                { value: "employees", label: "All Employees (excludes HR/Admin)" },
                { value: "hr", label: "HR & Admin only" },
                { value: "individual", label: "Specific employee(s)" },
              ].map((opt) => (
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
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>Loading employees…</p>
              ) : (
                <>
                  {employees.length > 5 && (
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Search by name, ID, or email..."
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
                        {employees.length === 0 ? "No employees found." : "No matches for your search."}
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
                          {!emp.hasAccount && " · no account"}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              {recipientIds.length > 0 && (
                <span className="form-hint">{recipientIds.length} selected</span>
              )}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || titleOverLimit || messageOverLimit}
            >
              {submitting ? "Sending…" : "Send Notice"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddNotificationModal;
