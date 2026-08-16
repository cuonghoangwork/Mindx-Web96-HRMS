import { Router } from "express";
import payrollController from "../controller/payrollController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Running/approving/editing payroll is company-wide HR territory, not part
// of MANAGER's department-scoped remit — HR/ADMIN only for writes.
const hr = [verifyToken, authorize("HR", "ADMIN")];

// Viewing payroll: MANAGER also gets in, but read-only and scoped to their
// own department by the controller (see utils/managerScope.js and
// payrollController's departmentId filtering) — HR/ADMIN see everything.
const managerRead = [verifyToken, authorize("MANAGER", "HR", "ADMIN")];

// Task 10.8 — payroll self-service: any authenticated user, not HR-gated.
// The controller resolves "my payslips" from the caller's own JWT-linked
// Employee record, so nothing beyond that is reachable through this route.
router.get("/my-payslips", verifyToken, payrollController.myPayslips);

router.get("/periods", ...managerRead, payrollController.listPeriods);
router.post("/periods", ...hr, validate.payroll.createPeriod, payrollController.createPeriod);
router.post("/periods/:id/regenerate", ...hr, payrollController.regenerate);
router.get("/periods/:id/payslips", ...managerRead, payrollController.listPayslips);
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

router.post("/run-monthly", verifyToken, authorize("ADMIN"), payrollController.runMonthly);

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
