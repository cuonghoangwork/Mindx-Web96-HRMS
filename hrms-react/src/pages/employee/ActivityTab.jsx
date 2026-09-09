import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate } from "../../utils/format";
import { AuditLogAPI } from "../../api";
import { idsMatch } from "../../utils/id";
import { translateApiError } from "../../utils/apiError";

/**
 * ActivityTab — per-employee history pulled from the real AuditLog (8.0e Day
 * 8), not Dashboard's mock activity feed (that array is page-level summary
 * blurbs, not tied to any one employee — nothing there to actually reuse
 * for a scoped tab). AuditLog's `/recent` endpoint is real, already used
 * nowhere in the frontend today, and open to any authenticated user, so it
 * works for Employee viewing their own record too. It has no `resourceId`
 * filter server-side, so this fetches the recent global feed and filters
 * client-side to this employee's entries — a real follow-up would add that
 * query param.
 */
export function ActivityTab({ employee }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    AuditLogAPI.recent({ limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const mine = (res.items ?? []).filter((e) => idsMatch(e.resourceId, employee.id));
        setEntries(mine);
      })
      .catch((err) => { if (!cancelled) setError(translateApiError(err, t) || t("employees.viewEmployee.activityTab.loadError", { defaultValue: "Could not load activity." })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employee.id, t]);

  if (loading) return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  if (error) return <p className="form-error">{error}</p>;

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-6 3 3 5-8" />
          </svg>
        </div>
        <div className="empty-state-title">{t("employees.viewEmployee.activityTab.noActivityTitle", { defaultValue: "No recent activity" })}</div>
        <div className="empty-state-description">
          {t("employees.viewEmployee.activityTab.noActivityDesc", { defaultValue: "Changes to this employee's record will show up here (from the last 50 system-wide events)." })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {entries.map((e) => (
        <div key={e._id ?? `${e.action}-${e.createdAt}`} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)",
          border: "1px solid var(--bdr-subtle)", borderRadius: "var(--radius-md)",
          fontSize: "var(--fs-sm)",
        }}>
          <span style={{ color: "var(--txt-primary)" }}>{e.title}</span>
          <span style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-xs)", whiteSpace: "nowrap" }}>
            {formatDate(e.createdAt, language)}
          </span>
        </div>
      ))}
    </div>
  );
}
