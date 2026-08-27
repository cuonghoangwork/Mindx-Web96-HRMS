import EmployeeModel from "../model/Employee.js";
import PromotionRequestModel from "../model/PromotionRequest.js";
import { notifyHR } from "../controller/notificationController.js";
import { monthsBetween } from "../utils/positionLadder.js";

export const ANNUAL_RAISE_RATE = 0.1;

export function anniversaryOf(startedAt, years) {
  const anniversary = new Date(startedAt);
  anniversary.setFullYear(anniversary.getFullYear() + years);
  anniversary.setHours(0, 0, 0, 0);
  return anniversary;
}

export async function annualSalaryRaise({ asOf = new Date() } = {}) {
  const employees = await EmployeeModel.find({ status: "active" }).populate("department", "name");

  let checked = 0;
  let proposed = 0;

  for (const employee of employees) {
    checked += 1;

    const currentSalary = Number(employee.annualSalary);
    if (!Number.isFinite(currentSalary) || currentSalary <= 0) continue;

    const years = Math.floor(monthsBetween(employee.createdAt, asOf) / 12);
    if (years < 1) continue;

    const anniversary = anniversaryOf(employee.createdAt, years);

    const alreadyProposed = await PromotionRequestModel.findOne({
      employee: employee._id,
      systemGenerated: true,
      proposedPositionLevel: null,
      createdAt: { $gte: anniversary },
    });
    if (alreadyProposed) continue;

    const pendingAny = await PromotionRequestModel.findOne({
      employee: employee._id,
      status: "pending",
    });
    if (pendingAny) continue;

    await PromotionRequestModel.create({
      employee: employee._id,
      requestedBy: null,
      systemGenerated: true,
      status: "pending",
      currentDesignation: employee.designation ?? null,
      currentDepartmentName: employee.department?.name ?? null,
      currentAnnualSalary: currentSalary,
      currentPositionLevel: employee.positionLevel,
      proposedAnnualSalary: Math.round(currentSalary * (1 + ANNUAL_RAISE_RATE)),
      effectiveDate: anniversary,
      reason: `Auto-flagged: completed ${years} year${years === 1 ? "" : "s"} of service — proposed ${Math.round(ANNUAL_RAISE_RATE * 100)}% annual raise.`,
      appliedAt: asOf,
    });
    proposed += 1;

    notifyHR({
      title: "Annual raise awaiting review",
      message: `${employee.name} has completed ${years} year${years === 1 ? "" : "s"} of service. A ${Math.round(ANNUAL_RAISE_RATE * 100)}% raise has been proposed for review.`,
      category: "employee",
      link: "/employees",
      linkLabel: "Review promotion queue",
      titleKey: "annualRaiseAwaiting",
      messageKey: "annualRaiseAwaiting",
      params: { employeeName: employee.name, years, percent: Math.round(ANNUAL_RAISE_RATE * 100) },
    });
  }

  return { checked, proposed };
}

export default annualSalaryRaise;
