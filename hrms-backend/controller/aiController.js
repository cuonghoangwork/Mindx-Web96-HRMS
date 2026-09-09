/**
 * aiController.js — Solo Gaps Milestone 2 (AI chat widget).
 *
 * Scoped product-help assistant: every authenticated user, no role
 * restriction (see router/aiRouter.js). Same error-handling convention as
 * performanceController.getAiInsight — the real error.message is returned
 * in the JSON body, and it's the FRONTEND's job to never surface it raw
 * (it can contain config details like "GEMINI_API_KEY is unset").
 */

import { askGemini } from "../utils/geminiClient.js";
import { buildChatPrompt } from "../utils/appChatPrompt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MAX_HISTORY_TURNS = 6;

const aiController = {
  chat: asyncHandler(async (req, res) => {
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-MAX_HISTORY_TURNS) : [];
    const prompt = buildChatPrompt({ history, message: req.body.message, language: req.body.language });
    const reply = await askGemini(prompt);
    res.json({ success: true, reply });
  }, 502),
};

export default aiController;
