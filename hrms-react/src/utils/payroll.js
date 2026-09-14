/**
 * Money formatting shared by Payroll and the Salary tab. Each branch pins
 * its locale ("en-US" for USD, "vi-VN" for VND): grouping follows the
 * currency, not the in-app language.
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
