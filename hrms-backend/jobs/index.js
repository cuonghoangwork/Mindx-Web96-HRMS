import cron from "node-cron";
import { closeAttendanceDay } from "./closeAttendanceDay.js";
import { dateKeyInTz } from "../utils/workday.js";

export const SCHEDULER_TZ = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

let running = false;

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
  return task;
}

export default startScheduler;
