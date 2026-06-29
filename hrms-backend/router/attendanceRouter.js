import { Router } from "express";
import attendanceController from "../controller/attendanceController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

// All authenticated users can view attendance (employees see all; UI can filter)
router.get("/", verifyToken, attendanceController.getAll);

// Clock in/out: all authenticated users — controller enforces EMPLOYEE can only
// submit for themselves
router.post("/check-in", verifyToken, attendanceController.checkIn);
router.post("/check-out", verifyToken, attendanceController.checkOut);

// Manual record editing — HR/Admin only
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), attendanceController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), attendanceController.remove);

export default router;
