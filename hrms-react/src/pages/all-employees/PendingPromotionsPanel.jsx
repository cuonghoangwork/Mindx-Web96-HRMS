import { useTranslation } from "react-i18next";
import { formatDate } from "../../utils/format";
import Button from "../../components/Button";

const usdFmt = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US")}/yr`);

export function PendingPromotionsPanel({ requests, onReview }) {
  const { t } = useTranslation();
  if (requests.length === 0) return null;
  return (
    <div className="content-card" style={{ marginBottom: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <h3 className="section-title" style={{ margin: 0 }}>{t("employees.allEmployees.pendingPromotions.title", { defaultValue: "Pending promotions" })}</h3>
        <span className="badge badge-primary">{requests.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        {requests.map((req) => (
          <div key={req.id} style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: "var(--sp-4)", paddingBottom: "var(--sp-4)",
            borderBottom: "1px solid var(--bdr-subtle)", flexWrap: "wrap",
          }}>
            <div style={{ minWidth: "260px", flex: 1 }}>
              <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                {req.employeeName}
              </div>
              <div className="hint-sm">
                {req.proposed?.designation} · {req.proposed?.positionLevel} level
                {req.proposed?.salary != null && ` · ${usdFmt(req.proposed.salary)}`}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "4px" }}>
                {req.effectiveDate && t("employees.allEmployees.pendingPromotions.effective", { defaultValue: "Effective {{date}}", date: formatDate(req.effectiveDate) })}
                {req.effectiveDate && req.reason ? " · " : ""}
                {req.reason}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
              <Button variant="primary" size="sm" onClick={() => onReview(req.id, "approved")}>{t("common.actions.approve", { defaultValue: "Approve" })}</Button>
              <Button variant="danger" size="sm" onClick={() => onReview(req.id, "rejected")}>{t("common.actions.reject", { defaultValue: "Reject" })}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
