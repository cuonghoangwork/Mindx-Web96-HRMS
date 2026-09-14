/**
 * Renders a notification's copy server-side, for the channels that have no
 * browser to translate in. The bundles in ../i18n/ are a narrow mirror of the
 * frontend's `notifications.generated` block — only the keys for categories
 * utils/notifyPolicy.js lets out of the app — and tests/notifyI18n.test.js
 * fails if the two drift. An unknown key falls back to the stored English.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { APP_TIMEZONE } from "./workday.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadBundle(language) {
  return JSON.parse(readFileSync(path.join(here, "..", "i18n", `notifications.${language}.json`), "utf8"));
}

const BUNDLES = { en: loadBundle("en"), vi: loadBundle("vi") };

export const SUPPORTED_LANGUAGES = Object.keys(BUNDLES);

/** Params whose value is a date, matching the frontend's own rule. */
const DATE_PARAM_RE = /(^date$|Date$)/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function formatDate(value, language) {
  // A "YYYY-MM-DD" string is a calendar date, not an instant — never parse it into a Date.
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return language === "vi"
      ? `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
      : `${MONTHS.en[m - 1]} ${d}, ${y}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  // A real instant is zone-sensitive: pin it to company time.
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

/** Translates enum-token params before interpolating; mirrors localizeParams() in the frontend. */
function localizeParams(params, bundle, language) {
  if (!params) return {};
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value != null && DATE_PARAM_RE.test(key)) out[key] = formatDate(value, language);
    else if (key === "leaveType") out[key] = bundle.labels.leaveType[value] ?? value;
    else if (key === "resolution") out[key] = bundle.labels.resolution[value] ?? value;
    else if (key === "rateSource") out[key] = bundle.labels.rateSource[value] ?? value;
    else out[key] = value;
  }
  return out;
}

function interpolate(template, params) {
  // An unknown placeholder stays visible: "{{days}}" gets reported, a blank gap does not.
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    params[key] === undefined || params[key] === null ? whole : String(params[key]),
  );
}

export function languageFor(user) {
  const language = user?.language;
  return BUNDLES[language] ? language : "en";
}

/** Label for the "open this in the app" button on an out-of-app message. */
export function openInAppLabel(language = "en") {
  return (BUNDLES[language] ?? BUNDLES.en).labels.openInApp;
}

/** Why-am-I-getting-this line, required on anything that lands in an inbox. */
export function emailFooter(language = "en") {
  return (BUNDLES[language] ?? BUNDLES.en).labels.emailFooter;
}

/**
 * @param {object} doc  a Notification document (or its client shape)
 * @param {"en"|"vi"} language
 * @returns {{ title: string, message: string }}
 */
export function renderNotification(doc, language = "en") {
  if (!doc) return { title: "", message: "" };
  const bundle = BUNDLES[language] ?? BUNDLES.en;
  const params = localizeParams(doc.params, bundle, language);

  const titleEntry = doc.titleKey ? bundle.generated[doc.titleKey] : null;
  const messageEntry = doc.messageKey ? bundle.generated[doc.messageKey] : null;

  return {
    title: titleEntry?.title ? interpolate(titleEntry.title, params) : (doc.title ?? ""),
    message: messageEntry?.message ? interpolate(messageEntry.message, params) : (doc.message ?? ""),
  };
}

export default renderNotification;
