import { Router } from "express";
import departmentController from "../controller/departmentController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, departmentController.getAll);
router.get("/:id", verifyToken, departmentController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), departmentController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), departmentController.update);
router.delete("/:id", verifyToken, authorize("ADMIN"), departmentController.remove);

export default router;
