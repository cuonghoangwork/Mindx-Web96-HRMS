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
    let line = `${COMPETENCY_LABELS[key]}: self ${v.self ?? "—"}, manager ${v.manager ?? "—"}`;
    if (v.selfComment) line += ` | self note: ${v.selfComment}`;
    if (v.managerComment) line += ` | manager note: ${v.managerComment}`;
    return line;
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
    `Respond with ONLY a JSON object, no markdown and no code fences, matching exactly this shape: ` +
    `{"summary": string, "strengths": string[], "growthAreas": string[]}. ` +
    `"summary" is a neutral 2-3 sentence overview of the review. "strengths" is 1-3 short phrases naming what ` +
    `stood out positively. "growthAreas" is 1-2 short, specific, actionable suggestions. If the review content is ` +
    `too sparse to say anything meaningful, note that plainly in "summary" instead of inventing detail. Keep the ` +
    `total response under 120 words.`
  );
}

export default buildInsightPrompt;
