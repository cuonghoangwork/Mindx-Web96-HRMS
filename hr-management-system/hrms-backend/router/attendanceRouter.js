import { Router } from "express";
import attendanceController from "../controller/attendanceController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, attendanceController.getAll);
router.post("/check-in", verifyToken, attendanceController.checkIn);
router.post("/check-out", verifyToken, attendanceController.checkOut);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), attendanceController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), attendanceController.remove);

export default router;
