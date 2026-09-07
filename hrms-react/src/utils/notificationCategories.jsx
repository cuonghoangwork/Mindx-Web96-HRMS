/**
 * notificationCategories.jsx — the per-category label, colour and icon used by
 * the Notifications page, plus the filter tabs derived from it.
 *
 * Its own module for two reasons. It has to be importable by a test without
 * dragging in the whole page, and exporting a non-component from
 * pages/Notifications.jsx would trip the react-refresh lint rule that this
 * codebase runs at --max-warnings 0.
 *
 * KEYS ARE CLIENT-SIDE CATEGORY VALUES, which are not quite the database's:
 * hrms-backend/utils/mappers.js bridges db "hiring" <-> client "interview".
 * Every other value passes through unchanged.
 *
 * Missing an entry is silent, not loud — the page falls back to the `system`
 * styling, so the category renders as a grey "System" row with a gear icon and
 * gets no filter tab of its own. `performance` sat in exactly that state from
 * the day it was added until 2026-09-07. tests/notificationCategories.test.jsx
 * ties these keys to the i18n labels, and the backend's notifyI18n test ties
 * those labels to the model enum, so the chain from database value to rendered
 * tab is now covered end to end.
 */

export const CATEGORY_CONFIG = {
  leave: {
    labelKey: "notifications.categories.leave", color: "var(--clr-warning-500)", bg: "var(--bg-warning-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  // Its own category rather than folding into `leave`: the two are tuned
  // separately in the backend's utils/notifyPolicy.js, and this object also
  // drives FILTERS below — so sharing a key would hide overtime behind a tab
  // labelled "Leave". Purple is the one semantic pair not already spoken for
  // here, and unlike `danger` it does not read as "something went wrong".
  overtime: {
    labelKey: "notifications.categories.overtime", color: "var(--txt-purple)", bg: "var(--bg-purple-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  // In the model enum and in notifyPolicy with all three out-of-app channels
  // since the day performance reviews shipped, but never listed here — so
  // every review notice rendered as a grey "System" row with a gear icon and
  // there was no Performance tab to filter by. Nothing errored; the
  // `?? CATEGORY_CONFIG.system` fallback below made it look deliberate.
  //
  // Green is already payroll's, and this is the second reuse in the map (info
  // serves both hiring and holiday). With six colour families and nine
  // categories the icon has to carry the difference — a star reads as a
  // rating, which no other row here could be mistaken for.
  performance: {
    labelKey: "notifications.categories.performance", color: "var(--clr-success-500)", bg: "var(--bg-success-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9z" />
      </svg>
    ),
  },
  interview: {
    labelKey: "notifications.categories.interview", color: "var(--clr-info-500)", bg: "var(--bg-info-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  payroll: {
    labelKey: "notifications.categories.payroll", color: "var(--clr-success-500)", bg: "var(--bg-success-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-5 2.5-5 5 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
      </svg>
    ),
  },
  employee: {
    labelKey: "notifications.categories.employee", color: "var(--clr-primary-400)", bg: "var(--bg-primary-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  holiday: {
    labelKey: "notifications.categories.holiday", color: "var(--clr-info-500)", bg: "var(--bg-info-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
  system: {
    labelKey: "notifications.categories.system", color: "var(--txt-secondary)", bg: "var(--bg-surface-sub)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
      </svg>
    ),
  },
  announcement: {
    labelKey: "notifications.categories.announcement", color: "var(--clr-primary-400)", bg: "var(--bg-primary-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a2 2 0 0 1-3.2 2.4L6 16" />
      </svg>
    ),
  },
};

export const FILTERS = [
  { key: "all", labelKey: "notifications.filters.all" },
  { key: "unread", labelKey: "notifications.filters.unread" },
  ...Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => ({ key, labelKey: cfg.labelKey })),
];
