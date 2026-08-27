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

const MAX_HISTORY_TURNS = 6;

const aiController = {
  chat: async (req, res) => {
    try {
      const history = Array.isArray(req.body.history) ? req.body.history.slice(-MAX_HISTORY_TURNS) : [];
      const prompt = buildChatPrompt({ history, message: req.body.message, language: req.body.language });
      const reply = await askGemini(prompt);
      res.json({ success: true, reply });
    } catch (error) {
      res.status(error.status || 502).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default aiController;
