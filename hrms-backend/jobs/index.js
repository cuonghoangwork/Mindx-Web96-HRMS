import cron from "node-cron";
import { closeAttendanceDay } from "./closeAttendanceDay.js";
import { checkPromotionEligibility } from "./checkPromotionEligibility.js";
import { dateKeyInTz } from "../utils/workday.js";

export const SCHEDULER_TZ = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

let running = false;
let promotionCheckRunning = false;

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

  return { closeAttendanceTask: task, promotionEligibilityTask: promotionTask };
}

export default startScheduler;
