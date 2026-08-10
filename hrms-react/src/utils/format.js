/**
 * format.js — task 6.6 (locale-aware date/number formatting).
 *
 * Thin wrappers around Intl.DateTimeFormat / Intl.NumberFormat that map the
 * app's `language` value (from LanguageContext — "en" | "vi") to a real BCP
 * 47 locale tag, so date/number grouping actually follows the in-app
 * language toggle instead of whatever the browser/OS happens to be set to
 * (the previous `.toLocaleDateString()` / `.toLocaleString()` calls with no
 * locale argument silently used system locale, which stayed English even
 * after switching the app to Vietnamese).
 *
 * VND amounts are a deliberate exception: they already format with the
 * "vi-VN" locale unconditionally (see Payroll.jsx's fmtMoney/fmtMoneyK) —
 * that's a currency convention (VND is always grouped the Vietnamese way),
 * not a UI-language one, so it's intentionally left alone here. This module
 * covers the USD/generic-number and date formatting that previously ignored
 * the language toggle entirely.
 */

const LOCALE_MAP = { en: "en-US", vi: "vi-VN" };

export function localeFor(language) {
  return LOCALE_MAP[language] ?? LOCALE_MAP.en;
}

/**
 * formatDate — medium-style localized date ("Aug 11, 2026" / "11 thg 8, 2026").
 * @param {Date|string|number} value
 * @param {string} language - "en" | "vi" (from useLanguage())
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatDate(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(localeFor(language), options ?? {
    year: "numeric", month: "short", day: "numeric",
  });
}

/** formatDateTime — same as formatDate but with a time component. */
export function formatDateTime(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(localeFor(language), options ?? {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** formatTime — locale-aware time-of-day only (used by HeaderDateTime's clock). */
export function formatTime(value, language, options) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(localeFor(language), options ?? {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** formatNumber — locale-aware grouping for a plain number (no currency symbol). */
export function formatNumber(value, language, options) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(localeFor(language), options);
}

/**
 * formatUsd — USD-denominated figures (salaries, budgets) with locale-aware
 * grouping. Keeps the plain "$" prefix used throughout the app rather than
 * Intl's currency style (which would print "US$" for vi-VN) to match the
 * existing `$${n.toLocaleString()}` look everywhere else in the UI.
 */
export function formatUsd(value, language) {
  const n = Number(value);
  if (Number.isNaN(n) || value === null || value === undefined || value === "") return "—";
  return `$${formatNumber(n, language)}`;
}
