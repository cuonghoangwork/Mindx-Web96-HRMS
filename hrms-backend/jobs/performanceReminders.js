/**
 * performanceReminders.js — task 5 (scheduled reminders).
 *
 * Runs daily (registered in jobs/index.js). For every Open review cycle
 * whose end date is within REMINDER_WINDOW_DAYS, fires role-aware
 * notifications: the employee (self review still pending), their
 * manager(s) (a pending-reports count), and HR/Admin (aggregate pending
 * count) — replacing the demo's localStorage "have I already notified"
 * hack with a real check against sent Notification records, so this can
 * run daily without re-spamming the same person for the same cycle.
 */

import EmployeeModel from "../model/Employee.js";
import NotificationModel from "../model/Notification.js";
import PerformanceCycleModel from "../model/PerformanceCycle.js";
import PerformanceReviewModel from "../model/PerformanceReview.js";
import { notifyHR } from "../controller/notificationController.js";
import { findUserForEmployee } from "../controller/performanceController.js";
import { daysUntil } from "../utils/performanceCycles.js";
import { departmentManagerUserIds } from "../utils/performanceScope.js";

const REVIEW_LINK = "/performance";
const REVIEW_LINK_LABEL = "Open review";
const REMINDER_WINDOW_DAYS = 7;

async function notifyOnceForUser(userId, { title, message, titleKey, messageKey, params }) {
  const existing = await NotificationModel.findOne({ user: userId, category: "performance", title });
  if (existing) return false;
  await NotificationModel.create({
    user: userId,
    category: "performance",
    title,
    message,
    link: REVIEW_LINK,
    linkLabel: REVIEW_LINK_LABEL,
    isCustom: false,
    titleKey: titleKey ?? null,
    messageKey: messageKey ?? null,
    params: params ?? null,
  });
  return true;
}

async function notifyHrOnce({ title, message, titleKey, messageKey, params }) {
  const existing = await NotificationModel.findOne({ user: null, audience: "hr", category: "performance", title });
  if (existing) return false;
  await notifyHR({
    title,
    message,
    category: "performance",
    link: REVIEW_LINK,
    linkLabel: REVIEW_LINK_LABEL,
    titleKey,
    messageKey,
    params,
  });
  return true;
}

export async function sendPerformanceReminders({ asOf = new Date() } = {}) {
  const openCycles = await PerformanceCycleModel.find({ status: "Open" });
  const dueSoonCycles = openCycles.filter((cycle) => {
    const days = daysUntil(cycle.end, asOf);
    return days !== null && days >= 0 && days <= REMINDER_WINDOW_DAYS;
  });

  let remindersSent = 0;

  for (const cycle of dueSoonCycles) {
    const days = daysUntil(cycle.end, asOf);
    const employees = await EmployeeModel.find({ status: { $ne: "terminated" } }, "name department");
    const reviews = await PerformanceReviewModel.find(
      { cycleKey: cycle.key },
      "employee selfSubmittedDate managerSubmittedDate",
    );
    const byEmployee = new Map(reviews.map((r) => [String(r.employee), r]));

    let pendingSelf = 0;
    let pendingManager = 0;
    const managerPendingCounts = new Map();

    for (const employee of employees) {
      const review = byEmployee.get(String(employee._id));

      if (!review?.selfSubmittedDate) {
        pendingSelf += 1;
        const user = await findUserForEmployee(employee);
        if (user) {
          const sent = await notifyOnceForUser(user._id, {
            title: `Self review reminder — ${cycle.key}`,
            message: `Your ${cycle.label} self review is due in ${days} day${days === 1 ? "" : "s"}.`,
            titleKey: "selfReviewReminder",
            messageKey: "selfReviewReminder",
            params: { cycleKey: cycle.key, cycleLabel: cycle.label, days },
          });
          if (sent) remindersSent += 1;
        }
      }

      if (!review?.managerSubmittedDate) {
        pendingManager += 1;
        const managerIds = await departmentManagerUserIds(employee.department);
        for (const managerId of managerIds) {
          const key = String(managerId);
          managerPendingCounts.set(key, (managerPendingCounts.get(key) ?? 0) + 1);
        }
      }
    }

    for (const [managerId, count] of managerPendingCounts) {
      const sent = await notifyOnceForUser(managerId, {
        title: `Manager review reminder — ${cycle.key}`,
        message: `You have ${count} pending manager review${count === 1 ? "" : "s"} for ${cycle.label}, due in ${days} day${days === 1 ? "" : "s"}.`,
        titleKey: "managerReviewReminder",
        messageKey: "managerReviewReminder",
        params: { cycleKey: cycle.key, cycleLabel: cycle.label, count, days },
      });
      if (sent) remindersSent += 1;
    }

    const totalPending = pendingSelf + pendingManager;
    if (totalPending > 0) {
      const sent = await notifyHrOnce({
        title: `Performance reviews due soon — ${cycle.key}`,
        message: `${totalPending} performance review action${totalPending === 1 ? "" : "s"} still pending for ${cycle.label}, due in ${days} day${days === 1 ? "" : "s"}.`,
        titleKey: "performanceReviewsDueSoon",
        messageKey: "performanceReviewsDueSoon",
        params: { cycleKey: cycle.key, cycleLabel: cycle.label, totalPending, days },
      });
      if (sent) remindersSent += 1;
    }
  }

  return { cyclesChecked: dueSoonCycles.length, remindersSent };
}

export default sendPerformanceReminders;
