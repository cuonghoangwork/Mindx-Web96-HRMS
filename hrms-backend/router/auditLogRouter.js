import { Router } from "express";
import auditLogController from "../controller/auditLogController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

// Recent feed — used by Dashboard; any authenticated user can read
router.get("/recent", verifyToken, auditLogController.getRecent);

// Full, unscoped log — ADMIN/HR only (company-wide, not MANAGER's
// department-scoped remit).
router.get("/", verifyToken, authorize("ADMIN", "HR"), auditLogController.getAll);

export default router;
