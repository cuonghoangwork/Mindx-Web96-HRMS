/** Position-ladder tenure math (DECISIONS.md D1). Pure — no DB, so it unit-tests synchronously. */

import { POSITION_LEVELS } from "../model/PositionLevel.js";

/** Ladder order, lowest first. */
export const LEVEL_ORDER = POSITION_LEVELS; // ["Intern", "Full-time", "Senior", "Manager"]

/** Months in the current level before eligibility for the next. No entry = top rung. */
export const ELIGIBILITY_THRESHOLD_MONTHS = {
  Intern: 2,
  "Full-time": 48, // 4 years
  Senior: 60, // 5 years
};

export function nextLevel(currentLevel) {
  const idx = LEVEL_ORDER.indexOf(currentLevel);
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

/** Completed whole months between two dates (Jan 15 -> Feb 10 is 0, not 1). */
export function monthsBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/** @returns {{ eligible: boolean, nextLevel: string|null, monthsInLevel: number, thresholdMonths: number|null }} */
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
