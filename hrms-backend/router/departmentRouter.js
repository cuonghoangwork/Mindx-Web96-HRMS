import { Router } from "express";
import departmentController from "../controller/departmentController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, departmentController.getAll);
router.get("/:id", verifyToken, departmentController.getDetail);
// Department budget/manager-assignment edits are HR/ADMIN territory, not
// MANAGER's department-scoped remit.
router.post("/", verifyToken, authorize("ADMIN", "HR"), validate.department.create, departmentController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "HR"), validate.department.update, departmentController.update);
router.delete("/:id", verifyToken, authorize("ADMIN"), departmentController.remove);

export default router;
