import { Router } from "express";
import jobController from "../controller/jobController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, jobController.getAll);
router.get("/:id", verifyToken, jobController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), jobController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), jobController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), jobController.remove);

export default router;
