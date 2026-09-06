/**
 * notifyI18n.js — renders a notification's copy server-side.
 *
 * In-app notifications are translated in the browser, from the live UI
 * toggle, using hrms-react/src/i18n. A Telegram message has no browser to
 * ask, so anything leaving the app has to be rendered here against the
 * recipient's stored `User.language`.
 *
 * The bundles in ../i18n/ are a NARROW MIRROR of the frontend's
 * `notifications.generated` block — only the keys for categories that
 * utils/notifyPolicy.js actually lets out of the app (leave, performance),
 * which is 12 keys rather than all 51. They were generated from the
 * frontend files rather than retranslated, and
 * tests/notifyI18n.test.js fails if the two ever drift apart. When a
 * category is added to the policy table, copy its keys across and that test
 * will tell you if you missed one.
 *
 * Unknown key => the stored English literal. Every notification carries
 * `title`/`message` as plain text alongside the keys, so a missing
 * translation degrades to English rather than to an empty message.
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
  // A "YYYY-MM-DD" string is a calendar date, not an instant. Parsing it into
  // a Date first would reintroduce exactly the UTC-shift bug this codebase
  // already fixed twice — read the parts and be done.
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return language === "vi"
      ? `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
      : `${MONTHS.en[m - 1]} ${d}, ${y}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  // A real instant IS zone-sensitive, so pin it to company time rather than
  // whatever the server happens to be set to.
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

/**
 * Some params carry enum tokens rather than display text — translate those
 * before interpolating, or the sentence ends up half-English. Mirrors
 * localizeParams() in hrms-react/src/utils/notifications.js.
 */
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
  // An unknown placeholder is left visible rather than blanked: "{{days}}"
  // in a message is a bug someone will report, an empty gap is one nobody
  // notices.
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
