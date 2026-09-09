import { useTranslation } from "react-i18next";
import { STEPS } from './stepIcons'

/* ─────────────────────────────────
   Stepper header
───────────────────────────────── */
export function StepperHeader({ step, completedSteps, onJump }) {
  const { t } = useTranslation();
  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  return (
    <div style={{ marginBottom: "var(--sp-8)" }}>
      {/* Progress bar */}
      <div style={{ position: "relative", height: "4px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", marginBottom: "var(--sp-6)" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "4px",
          background: "var(--clr-primary-400)",
          borderRadius: "var(--radius-full)",
          width: `${pct}%`,
          transition: "width 0.45s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: "var(--sp-2)" }}>
        {STEPS.map((s) => {
          const done    = completedSteps.has(s.id) && s.id < step;
          const current = s.id === step;
          const canJump = done;
          return (
            <div
              key={s.id}
              onClick={() => canJump && onJump(s.id)}
              role={canJump ? "button" : undefined}
              tabIndex={canJump ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && canJump && onJump(s.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                cursor: canJump ? "pointer" : "default",
                opacity: !done && !current ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {/* Circle */}
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%",
                display: "grid", placeItems: "center",
                background: done ? "var(--clr-primary-400)" : current ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                border: `2px solid ${done ? "var(--clr-primary-400)" : current ? "var(--clr-primary-400)" : "var(--bdr-default)"}`,
                boxShadow: current ? "0 0 0 4px var(--bg-primary-subtle)" : "none",
                transition: "all 0.25s",
                color: done ? "white" : current ? "var(--clr-primary-400)" : "var(--txt-secondary)",
              }}>
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : s.icon}
              </div>

              {/* Label */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "var(--fs-xs)", lineHeight: 1.3,
                  fontWeight: current ? "var(--fw-semibold)" : "var(--fw-regular)",
                  color: current ? "var(--txt-primary-brand)" : done ? "var(--txt-primary)" : "var(--txt-secondary)",
                }}>{t(`employees.addEmployee.steps.${s.key}.label`, { defaultValue: s.label })}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-disabled)", marginTop: "1px" }}>{t(`employees.addEmployee.steps.${s.key}.desc`, { defaultValue: s.desc })}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
