import { Router } from "express";
import positionLevelController from "../controller/positionLevelController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, positionLevelController.getAll);
router.patch("/:level", verifyToken, authorize("ADMIN"), positionLevelController.updateBaseSalary);

export default router;
