/**
 * performanceInsightPrompt.js — task 5 (Ask AI insight).
 *
 * Builds the prompt sent to Gemini from a review record already shaped by
 * performanceController's reviewToClient() (competencies/goals/peerFeedback
 * already normalized to the client shape). Ports the demo's onAskAI prompt
 * (HRMS Navy Signal Blue.dc.html) onto real backend data instead of mock
 * state. Kept as a pure function, separate from the controller and the
 * Gemini network call, so it's testable with plain fixtures.
 */

import { COMPETENCIES, COMPETENCY_LABELS } from "../model/PerformanceReview.js";

function competencyLines(competencies) {
  return COMPETENCIES.map((key) => {
    const v = competencies?.[key] ?? {};
    return `${COMPETENCY_LABELS[key]}: self ${v.self ?? "—"}, manager ${v.manager ?? "—"}`;
  }).join("\n");
}

function goalLines(goals) {
  if (!goals?.length) return "None";
  return goals.map((g) => `- ${g.text} (${g.progress}%)`).join("\n");
}

function peerFeedbackLines(peerFeedback) {
  if (!peerFeedback?.length) return "None";
  return peerFeedback.map((p) => `${p.name} (${p.relation || "—"}): ${p.comments}`).join("\n");
}

export function buildInsightPrompt({ employee, cycle, review }) {
  const employeeName = employee?.name ?? "an employee";
  const cycleLabel = cycle?.label ?? cycle?.key ?? "this cycle";

  return (
    `You are an HR assistant reviewing performance review data for ${employeeName}, cycle ${cycleLabel}.\n\n` +
    `Self rating: ${review?.selfRating ?? "—"} — ${review?.selfComments || "(none)"}\n` +
    `Manager rating: ${review?.managerRating ?? "—"} — ${review?.managerComments || "(none)"}\n` +
    `Competency ratings (1-5):\n${competencyLines(review?.competencies)}\n\n` +
    `Goals this cycle:\n${goalLines(review?.goals)}\n\n` +
    `Peer feedback:\n${peerFeedbackLines(review?.peerFeedback)}\n\n` +
    `Write, in plain text with no markdown: (1) a neutral 2-3 sentence summary, (2) one specific growth suggestion, ` +
    `(3) a one-line note on whether the review content is detailed enough or too vague. Keep it under 120 words total.`
  );
}

export default buildInsightPrompt;
