import { Router } from "express";
import notificationController from "../controller/notificationController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, notificationController.getAll);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), notificationController.create);
router.patch("/read-all", verifyToken, notificationController.markAllRead);
router.patch("/:id/read", verifyToken, notificationController.markRead);
router.delete("/clear-read", verifyToken, notificationController.clearRead);
router.delete("/:id", verifyToken, notificationController.remove);

export default router;
