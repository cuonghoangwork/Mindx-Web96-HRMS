import { Router } from "express";
import holidayController from "../controller/holidayController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, holidayController.getAll);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), validate.holiday.create, holidayController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), validate.holiday.update, holidayController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), holidayController.remove);

export default router;
