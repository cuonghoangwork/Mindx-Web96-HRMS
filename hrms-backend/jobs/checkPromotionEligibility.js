/**
 * checkPromotionEligibility.js — scheduled Position Ladder check (task 2.4).
 *
 * Runs daily (registered in jobs/index.js alongside closeAttendanceDay).
 * For every active employee, checks whether they've completed the tenure
 * threshold for their current level (utils/positionLadder.js) and, if so,
 * auto-creates a *pending* PromotionRequest for HR to review.
 *
 * Explicitly NEVER auto-promotes — per HRMS_IMPROVEMENT_TASKS.md 2.4, this
 * changes salary and title, higher stakes than the no-show case (4.7), so
 * it only ever flags for human review, same as the no-show queue will.
 *
 * Dedup rule: an employee is flagged for a given level transition at most
 * once, ever — regardless of whether that flag is still pending or was
 * already approved/rejected. Without this, a rejected flag would re-fire
 * every single day forever, since rejecting a promotion doesn't reset the
 * employee's levelStartDate. If HR's rejection reason no longer applies
 * later, they can propose the promotion manually via the existing
 * HR-initiated flow (promotionRequestController.create) — that path is
 * untouched by this job.
 */

import EmployeeModel from "../model/Employee.js";
import PromotionRequestModel from "../model/PromotionRequest.js";
import PositionLevelModel from "../model/PositionLevel.js";
import { notifyHR } from "../controller/notificationController.js";
import { computeEligibility } from "../utils/positionLadder.js";

export async function checkPromotionEligibility({ asOf = new Date() } = {}) {
  const employees = await EmployeeModel.find({ status: "active" }).populate("department", "name");

  let flagged = 0;
  let checked = 0;

  for (const employee of employees) {
    checked += 1;
    const { eligible, nextLevel } = computeEligibility(
      employee.positionLevel,
      employee.levelStartDate,
      asOf,
    );
    if (!eligible || !nextLevel) continue;

    // Dedup: skip if this exact transition has ever been auto-flagged for
    // this employee before, in any status.
    const alreadyFlagged = await PromotionRequestModel.findOne({
      employee: employee._id,
      systemGenerated: true,
      proposedPositionLevel: nextLevel,
    });
    if (alreadyFlagged) continue;

    // Also skip if there's any other pending proposal in flight (manual or
    // automated) — matches the dedup rule the manual create endpoint
    // already enforces, so the two paths never race each other.
    const pendingAny = await PromotionRequestModel.findOne({
      employee: employee._id,
      status: "pending",
    });
    if (pendingAny) continue;

    const levelData = await PositionLevelModel.findOne({ level: nextLevel });
    const proposedAnnualSalary =
      levelData && levelData.baseSalary > (employee.annualSalary ?? 0)
        ? levelData.baseSalary
        : null;

    await PromotionRequestModel.create({
      employee: employee._id,
      requestedBy: null,
      systemGenerated: true,
      status: "pending",
      currentDesignation: employee.designation ?? null,
      currentDepartmentName: employee.department?.name ?? null,
      currentAnnualSalary: employee.annualSalary ?? 0,
      currentPositionLevel: employee.positionLevel,
      proposedPositionLevel: nextLevel,
      proposedAnnualSalary,
      reason: `Auto-flagged: reached the tenure threshold for ${nextLevel} while at ${employee.positionLevel}.`,
      appliedAt: asOf,
    });
    flagged += 1;

    notifyHR({
      title: "Promotion eligibility flagged",
      message: `${employee.name} is now eligible for promotion to ${nextLevel} and needs review.`,
      category: "employee",
      link: "/settings",
      linkLabel: "Review promotion queue",
    });
  }

  return { checked, flagged };
}
