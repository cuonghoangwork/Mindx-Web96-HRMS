import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { translateApiError } from "../utils/apiError";
import { isoOf } from "../utils/attendance";
import Avatar from "./Avatar";
import Button from "./Button";

/**
 * AssignOvertimePanel — HR or a manager schedules overtime for several people
 * at once.
 *
 * The whole design turns on one property of the endpoint: it validates each
 * employee **independently** and returns { created, skipped } rather than
 * failing the batch. That is not a detail to paper over — one person being
 * over their monthly cap must not silently discard the other nine
 * assignments, and the person doing the assigning needs to see exactly who was
 * left out and why. So the result panel below is as much of the feature as the
 * form is.
 *
 * Deliberately not shown: a per-employee caps meter. It would cost one balance
 * request per listed employee on every render of the picker, and the skipped
 * list already names the cap that blocked anyone it blocked — after the fact,
 * but accurately, and without the fan-out.
 */
function AssignOvertimePanel({ employees, onAssigned }) {
  const { t } = useTranslation();
  const { assignOvertime, getAppNow } = useStore();

  const today = isoOf(getAppNow());
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [plannedStart, setPlannedStart] = useState("18:00");
  const [plannedEnd, setPlannedEnd] = useState("22:00");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name?.toLowerCase().includes(q) ||
        e.employeeId?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((e) => selectedIds.has(e.id));

  const toggleOne = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((e) => next.delete(e.id));
      else visible.forEach((e) => next.add(e.id));
      return next;
    });

  const nameOf = (employeeId) =>
    employees.find((e) => String(e.id) === String(employeeId))?.name ?? employeeId;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (selectedIds.size === 0) {
      setError(t("overtime.assign.noneSelected"));
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await assignOvertime({
        date,
        plannedStart,
        plannedEnd,
        reason,
        employeeIds: [...selectedIds],
      });
      setResult(outcome);
      // Clear only the people who actually got a request, so a retry after
      // fixing a cap problem does not re-send the ones that already landed.
      const createdIds = new Set(outcome.created.map((r) => String(r.employeeId)));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !createdIds.has(String(id)))));
      onAssigned?.(outcome);
    } catch (err) {
      // A whole-request failure (bad span, nobody selected, not authorised) —
      // distinct from the per-employee skips, which resolve successfully.
      setError(translateApiError(err, t) || t("overtime.assign.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div className="content-card">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
              {t("overtime.assign.title")}
            </h3>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {t("overtime.assign.description")}
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>{t("overtime.assign.open")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-card">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {t("overtime.assign.title")}
          </h3>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {t("overtime.assign.description")}
          </p>
        </div>
        <Button variant="secondary" onClick={() => { setOpen(false); setResult(null); setError(""); }}>
          {t("settings.close")}
        </Button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <label htmlFor="ot-assign-date">{t("overtime.modal.date")}</label>
            <input
              id="ot-assign-date"
              type="date"
              value={date}
              min={today}
              onChange={(ev) => setDate(ev.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 120px" }}>
            <label htmlFor="ot-assign-start">{t("overtime.modal.start")}</label>
            <input
              id="ot-assign-start"
              type="time"
              value={plannedStart}
              onChange={(ev) => setPlannedStart(ev.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 120px" }}>
            <label htmlFor="ot-assign-end">{t("overtime.modal.end")}</label>
            <input
              id="ot-assign-end"
              type="time"
              value={plannedEnd === "24:00" ? "23:59" : plannedEnd}
              onChange={(ev) => setPlannedEnd(ev.target.value)}
              required
            />
            {/* Same reason as the apply modal: a native time input cannot
                express 24:00, and a span may not cross midnight. */}
            <label
              style={{
                display: "flex", alignItems: "center", gap: "6px", marginTop: "6px",
                fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
                textTransform: "none", fontWeight: "var(--fw-regular)", letterSpacing: "normal",
              }}
            >
              <input
                type="checkbox"
                checked={plannedEnd === "24:00"}
                onChange={(ev) => setPlannedEnd(ev.target.checked ? "24:00" : "22:00")}
              />
              {t("overtime.modal.endOfDay")}
            </label>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="ot-assign-reason">{t("overtime.modal.reason")}</label>
          <input
            id="ot-assign-reason"
            type="text"
            maxLength={500}
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            placeholder={t("overtime.modal.reasonPlaceholder")}
          />
        </div>

        {/* ── Employee picker ── */}
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" }}>
              {t("overtime.assign.employees")}
            </span>
            <input
              type="search"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t("overtime.assign.searchPlaceholder")}
              style={{ flex: "1 1 180px", maxWidth: "260px" }}
            />
            <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              {t("overtime.assign.selectedCount", { count: selectedIds.size })}
            </span>
          </div>

          <div
            style={{
              border: "1px solid var(--bdr-subtle)",
              borderRadius: "var(--radius-md)",
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            {visible.length === 0 ? (
              <div style={{ padding: "var(--sp-5)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
                {t("overtime.assign.noEmployees")}
              </div>
            ) : (
              <>
                <label
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--sp-2)",
                    padding: "var(--sp-2) var(--sp-3)", borderBottom: "1px solid var(--bdr-subtle)",
                    background: "var(--bg-surface-alt)", cursor: "pointer",
                    fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
                    textTransform: "none", fontWeight: "var(--fw-medium)", letterSpacing: "normal",
                  }}
                >
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  {t("overtime.assign.selectAll")}
                </label>

                {visible.map((e) => (
                  <label
                    key={e.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--sp-3)",
                      padding: "var(--sp-2) var(--sp-3)", cursor: "pointer",
                      borderBottom: "1px solid var(--bdr-subtle)",
                      textTransform: "none", fontWeight: "var(--fw-regular)", letterSpacing: "normal",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleOne(e.id)}
                    />
                    <Avatar name={e.name ?? "?"} size="sm" />
                    <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)" }}>
                      {e.name}{" "}
                      <span style={{ color: "var(--txt-secondary)" }}>({e.employeeId})</span>
                    </span>
                    {e.department && (
                      <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                        {e.department}
                      </span>
                    )}
                  </label>
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? t("overtime.assign.submitting")
              : t("overtime.assign.submit", { count: selectedIds.size })}
          </Button>
        </div>
      </form>

      {/* ── Per-employee outcome ── */}
      {result && (
        <div style={{ marginTop: "var(--sp-5)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--bdr-subtle)" }}>
          {result.created.length > 0 && (
            <div
              style={{
                padding: "var(--sp-3) var(--sp-4)", marginBottom: "var(--sp-3)",
                background: "var(--bg-success-subtle)", border: "1px solid var(--bdr-success)",
                borderRadius: "var(--radius-md)", color: "var(--txt-success)", fontSize: "var(--fs-sm)",
              }}
            >
              {t("overtime.assign.resultCreated", { count: result.created.length })}
            </div>
          )}

          {result.skipped.length > 0 && (
            <div
              style={{
                padding: "var(--sp-3) var(--sp-4)",
                background: "var(--bg-warning-subtle)", border: "1px solid var(--bdr-warning)",
                borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)",
              }}
            >
              <div style={{ fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-2)" }}>
                {t("overtime.assign.resultSkipped", { count: result.skipped.length })}
              </div>
              <ul style={{ margin: 0, paddingLeft: "var(--sp-5)" }}>
                {result.skipped.map((s) => (
                  <li key={s.employeeId} style={{ fontSize: "var(--fs-xs)", marginBottom: "2px" }}>
                    <strong>{nameOf(s.employeeId)}</strong>
                    {" — "}
                    {/* The backend's machine-readable code, translated the same
                        way every other API error is. Falls back to the raw
                        English message when a code has no key yet. */}
                    {translateApiError({ code: s.code, params: s.params }, t) || s.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AssignOvertimePanel;
