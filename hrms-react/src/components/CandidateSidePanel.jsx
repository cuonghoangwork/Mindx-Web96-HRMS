import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Avatar from "./Avatar";
import { CandidateStageBadge } from "./Badge";
import Button from "./Button";

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
// Task 5.3 — same 10MB cap as employee contract uploads (ViewEmployee.jsx's
// ContractCard) for consistency; a CV is a comparably-sized PDF.
const MAX_CV_BYTES = 10 * 1024 * 1024;

function StarRating({ rating }) {
  const full = Math.round(rating);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1.9 9.2l7.1-.6z"
            fill={i < full ? "var(--clr-warning-400)" : "var(--bdr-default)"}
          />
        </svg>
      ))}
      <span style={{ marginLeft: "4px", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function CandidateSidePanel({ candidate, jobTitle, onClose, onStageChange, onDelete, onUploadCv }) {
  const { t } = useTranslation();
  if (!candidate) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "100%",
          maxWidth: "420px",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--bdr-subtle)",
          boxShadow: "var(--shadow-xl)",
          padding: "var(--sp-6)",
          overflowY: "auto",
          animation: "slideInRight 0.2s ease-out",
        }}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-6)" }}>
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)" }}>{t("candidates.panel.title")}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("candidates.panel.close")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginBottom: "var(--sp-6)" }}>
          <Avatar name={candidate.name} size="lg" />
          <div>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
              {candidate.name}
            </div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
              {candidate.role}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          <InfoRow label={t("candidates.panel.appliedFor")} value={jobTitle ?? candidate.role} />
          <InfoRow label={t("candidates.panel.email")} value={candidate.email} />
          <InfoRow label={t("candidates.panel.phone")} value={candidate.phone} />
          <InfoRow label={t("candidates.panel.appliedDate")} value={candidate.appliedDate} />
          <InfoRow
            label={t("candidates.panel.rating")}
            value={<StarRating rating={candidate.rating} />}
          />
          <InfoRow
            label={t("candidates.panel.resume")}
            value={
              <ResumeField candidate={candidate} onUploadCv={onUploadCv} />
            }
          />

          <div className="form-group" style={{ marginTop: "var(--sp-2)" }}>
            <label className="form-label" htmlFor="stage-select">
              {t("candidates.panel.pipelineStage")}
            </label>
            <select
              id="stage-select"
              value={candidate.stage}
              onChange={(e) => onStageChange(candidate.id, e.target.value)}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`common.candidateStages.${stage}`, { defaultValue: stage })}
                </option>
              ))}
            </select>
            <div style={{ marginTop: "var(--sp-2)" }}>
              <CandidateStageBadge stage={candidate.stage} />
            </div>
          </div>

          {candidate.notes && (
            <div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "var(--ls-widest)", marginBottom: "var(--sp-1)" }}>
                {t("candidates.panel.notes")}
              </div>
              <div style={{ fontSize: "var(--fs-md)", color: "var(--txt-primary)", lineHeight: "var(--lh-relaxed)" }}>
                {candidate.notes}
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <Button
            variant="secondary"
            style={{ color: "var(--txt-danger)" }}
            onClick={() => {
              onDelete(candidate.id);
              onClose();
            }}
          >
            {t("candidates.panel.removeCandidate")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("candidates.panel.done")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Task 5.3 — real PDF CV upload, wired the same way as ViewEmployee.jsx's
// ContractCard (file input hidden behind a Button, 10MB/PDF-only client
// check before hitting the server, inline error message on failure).
function ResumeField({ candidate, onUploadCv }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(t("candidates.panel.cvTypeError"));
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      setError(t("candidates.panel.cvSizeError"));
      return;
    }

    setError("");
    setUploading(true);
    try {
      await onUploadCv?.(candidate.id, file);
    } catch (err) {
      setError(err.message || t("candidates.panel.cvUploadError"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        {candidate.resumeUploadedAt ? (
          <a
            href={candidate.resumeUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--txt-primary-brand)" }}
          >
            {t("candidates.panel.viewResume")}
          </a>
        ) : (
          <span style={{ color: "var(--txt-secondary)" }}>{t("candidates.panel.noCv")}</span>
        )}

        {onUploadCv && (
          <>
            <Button
              variant="secondary"
              style={{ padding: "4px 12px", fontSize: "var(--fs-xs)" }}
              onClick={handlePick}
              disabled={uploading}
            >
              {uploading
                ? t("candidates.panel.uploading")
                : candidate.resumeUploadedAt
                  ? t("candidates.panel.replaceCv")
                  : t("candidates.panel.uploadCv")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </>
        )}
      </div>
      {error && (
        <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  const { t } = useTranslation();
  return (
    <div>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "var(--ls-widest)", marginBottom: "var(--sp-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--fs-md)", color: "var(--txt-primary)" }}>
        {value || t("candidates.panel.noValue")}
      </div>
    </div>
  );
}

export default CandidateSidePanel;
