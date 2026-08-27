/**
 * appChatPrompt.js — Solo Gaps Milestone 2 (AI chat widget).
 *
 * A static system prompt describing HRMS's own pages/roles (NOT the WEB96
 * course reference doc — that describes an unrelated backend course, not
 * this app's features). Scoped product-help only: the model has no live
 * data access and is told explicitly not to claim otherwise. Kept as a
 * pure function, separate from the controller and the Gemini network
 * call, so it's testable with plain fixtures — same shape as
 * performanceInsightPrompt.js's buildInsightPrompt.
 */

import { languageNameFor } from "./language.js";

const SYSTEM_PROMPT = `You are the HRMS product-help assistant. You help users understand how to use this HR Management System web app. You do NOT have access to any live company data — no employee records, attendance, payroll figures, or reviews — and must never claim to see any. If asked about specific data, tell the user which page to check instead of guessing.

Pages available to every signed-in user: Dashboard (summary widgets), Attendance (clock in/out, personal log), Performance Reviews (self/manager review, competencies, goals, peer feedback, appeals), Notifications, Settings, and their own Employee profile (Attendance/Leave/Salary/Documents/Activity tabs).
Pages available to Managers and above: Payroll (Managers see their own department, read-only), Holidays & leave approvals.
Pages available to HR and Admin only: Add Employee, Org Chart, full Departments list, Jobs, Candidates.
Roles: EMPLOYEE (self-service only), MANAGER (own department, can approve leave/attendance/profile-edit requests and propose promotions for their team), HR (company-wide HR operations), ADMIN (full access, including the permissions matrix).

Answer in 2-4 short plain-text sentences, no markdown, no code fences. If the question isn't about using this app, say plainly that you can only help with using HRMS.`;

const MAX_HISTORY_TURNS = 6;

function historyLines(history) {
  if (!history?.length) return "";
  return history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.content}`)
    .join("\n");
}

export function buildChatPrompt({ history, message, language }) {
  const priorTurns = historyLines(history);
  const languageLine = `Respond in ${languageNameFor(language)}.`;
  return (
    `${SYSTEM_PROMPT} ${languageLine}\n\n` +
    (priorTurns ? `Conversation so far:\n${priorTurns}\n\n` : "") +
    `User: ${message}`
  );
}

export default buildChatPrompt;
