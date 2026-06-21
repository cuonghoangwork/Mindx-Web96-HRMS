import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, employeeController.getAll);
router.get("/:id", verifyToken, employeeController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), employeeController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), employeeController.update);
router.delete("/:id", verifyToken, authorize("ADMIN"), employeeController.remove);

export default router;
