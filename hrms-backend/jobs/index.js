import cron from "node-cron";
import { closeAttendanceDay } from "./closeAttendanceDay.js";
import { checkPromotionEligibility } from "./checkPromotionEligibility.js";
import { generateMonthlyPayrollDraft } from "./generateMonthlyPayrollDraft.js";
import { runMonthlyPayroll } from "./runMonthlyPayroll.js";
import { annualSalaryRaise } from "./annualSalaryRaise.js";
import { dateKeyInTz } from "../utils/workday.js";

export const SCHEDULER_TZ = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

let running = false;
let promotionCheckRunning = false;
let monthlyPayrollDraftRunning = false;
let monthlyPayrollRunRunning = false;
let annualRaiseRunning = false;

async function runCloseAttendance() {
  if (running) {
    console.log("[scheduler] closeAttendanceDay skipped - previous run still in progress");
    return;
  }
  running = true;
  try {
    const dateKey = dateKeyInTz(new Date(), SCHEDULER_TZ);
    const result = await closeAttendanceDay({ dateKey });
    console.log("[scheduler] closeAttendanceDay", JSON.stringify(result));
  } catch (err) {
    console.error("[scheduler] closeAttendanceDay failed:", err.message);
  } finally {
    running = false;
  }
}

async function runPromotionEligibilityCheck() {
  if (promotionCheckRunning) {
    console.log("[scheduler] checkPromotionEligibility skipped - previous run still in progress");
    return;
  }
  promotionCheckRunning = true;
  try {
    const result = await checkPromotionEligibility({ asOf: new Date() });
    console.log("[scheduler] checkPromotionEligibility", JSON.stringify(result));
  } catch (err) {
    console.error("[scheduler] checkPromotionEligibility failed:", err.message);
  } finally {
    promotionCheckRunning = false;
  }
}

async function runMonthlyPayrollDraft() {
  if (monthlyPayrollDraftRunning) {
    console.log("[scheduler] generateMonthlyPayrollDraft skipped - previous run still in progress");
    return;
  }
  monthlyPayrollDraftRunning = true;
  try {
    const result = await generateMonthlyPayrollDraft({ asOf: new Date() });
    console.log("[scheduler] generateMonthlyPayrollDraft", JSON.stringify(result));
  } catch (err) {
    console.error("[scheduler] generateMonthlyPayrollDraft failed:", err.message);
  } finally {
    monthlyPayrollDraftRunning = false;
  }
}

async function runMonthlyPayrollRun() {
  if (monthlyPayrollRunRunning) {
    console.log("[scheduler] runMonthlyPayroll skipped - previous run still in progress");
    return;
  }
  monthlyPayrollRunRunning = true;
  try {
    const result = await runMonthlyPayroll({ asOf: new Date() });
    console.log("[scheduler] runMonthlyPayroll", JSON.stringify(result));
  } catch (err) {
    console.error("[scheduler] runMonthlyPayroll failed:", err.message);
  } finally {
    monthlyPayrollRunRunning = false;
  }
}

async function runAnnualSalaryRaise() {
  if (annualRaiseRunning) {
    console.log("[scheduler] annualSalaryRaise skipped - previous run still in progress");
    return;
  }
  annualRaiseRunning = true;
  try {
    const result = await annualSalaryRaise({ asOf: new Date() });
    console.log("[scheduler] annualSalaryRaise", JSON.stringify(result));
  } catch (err) {
    console.error("[scheduler] annualSalaryRaise failed:", err.message);
  } finally {
    annualRaiseRunning = false;
  }
}

export function startScheduler() {
  if (process.env.ENABLE_SCHEDULER === "false" || process.env.NODE_ENV === "test") {
    console.log("[scheduler] disabled");
    return null;
  }

  const expression = process.env.CRON_CLOSE_ATTENDANCE || "0 22 * * *";
  if (!cron.validate(expression)) {
    console.error(`[scheduler] invalid cron expression: ${expression} - scheduler not started`);
    return null;
  }

  const task = cron.schedule(expression, runCloseAttendance, { timezone: SCHEDULER_TZ });
  console.log(`[scheduler] closeAttendanceDay scheduled "${expression}" (${SCHEDULER_TZ})`);

  // Runs once daily, well clear of closeAttendanceDay's own run — the two
  // jobs share no state, but there's no reason to have them race either.
  const promotionExpression = process.env.CRON_PROMOTION_ELIGIBILITY || "0 2 * * *";
  let promotionTask = null;
  if (!cron.validate(promotionExpression)) {
    console.error(`[scheduler] invalid cron expression: ${promotionExpression} - promotion eligibility check not started`);
  } else {
    promotionTask = cron.schedule(promotionExpression, runPromotionEligibilityCheck, { timezone: SCHEDULER_TZ });
    console.log(`[scheduler] checkPromotionEligibility scheduled "${promotionExpression}" (${SCHEDULER_TZ})`);
  }

  // Tasks 3.8/3.9: FX snapshot + payroll draft, once at the start of the
  // month. Default "0 1 1 * *" = 01:00 on the 1st, well clear of both jobs
  // above and a full 9 days ahead of the 10th-of-month official run (3.5).
  const monthlyPayrollDraftExpression = process.env.CRON_MONTHLY_PAYROLL_DRAFT || "0 1 1 * *";
  let monthlyPayrollDraftTask = null;
  if (!cron.validate(monthlyPayrollDraftExpression)) {
    console.error(`[scheduler] invalid cron expression: ${monthlyPayrollDraftExpression} - monthly payroll draft not started`);
  } else {
    monthlyPayrollDraftTask = cron.schedule(monthlyPayrollDraftExpression, runMonthlyPayrollDraft, {
      timezone: SCHEDULER_TZ,
    });
    console.log(
      `[scheduler] generateMonthlyPayrollDraft scheduled "${monthlyPayrollDraftExpression}" (${SCHEDULER_TZ})`,
    );
  }

  const monthlyPayrollRunExpression = process.env.CRON_MONTHLY_PAYROLL_RUN || "0 3 10 * *";
  let monthlyPayrollRunTask = null;
  if (!cron.validate(monthlyPayrollRunExpression)) {
    console.error(`[scheduler] invalid cron expression: ${monthlyPayrollRunExpression} - monthly payroll run not started`);
  } else {
    monthlyPayrollRunTask = cron.schedule(monthlyPayrollRunExpression, runMonthlyPayrollRun, {
      timezone: SCHEDULER_TZ,
    });
    console.log(
      `[scheduler] runMonthlyPayroll scheduled "${monthlyPayrollRunExpression}" (${SCHEDULER_TZ})`,
    );
  }

  const annualRaiseExpression = process.env.CRON_ANNUAL_RAISE || "0 4 * * *";
  let annualRaiseTask = null;
  if (!cron.validate(annualRaiseExpression)) {
    console.error(`[scheduler] invalid cron expression: ${annualRaiseExpression} - annual salary raise not started`);
  } else {
    annualRaiseTask = cron.schedule(annualRaiseExpression, runAnnualSalaryRaise, {
      timezone: SCHEDULER_TZ,
    });
    console.log(`[scheduler] annualSalaryRaise scheduled "${annualRaiseExpression}" (${SCHEDULER_TZ})`);
  }

  return {
    closeAttendanceTask: task,
    promotionEligibilityTask: promotionTask,
    monthlyPayrollDraftTask,
    monthlyPayrollRunTask,
    annualRaiseTask,
  };
}

export default startScheduler;
