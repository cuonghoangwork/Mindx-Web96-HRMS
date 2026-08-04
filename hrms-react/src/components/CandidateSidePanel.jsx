import Avatar from "./Avatar";
import { CandidateStageBadge } from "./Badge";
import Button from "./Button";

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

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

function CandidateSidePanel({ candidate, jobTitle, onClose, onStageChange, onDelete }) {
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
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)" }}>Candidate Profile</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
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
          <InfoRow label="Applied for" value={jobTitle ?? candidate.role} />
          <InfoRow label="Email" value={candidate.email} />
          <InfoRow label="Phone" value={candidate.phone} />
          <InfoRow label="Applied Date" value={candidate.appliedDate} />
          <InfoRow
            label="Rating"
            value={<StarRating rating={candidate.rating} />}
          />
          <InfoRow
            label="Resume"
            value={
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--txt-primary-brand)" }}
              >
                View Resume
              </a>
            }
          />

          <div className="form-group" style={{ marginTop: "var(--sp-2)" }}>
            <label className="form-label" htmlFor="stage-select">
              Pipeline Stage
            </label>
            <select
              id="stage-select"
              value={candidate.stage}
              onChange={(e) => onStageChange(candidate.id, e.target.value)}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
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
                Notes
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
            Remove Candidate
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "var(--ls-widest)", marginBottom: "var(--sp-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--fs-md)", color: "var(--txt-primary)" }}>
        {value || "—"}
      </div>
    </div>
  );
}

export default CandidateSidePanel;
