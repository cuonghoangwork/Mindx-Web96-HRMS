import { Router } from "express";
import auditLogController from "../controller/auditLogController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

// Recent feed — used by Dashboard; any authenticated user can read
router.get("/recent", verifyToken, auditLogController.getRecent);

// Full log — ADMIN/MANAGER only
router.get("/", verifyToken, authorize("ADMIN", "MANAGER"), auditLogController.getAll);

export default router;
