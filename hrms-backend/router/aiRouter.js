import { Router } from "express";
import aiController from "../controller/aiController.js";
import { verifyToken } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Every authenticated user gets the assistant — scoped product-help only,
// no role restriction (see utils/appChatPrompt.js).
router.post("/chat", verifyToken, validate.ai.chat, aiController.chat);

export default router;
