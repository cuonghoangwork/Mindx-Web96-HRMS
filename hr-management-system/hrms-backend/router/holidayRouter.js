import { Router } from "express";
import holidayController from "../controller/holidayController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, holidayController.getAll);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), holidayController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), holidayController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), holidayController.remove);

export default router;
