import { formatDate } from "./format";
import { leaveTypeLabel } from "./leaveTypes";
import { getRoleLabel } from "./roles";
import { positionLevelLabel } from "./positionLevels";

const DATE_PARAM_RE = /(^date$|Date$)/;

// A handful of notification params carry raw, English-bearing enum tokens
// rather than plain data (dates, names, counts) — translate those before
// interpolating so the rest of the sentence isn't left half-English.
function localizeParams(params, t, language) {
  if (!params) return {};
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value != null && DATE_PARAM_RE.test(key)) {
      out[key] = formatDate(value, language);
    } else if (key === "leaveType") {
      out[key] = leaveTypeLabel(value, t);
    } else if (key === "nextLevel" || key === "newLevel") {
      out[key] = positionLevelLabel(value, t);
    } else if (key === "accountRole") {
      out[key] = getRoleLabel(value, t);
    } else if (key === "resolution") {
      out[key] = t(`notifications.generated.resolutionLabels.${value}`, { defaultValue: value });
    } else if (key === "rateSource") {
      out[key] = t(`notifications.generated.rateSourceLabels.${value}`, { defaultValue: value });
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Translates a system-generated Notification's title/message for the active
// language. Old notifications (created before this milestone) and the
// free-text HR/Admin "compose a notice" ones never carry titleKey/messageKey
// — those just render their stored literal text unchanged, in whatever
// language they were created in.
export function translateNotification(notification, t, language) {
  if (!notification) return { title: "", message: "" };
  const params = localizeParams(notification.params, t, language);

  const title = notification.titleKey
    ? t(`notifications.generated.${notification.titleKey}.title`, {
        ...params,
        defaultValue: notification.title,
      })
    : notification.title;

  const message = notification.messageKey
    ? t(`notifications.generated.${notification.messageKey}.message`, {
        ...params,
        defaultValue: notification.message,
      })
    : notification.message;

  return { title, message };
}
