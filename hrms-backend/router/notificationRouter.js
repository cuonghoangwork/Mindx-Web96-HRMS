import { Router } from "express";
import notificationController from "../controller/notificationController.js";
import telegramController from "../controller/telegramController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, notificationController.getAll);

// Live feed (Level 1). The ticket handshake is Bearer-authenticated; the
// stream itself authenticates with the ticket it hands out, since
// EventSource cannot set an Authorization header. Both are declared before
// "/:id" so neither is swallowed by the parameterised routes below.
router.get("/stream-ticket", verifyToken, notificationController.streamTicket);
router.get("/stream", notificationController.stream);

// Telegram (Level 4b). The webhook is deliberately outside verifyToken:
// Telegram cannot present a JWT, so the secret in the path is the
// credential (see telegramController.webhook). Declared before "/:id" so
// none of these are swallowed by the parameterised routes below.
router.get("/telegram", verifyToken, telegramController.status);
router.post("/telegram/link-code", verifyToken, telegramController.linkCode);
router.delete("/telegram", verifyToken, telegramController.disconnect);
router.post("/telegram/webhook/:secret", telegramController.webhook);

// Company-wide broadcast composer — HR/Admin only, not MANAGER's
// department-scoped remit: employee picker for the compose-notice modal.
router.get("/recipients", verifyToken, authorize("ADMIN", "HR"), notificationController.listRecipients);

router.post("/", verifyToken, authorize("ADMIN", "HR"), notificationController.create);
router.patch("/read-all", verifyToken, notificationController.markAllRead);
router.patch("/:id/read", verifyToken, notificationController.markRead);
router.delete("/clear-read", verifyToken, notificationController.clearRead);
router.delete("/:id", verifyToken, notificationController.remove);

export default router;
