import { Router } from "express";
import jobController from "../controller/jobController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, jobController.getAll);
router.get("/:id", verifyToken, jobController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "HR"), validate.job.create, jobController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "HR"), validate.job.update, jobController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "HR"), jobController.remove);

export default router;
