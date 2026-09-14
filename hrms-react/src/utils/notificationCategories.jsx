/**
 * Per-category label, colour and icon for the Notifications page, plus the
 * filter tabs derived from it. Its own module so tests import it without the
 * page (a non-component export from a page trips react-refresh).
 *
 * Keys are CLIENT category values (db "hiring" is client "interview"). A
 * missing entry silently falls back to the `system` styling and gets no
 * tab; tests/notificationCategories.test.jsx ties these keys to the i18n
 * labels, and the backend's notifyI18n test ties those to the model enum.
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
  // Its own key, or overtime would hide behind a tab labelled "Leave".
  overtime: {
    labelKey: "notifications.categories.overtime", color: "var(--txt-purple)", bg: "var(--bg-purple-subtle)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  // Shares payroll's green; the star icon carries the difference.
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
