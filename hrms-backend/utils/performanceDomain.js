import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import PerformanceReviewModel from "../model/PerformanceReview.js";
import { emitNotification } from "./notify.js";
import { computeAnalytics, computeAppealRate } from "./performanceAnalytics.js";
import { loadCycleOrThrow } from "./performanceCycles.js";
import { evaluateAccess } from "./performanceScope.js";
import { assertObjectId } from "./performanceMappers.js";
import { AppError } from "./appError.js";

/**
 * Performance domain helpers — loading, scoping and notifying. No Express.
 *
 * Lifted out of performanceController.js (B3: "leave the controller doing HTTP
 * only"), which held these ahead of its 18 handlers.
 *
 * THIS ALSO BREAKS A CYCLE. findUserForEmployee used to be exported from the
 * controller purely so jobs/performanceReminders.js could import it — while
 * the controller imported sendPerformanceReminders back from that same job.
 * The controller carried a comment explaining why the cycle was safe. It no
 * longer needs one: the job now imports this module instead, so the dependency
 * runs controller -> job -> utils and never back. A job depending on a
 * controller was the wrong direction to begin with.
 */

export const REVIEW_LINK = "/performance";
export const REVIEW_LINK_LABEL = "Open review";

export function assertCycleOpen(cycle) {
  if (cycle.status !== "Open") {
    const err = new AppError(
      "This review cycle is closed. Ask an admin to reopen it before making changes.",
      "PERFORMANCE_CYCLE_CLOSED",
    );
    err.status = 409;
    throw err;
  }
}

async function loadEmployeeOrThrow(employeeId) {
  assertObjectId(employeeId, "Employee id");
  const employee = await EmployeeModel.findById(
    employeeId,
    "name email employeeId department",
  ).populate("department", "name");
  if (!employee) {
    const err = new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  return employee;
}

export async function loadReviewContext(req) {
  const cycle = await loadCycleOrThrow(req.params.cycleKey);
  const employee = await loadEmployeeOrThrow(req.params.employeeId);
  const access = await evaluateAccess(req, employee);
  return { cycle, employee, access };
}

export async function loadScopedReviewData(cycleKey, employeeCondition) {
  if (!employeeCondition) return { employees: [], reviews: [] };

  const employees = await EmployeeModel.find(employeeCondition, "name employeeId department")
    .populate("department", "name")
    .sort({ name: 1 });
  if (!employees.length) return { employees, reviews: [] };

  const reviews = await PerformanceReviewModel.find({
    cycleKey,
    employee: { $in: employees.map((employee) => employee._id) }
  });
  return { employees, reviews };
}

/** computeAnalytics + appeal rate for one cycle — the pair every comparison
 * side (current and previous) needs. No department breakdown; comparison is
 * about cycle-over-cycle deltas, not a per-department view. */
export async function computeCycleStats(cycleKey, employeeCondition) {
  const { employees, reviews } = await loadScopedReviewData(cycleKey, employeeCondition);
  return {
    ...computeAnalytics({ employees, reviews, includeDeptCompare: false }),
    appealRate: computeAppealRate(reviews, employees.length)
  };
}

export async function findUserForEmployee(employee) {
  return UserModel.findOne(
    { $or: [{ employee: employee._id }, { email: employee.email }] },
    "_id",
  );
}

export async function broadcastCycleOpen(cycle) {
  try {
    await emitNotification({
      audience: "all",
      category: "performance",
      title: "Review cycle open",
      message: `${cycle.label} is now open for performance reviews.`,
      link: REVIEW_LINK,
      linkLabel: REVIEW_LINK_LABEL,
      titleKey: "reviewCycleOpen",
      messageKey: "reviewCycleOpen",
      params: { cycleLabel: cycle.label }
    });
  } catch (err) {
    console.error("[performance] Failed to broadcast cycle status:", err.message);
  }
}

export async function notifyUsers(userIds, payload) {
  await Promise.all(
    userIds.map((userId) =>
      emitNotification({
        user: userId,
        category: "performance",
        title: payload.title,
        message: payload.message,
        link: REVIEW_LINK,
        linkLabel: REVIEW_LINK_LABEL,
        titleKey: payload.titleKey,
        messageKey: payload.messageKey,
        params: payload.params
      }).catch((err) =>
        console.error("[performance] Failed to create notification:", err.message),
      ),
    ),
  );
}
