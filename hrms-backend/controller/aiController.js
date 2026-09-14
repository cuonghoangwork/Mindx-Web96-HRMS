/**
 * Product-help chat for every authenticated user. The real error.message is
 * returned in the body (it can name config details); the frontend never
 * surfaces it raw.
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
