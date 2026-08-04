import { Router } from "express";
import payrollController from "../controller/payrollController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const hr = [verifyToken, authorize("MANAGER", "ADMIN")];

router.get("/periods", ...hr, payrollController.listPeriods);
router.post("/periods", ...hr, validate.payroll.createPeriod, payrollController.createPeriod);
router.post("/periods/:id/regenerate", ...hr, payrollController.regenerate);
router.get("/periods/:id/payslips", ...hr, payrollController.listPayslips);
router.patch("/periods/:id/status", ...hr, payrollController.setPeriodStatus);
router.delete("/periods/:id", verifyToken, authorize("ADMIN"), payrollController.removePeriod);

// Tasks 3.8/3.9: manual trigger for the start-of-month FX snapshot + draft
// generation job. ADMIN-only, same tier as the close-attendance manual
// trigger it mirrors (router/attendanceRouter.js).
router.post(
  "/generate-monthly-draft",
  verifyToken,
  authorize("ADMIN"),
  payrollController.generateMonthlyDraft,
);

// Task 3.8, frontend support: HR-tier read of the current/target month's FX
// snapshot, used by the "New period" form's "Fetch live rate" button.
router.get("/fx-rate/:year/:month", ...hr, payrollController.previewFxRate);

router.patch(
  "/payslips/:id",
  ...hr,
  validate.payroll.updatePayslip,
  payrollController.updatePayslip,
);
router.post("/payslips/:id/recompute-deduction", ...hr, payrollController.recomputeDeduction);

export default router;
