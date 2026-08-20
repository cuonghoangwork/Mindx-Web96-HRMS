import PerformanceCycleModel from "../model/PerformanceCycle.js";
import { endOfUtcDay, utcDateKey, utcMidnight } from "./workday.js";

export const STANDARD_HISTORY = 2;
export const APPEAL_WINDOW_DAYS = 14;
export const STANDARD_KEY_RE = /^\d{4}-h[12]$/;

const DAY_MS = 86400000;

function utcDayStart(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return utcMidnight(utcDateKey(date));
}

export function halfOf(asOf = new Date()) {
  const key = utcDateKey(asOf);
  return { year: Number(key.slice(0, 4)), half: Number(key.slice(5, 7)) <= 6 ? 1 : 2 };
}

export function standardCycleKey(year, half) {
  return `${year}-h${half}`;
}

export function standardCycleLabel(year, half) {
  return `H${half} ${year}`;
}

export function standardCycleWindow(year, half) {
  return half === 1
    ? { start: utcMidnight(`${year}-01-01`), end: endOfUtcDay(`${year}-06-30`) }
    : { start: utcMidnight(`${year}-07-01`), end: endOfUtcDay(`${year}-12-31`) };
}

export function previousHalf({ year, half }) {
  return half === 1 ? { year: year - 1, half: 2 } : { year, half: 1 };
}

export function rollingStandardCycles(asOf = new Date()) {
  let cursor = halfOf(asOf);
  const cycles = [];
  for (let i = 0; i <= STANDARD_HISTORY; i += 1) {
    const { start, end } = standardCycleWindow(cursor.year, cursor.half);
    cycles.unshift({
      key: standardCycleKey(cursor.year, cursor.half),
      label: standardCycleLabel(cursor.year, cursor.half),
      start,
      end,
      defaultStatus: i === 0 ? "Open" : "Closed",
    });
    cursor = previousHalf(cursor);
  }
  return cycles;
}

export function appealWindowDaysElapsed(managerSubmittedDate, asOf = new Date()) {
  const from = utcDayStart(managerSubmittedDate);
  const to = utcDayStart(asOf);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function isWithinAppealWindow(managerSubmittedDate, asOf = new Date()) {
  const elapsed = appealWindowDaysElapsed(managerSubmittedDate, asOf);
  return elapsed !== null && elapsed >= 0 && elapsed <= APPEAL_WINDOW_DAYS;
}

export function appealDeadlineKey(managerSubmittedDate) {
  const from = utcDayStart(managerSubmittedDate);
  if (!from) return null;
  return utcDateKey(new Date(from.getTime() + APPEAL_WINDOW_DAYS * DAY_MS));
}

function isDuplicateKeyError(error) {
  if (error?.code === 11000) return true;
  const writeErrors = error?.writeErrors ?? error?.result?.writeErrors ?? [];
  return writeErrors.length > 0 && writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
}

export async function ensureStandardCycles(asOf = new Date()) {
  const targets = rollingStandardCycles(asOf);

  try {
    await PerformanceCycleModel.bulkWrite(
      targets.map((cycle) => ({
        updateOne: {
          filter: { key: cycle.key },
          update: {
            $setOnInsert: {
              key: cycle.key,
              label: cycle.label,
              kind: "standard",
              status: cycle.defaultStatus,
              start: cycle.start,
              end: cycle.end,
              statusOverriddenAt: null,
              createdBy: null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const current = targets[targets.length - 1];

  await PerformanceCycleModel.bulkWrite(
    [
      {
        updateMany: {
          filter: {
            kind: "standard",
            statusOverriddenAt: null,
            status: "Open",
            end: { $lt: asOf },
          },
          update: { $set: { status: "Closed" } },
        },
      },
      {
        updateOne: {
          filter: {
            key: current.key,
            kind: "standard",
            statusOverriddenAt: null,
            status: "Closed",
          },
          update: { $set: { status: "Open" } },
        },
      },
    ],
    { ordered: false },
  );

  return targets;
}

export async function loadCycleOrThrow(key) {
  if (typeof key !== "string" || !key.trim() || key.length > 64) {
    const err = new Error("Invalid cycle key.");
    err.status = 400;
    throw err;
  }

  let cycle = await PerformanceCycleModel.findOne({ key });
  if (!cycle && STANDARD_KEY_RE.test(key)) {
    await ensureStandardCycles();
    cycle = await PerformanceCycleModel.findOne({ key });
  }

  if (!cycle) {
    const err = new Error("Review cycle not found.");
    err.status = 404;
    throw err;
  }
  return cycle;
}
