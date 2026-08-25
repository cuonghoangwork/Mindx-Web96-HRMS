import { Router } from "express";
import permissionController from "../controller/permissionController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, authorize("ADMIN"), permissionController.list);
router.patch("/:role/:capability", verifyToken, authorize("ADMIN"), permissionController.toggle);

export default router;
