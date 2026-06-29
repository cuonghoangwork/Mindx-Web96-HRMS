import { Router } from "express";
import authController from "../controller/authController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", verifyToken, authController.logout);
router.get("/me", verifyToken, authController.me);

// Admin-only: list all user accounts and their roles
router.get("/users", verifyToken, authorize("ADMIN"), authController.listUsers);

// Admin-only: promote/demote a user between EMPLOYEE and MANAGER
router.patch("/users/:id/promote", verifyToken, authorize("ADMIN"), authController.promote);

export default router;
