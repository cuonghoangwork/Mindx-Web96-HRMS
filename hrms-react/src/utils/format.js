/**
 * Intl wrappers that map the app's `language` ("en" | "vi") to a BCP 47
 * locale, so dates and numbers follow the in-app toggle rather than the OS.
 * VND is the exception: always "vi-VN" grouping (a currency convention, not
 * a UI-language one) — see Payroll.jsx's fmtMoney.
 */

const LOCALE_MAP = { en: "en-US", vi: "vi-VN" };

export function localeFor(language) {
  return LOCALE_MAP[language] ?? LOCALE_MAP.en;
}

// A bare "YYYY-MM-DD" parses as UTC midnight and would roll back a day west of UTC.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "Aug 11, 2026" / "11 thg 8, 2026". */
export function formatDate(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date
    ? value
    : new Date(typeof value === "string" && DATE_ONLY_RE.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(localeFor(language), options ?? {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatDateTime(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(localeFor(language), options ?? {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatTime(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(localeFor(language), options ?? {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function formatNumber(value, language, options) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(localeFor(language), options);
}

/** Plain "$" prefix rather than Intl's currency style, which prints "US$" for vi-VN. */
export function formatUsd(value, language) {
  const n = Number(value);
  if (Number.isNaN(n) || value === null || value === undefined || value === "") return "—";
  return `$${formatNumber(n, language)}`;
}
