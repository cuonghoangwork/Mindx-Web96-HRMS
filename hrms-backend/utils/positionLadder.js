/**
 * positionLadder.js — pure tenure math for the Position Ladder (task 2.4).
 *
 * Deliberately has zero dependency on Mongoose/DB so it can be unit-tested
 * the same way utils/workday.js and utils/leaveBalance.js are: fast,
 * synchronous, no in-memory MongoDB required.
 *
 * Per HRMS_IMPROVEMENT_TASKS.md 2.4, thresholds are:
 *   Intern    → Full-time   at  2 months  in level
 *   Full-time → Senior      at  4 years   in level
 *   Senior    → Manager     at  5 years   in level
 *   Manager has no next level — always ineligible.
 *
 * Per DECISION_2.6_Manager_Level.md, this is pure tenure math — no
 * department-capacity logic, no "slot" checks.
 */

import { POSITION_LEVELS } from "../model/PositionLevel.js";

/** Ladder order, lowest first. Single source of truth for "next level up". */
export const LEVEL_ORDER = POSITION_LEVELS; // ["Intern", "Full-time", "Senior", "Manager"]

/**
 * Minimum tenure (in months) required in the *current* level before an
 * employee is eligible for the *next* one. Keyed by current level; a level
 * with no entry (Manager) has no next step.
 */
export const ELIGIBILITY_THRESHOLD_MONTHS = {
  Intern: 2,
  "Full-time": 48, // 4 years
  Senior: 60, // 5 years
};

/** Returns the next level up the ladder, or null if already at the top. */
export function nextLevel(currentLevel) {
  const idx = LEVEL_ORDER.indexOf(currentLevel);
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

/**
 * Whole months elapsed between two dates, truncated (not rounded) — an
 * employee needs to have *completed* the threshold, not be rounding up to
 * it. Mirrors the truncation style used elsewhere in this codebase (e.g.
 * hoursBetween in workday.js) rather than introducing a new convention.
 */
export function monthsBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // If the day-of-month hasn't been reached yet in the final month, that
  // month isn't complete — e.g. Jan 15 -> Feb 10 is 0 complete months, not 1.
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Computes whether an employee is currently eligible for promotion.
 *
 * @param {string} positionLevel - the employee's current ladder level
 * @param {Date|string} levelStartDate - when they entered that level
 * @param {Date} [asOf] - evaluation date, defaults to now (injectable for tests)
 * @returns {{ eligible: boolean, nextLevel: string|null, monthsInLevel: number, thresholdMonths: number|null }}
 */
export function computeEligibility(positionLevel, levelStartDate, asOf = new Date()) {
  const proposed = nextLevel(positionLevel);
  const thresholdMonths = ELIGIBILITY_THRESHOLD_MONTHS[positionLevel] ?? null;

  if (!proposed || thresholdMonths == null || !levelStartDate) {
    return { eligible: false, nextLevel: proposed, monthsInLevel: 0, thresholdMonths };
  }

  const monthsInLevel = monthsBetween(levelStartDate, asOf);
  return {
    eligible: monthsInLevel >= thresholdMonths,
    nextLevel: proposed,
    monthsInLevel,
    thresholdMonths,
  };
}
