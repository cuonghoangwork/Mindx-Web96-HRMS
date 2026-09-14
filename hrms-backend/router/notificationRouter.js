import { Router } from "express";
import notificationController from "../controller/notificationController.js";
import telegramController from "../controller/telegramController.js";
import pushController from "../controller/pushController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, notificationController.getAll);

// Live feed: the ticket handshake is Bearer-authenticated, the stream
// authenticates with the ticket (EventSource cannot set a header). Declared
// before "/:id".
router.get("/stream-ticket", verifyToken, notificationController.streamTicket);
router.get("/stream", notificationController.stream);

// Out-of-app preferences. Desktop is per-device, in the browser.
router.get("/preferences", verifyToken, notificationController.getPreferences);
router.patch("/preferences", verifyToken, notificationController.updatePreferences);

// Web Push — per-device, keyed off the browser's endpoint.
router.get("/push", verifyToken, pushController.status);
router.post("/push/subscribe", verifyToken, pushController.subscribe);
router.delete("/push/subscribe", verifyToken, pushController.unsubscribe);

// Telegram. The webhook is outside verifyToken — the path secret is the credential.
router.get("/telegram", verifyToken, telegramController.status);
router.post("/telegram/link-code", verifyToken, telegramController.linkCode);
router.delete("/telegram", verifyToken, telegramController.disconnect);
router.post("/telegram/webhook/:secret", telegramController.webhook);

// Recipient picker for the compose modal — HR/Admin only.
router.get("/recipients", verifyToken, authorize("ADMIN", "HR"), notificationController.listRecipients);

router.post("/", verifyToken, authorize("ADMIN", "HR"), notificationController.create);
router.patch("/read-all", verifyToken, notificationController.markAllRead);
router.patch("/:id/read", verifyToken, notificationController.markRead);
router.delete("/clear-read", verifyToken, notificationController.clearRead);
router.delete("/:id", verifyToken, notificationController.remove);

export default router;
