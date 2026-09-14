/**
 * Daily tenure sweep (DECISIONS.md D1, D2): a pending PromotionRequest for
 * every active employee past their threshold. Never promotes. Flags each
 * level transition at most once, ever — a rejection does not reset
 * levelStartDate, so without that rule it would re-fire daily; HR can still
 * propose manually.
 */

import EmployeeModel from "../model/Employee.js";
import PromotionRequestModel from "../model/PromotionRequest.js";
import PositionLevelModel from "../model/PositionLevel.js";
import { notifyHR } from "../utils/notify.js";
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

    const alreadyFlagged = await PromotionRequestModel.findOne({
      employee: employee._id,
      systemGenerated: true,
      proposedPositionLevel: nextLevel,
    });
    if (alreadyFlagged) continue;

    // Same one-pending rule the manual create endpoint enforces.
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
      link: "/employees",
      linkLabel: "Review promotion queue",
      titleKey: "promotionEligibilityFlagged",
      messageKey: "promotionEligibilityFlagged",
      params: { employeeName: employee.name, nextLevel },
    });
  }

  return { checked, flagged };
}
