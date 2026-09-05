import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import { useStore } from "../context/StoreContext";
import { translateApiError } from "../utils/apiError";
import { isoOf } from "../utils/attendance";

/**
 * OvertimeRequestModal — apply for overtime on a given date.
 *
 * The caps meter is the reason this modal exists rather than a plain form.
 * At 4h/day an employee reaches the 40h monthly ceiling on their tenth
 * overtime day, so the monthly cap binds long before the daily one. Without a
 * running total in front of them, people hit a wall they had no way to see
 * coming — and the server-side rejection arrives only after they have filled
 * the whole form in.
 *
 * Everything shown here is a hint, never a gate. The backend re-validates the
 * cutoff, the day type, and all three caps on submit, so a stale meter can
 * only ever look momentarily out of date; it cannot let a bad request through.
 */
function OvertimeRequestModal({ onClose, onSubmitted, defaultDate }) {
  const { t } = useTranslation();
  const { applyOvertime, fetchOvertimeBalance, getAppNow } = useStore();

  const today = isoOf(getAppNow());
  const [date, setDate] = useState(defaultDate || today);
  const [plannedStart, setPlannedStart] = useState("18:00");
  const [plannedEnd, setPlannedEnd] = useState("22:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(null);

  // Re-fetched per month, because the monthly figure is the one that binds.
  const [year, month] = useMemo(() => {
    const [y, m] = date.split("-");
    return [Number(y), Number(m)];
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    if (!year || !month) return undefined;
    fetchOvertimeBalance({ year, month })
      .then((data) => { if (!cancelled) setBalance(data); })
      .catch(() => { if (!cancelled) setBalance(null); });
    return () => { cancelled = true; };
  }, [year, month, fetchOvertimeBalance]);

  /** Minutes in the requested span. "24:00" is a legal end, never a legal start. */
  const requestedMinutes = useMemo(() => {
    const toMinutes = (v, allowEndOfDay) => {
      if (allowEndOfDay && v === "24:00") return 24 * 60;
      const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return null;
      return h * 60 + min;
    };
    const start = toMinutes(plannedStart, false);
    const end = toMinutes(plannedEnd, true);
    if (start === null || end === null || end <= start) return null;
    return end - start;
  }, [plannedStart, plannedEnd]);

  const requestedHours = requestedMinutes === null ? null : requestedMinutes / 60;

  // Projected month total if this request were approved. Shown alongside the
  // cap so the wall is visible before the employee walks into it.
  const projectedMonth =
    balance && requestedHours !== null
      ? Math.round((balance.monthUsed + requestedHours) * 100) / 100
      : null;
  const overMonthlyCap = projectedMonth !== null && projectedMonth > (balance?.monthCap ?? Infinity);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (requestedMinutes === null) {
      setError(t("overtime.modal.errors.invalidSpan"));
      return;
    }
    setSubmitting(true);
    try {
      const created = await applyOvertime({ date, plannedStart, plannedEnd, reason });
      onSubmitted?.(created);
      onClose();
    } catch (err) {
      setError(translateApiError(err, t) || t("overtime.modal.errors.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const meterRow = (label, used, cap, remaining) => {
    const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
    return (
      <div style={{ marginBottom: "var(--sp-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-xs)", marginBottom: "4px" }}>
          <span style={{ color: "var(--txt-secondary)" }}>{label}</span>
          <span style={{ color: "var(--txt-primary)", fontWeight: "var(--fw-medium)" }}>
            {t("overtime.meter.usedOfCap", { used, cap })}
          </span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-surface-alt)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: pct >= 100 ? "var(--bdr-danger)" : pct >= 80 ? "var(--bdr-warning)" : "var(--bdr-brand)",
              transition: "width 0.2s",
            }}
          />
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>
          {t("overtime.meter.remaining", { hours: remaining })}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <h2>{t("overtime.modal.title")}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            &times;
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="ot-date">{t("overtime.modal.date")}</label>
            <input
              id="ot-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ot-start">{t("overtime.modal.start")}</label>
              <input
                id="ot-start"
                type="time"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ot-end">{t("overtime.modal.end")}</label>
              <input
                id="ot-end"
                type="time"
                value={plannedEnd === "24:00" ? "23:59" : plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                required
              />
              {/* A native <input type="time"> cannot express 24:00, and a span
                  may not cross midnight — so the end-of-day case gets its own
                  control rather than a value the picker would silently mangle. */}
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
                  onChange={(e) => setPlannedEnd(e.target.checked ? "24:00" : "22:00")}
                />
                {t("overtime.modal.endOfDay")}
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="ot-reason">{t("overtime.modal.reason")}</label>
            <textarea
              id="ot-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("overtime.modal.reasonPlaceholder")}
            />
          </div>

          {/* ── Live caps meter ── */}
          <div
            style={{
              padding: "var(--sp-4)",
              background: "var(--bg-surface-alt)",
              border: "1px solid var(--bdr-subtle)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--sp-4)",
            }}
          >
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-3)" }}>
              {t("overtime.meter.title")}
            </div>

            {balance ? (
              <>
                {meterRow(t("overtime.meter.month"), balance.monthUsed, balance.monthCap, balance.monthRemaining)}
                {meterRow(t("overtime.meter.year"), balance.yearUsed, balance.yearCap, balance.yearRemaining)}
              </>
            ) : (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                {t("overtime.meter.loading")}
              </div>
            )}

            {requestedHours !== null && (
              <div
                style={{
                  marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)",
                  borderTop: "1px solid var(--bdr-subtle)", fontSize: "var(--fs-xs)",
                  color: overMonthlyCap ? "var(--txt-danger)" : "var(--txt-secondary)",
                }}
              >
                {overMonthlyCap
                  ? t("overtime.meter.wouldExceed", { hours: requestedHours, cap: balance?.monthCap })
                  : t("overtime.meter.thisRequest", { hours: requestedHours, projected: projectedMonth })}
              </div>
            )}
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("overtime.modal.submitting") : t("overtime.modal.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default OvertimeRequestModal;
