/**
 * payroll.js — shared money-formatting helpers.
 *
 * Extracted from pages/Payroll.jsx (8.0e Day 8) so the Employee Detail
 * "Salary" tab (ViewEmployee.jsx) can format figures identically instead of
 * duplicating the VND/USD logic.
 *
 * Task 6.6 — both branches pin an explicit locale ("en-US" for USD, "vi-VN"
 * for VND) rather than a bare `.toLocaleString()`, which would silently
 * inherit whatever locale the browser/OS happens to be set to. Currency
 * grouping follows the currency, not the in-app language toggle.
 */
export function fmtMoney(vnd, currency, fxRate) {
  const n = Number(vnd) || 0;
  if (currency === "USD" && fxRate > 0) {
    return `$${Math.round(n / fxRate).toLocaleString("en-US")}`;
  }
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

export function fmtMoneyK(vnd, currency, fxRate) {
  const n = Number(vnd) || 0;
  if (currency === "USD" && fxRate > 0) {
    const usd = n / fxRate;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${Math.round(usd)}`;
  }
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} triệu ₫`;
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}
