import { Router } from "express";
import authController from "../controller/authController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { blockIfRegistrationClosed } from "../middleware/registrationGate.js";

const router = Router();

router.get("/config", authController.config);

router.post("/register", blockIfRegistrationClosed, authController.register);
router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", verifyToken, authController.logout);
router.get("/me", verifyToken, authController.me);
router.post("/change-password", verifyToken, authController.changePassword);

// Admin-only: list all user accounts and their roles
router.get("/users", verifyToken, authorize("ADMIN"), authController.listUsers);

// Admin-only: promote/demote a user between EMPLOYEE and MANAGER
router.patch("/users/:id/promote", verifyToken, authorize("ADMIN"), authController.promote);

export default router;
