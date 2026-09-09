import { useState, useEffect } from "react";

export function MoneyInput({ value, disabled, onCommit, currency = "VND", fxRate = 0 }) {
  // The figure stored on the payslip (`value`) is always VND. When the
  // topbar currency toggle is set to USD, this edits in USD instead — same
  // as every read-only money cell on this page (fmtMoney) — and converts
  // back to VND on commit rather than silently editing raw VND under a
  // "$" label.
  const isUsd = currency === "USD" && fxRate > 0;
  const toUnit = (vnd) => (isUsd ? Math.round((Number(vnd) || 0) / fxRate) : Math.round(Number(vnd) || 0));
  const toVnd = (unitAmount) => (isUsd ? Math.round(Number(unitAmount) * fxRate) : Number(unitAmount));

  const [draft, setDraft] = useState(String(toUnit(value)));
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setDraft(String(toUnit(value))); }, [value, isUsd, fxRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async () => {
    setFocused(false);
    if (saving || disabled) return;
    const next = draft.trim();
    const nextVnd = next === "" ? 0 : toVnd(next);
    if (next === "" || nextVnd === Number(value)) {
      setDraft(String(toUnit(value)));
      return;
    }
    setSaving(true);
    try {
      const ok = await onCommit(nextVnd);
      if (!ok) setDraft(String(toUnit(value)));
    } finally {
      setSaving(false);
    }
  };

  // These figures can run into the hundreds of millions/billions in VND —
  // showing raw digits at all times ("21800535693") is unreadable, so this
  // only shows the plain editable digits while focused and renders a
  // thousands-grouped, currency-matched preview otherwise (still a real
  // <input>, still fully editable — just formatted like every other money
  // figure on this page when you're not actively typing in it).
  const displayValue = focused ? draft : (Number(draft) || 0).toLocaleString(isUsd ? "en-US" : "vi-VN");

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)" }}>{isUsd ? "$" : "₫"}</span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        disabled={disabled || saving}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(String(toUnit(value))); e.currentTarget.blur(); }
        }}
        style={{
          width: "112px", padding: "5px 8px", textAlign: "right",
          border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)",
          background: disabled ? "var(--bg-surface-alt)" : "var(--bg-surface)",
          color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  );
}
