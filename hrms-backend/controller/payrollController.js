import PayrollPeriodModel, { PAYROLL_PERIOD_STATUSES } from "../model/PayrollPeriod.js";
import PayslipModel from "../model/Payslip.js";
import { DEFAULT_FX_RATE_VND_PER_USD, autoDeductionVnd, computePayslip, standardWorkingDaysInMonth } from "../utils/payrollEngine.js";
import { overtimeSegments } from "../utils/overtimePay.js";
import {
  buildPayslipRows,
  insertPayslips,
  loadMonthDayCounts,
  periodLabel,
} from "../utils/payrollGeneration.js";
import { generateMonthlyPayrollDraft } from "../jobs/generateMonthlyPayrollDraft.js";
import { runMonthlyPayroll } from "../jobs/runMonthlyPayroll.js";
import { getOrCreateMonthlyFxRate } from "../utils/exchangeRate.js";
import { diffChanges, logAction } from "../utils/auditLog.js";
import { emitNotification, notifyHR } from "../utils/notify.js";
import { resolveRequestingEmployee } from "../utils/reviewQueue.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";

const CONTRACT_TYPE_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const providedVnd = (value) => value !== undefined && value !== null && value !== "";

function periodToClient(doc, totals) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const t = totals ?? {};
  return {
    id: String(o._id),
    year: o.year,
    month: o.month,
    label: periodLabel(o),
    fxRate: o.fxRate,
    standardWorkingDays: o.standardWorkingDays,
    status: o.status,
    note: o.note ?? "",
    editable: o.status === "draft",
    payslipCount: t.count ?? 0,
    totals: {
      baseSalary: t.baseSalary ?? 0,
      bonus: t.bonus ?? 0,
      allowance: t.allowance ?? 0,
      deduction: t.deduction ?? 0,
      grossPay: t.grossPay ?? 0,
      insuranceTotal: t.insuranceTotal ?? 0,
      pit: t.pit ?? 0,
      netPay: t.netPay ?? 0,
    },
    createdBy: o.createdBy ? String(o.createdBy._id ?? o.createdBy) : null,
    systemGenerated: Boolean(o.systemGenerated),
    fxRateSource: o.fxRateSource ?? "manual",
    approvedBy: o.approvedBy ? String(o.approvedBy._id ?? o.approvedBy) : null,
    approvedAt: o.approvedAt ?? null,
    paidBy: o.paidBy ? String(o.paidBy._id ?? o.paidBy) : null,
    paidAt: o.paidAt ?? null,
    createdAt: o.createdAt,
  };
}

function payslipToClient(doc, period) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    periodId: o.period ? String(o.period._id ?? o.period) : null,
    periodLabel: period ? periodLabel(period) : null,
    periodStatus: period ? period.status : null,
    fxRate: period ? period.fxRate : null,
    standardWorkingDays: period ? period.standardWorkingDays : null,
    fxRateSource: period ? period.fxRateSource : null,
    editable: period ? period.status === "draft" : false,
    employeeId: o.employee ? String(o.employee._id ?? o.employee) : null,
    employeeCode: o.employeeCode ?? "",
    employeeName: o.employeeName ?? "",
    departmentName: o.departmentName ?? null,
    designation: o.designation ?? null,
    type: CONTRACT_TYPE_LABELS[o.contractType] ?? o.contractType ?? null,
    annualSalaryUsd: o.annualSalaryUsd ?? 0,
    baseSalary: o.baseSalary ?? 0,
    bonus: o.bonus ?? 0,
    allowance: o.allowance ?? 0,
    deduction: o.deduction ?? 0,
    unpaidLeaveDays: o.unpaidLeaveDays ?? 0,
    absentDays: o.absentDays ?? 0,
    autoDeduction: o.autoDeduction ?? 0,
    deductionOverridden: Boolean(o.deductionOverridden),
    overtimeHours: o.overtimeHours ?? 0,
    overtimeNightHours: o.overtimeNightHours ?? 0,
    overtimePay: o.overtimePay ?? 0,
    overtimeTaxExempt: o.overtimeTaxExempt !== false,
    // Display-ready segments ("150% x 4h"), built server-side so the statutory
    // multipliers live in exactly one place.
    overtimeSegments: overtimeSegments(o.overtimeBreakdown),
    grossPay: o.grossPay ?? 0,
    insuranceBase: o.insuranceBase ?? 0,
    insuranceExempt: Boolean(o.insuranceExempt),
    bhxh: o.bhxh ?? 0,
    bhyt: o.bhyt ?? 0,
    bhtn: o.bhtn ?? 0,
    insuranceTotal: o.insuranceTotal ?? 0,
    taxableIncome: o.taxableIncome ?? 0,
    pit: o.pit ?? 0,
    netPay: o.netPay ?? 0,
  };
}

// departmentId scopes the aggregate to one department's payslips — used for
// MANAGER's read-only, department-scoped payroll view (Payslip.departmentId
// is denormalized onto every payslip, so this needs no Employee join).
async function totalsByPeriod(periodIds, departmentId = null) {
  if (!periodIds.length) return new Map();
  const match = { period: { $in: periodIds } };
  if (departmentId) match.departmentId = departmentId;
  const rows = await PayslipModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$period",
        count: { $sum: 1 },
        baseSalary: { $sum: "$baseSalary" },
        bonus: { $sum: "$bonus" },
        allowance: { $sum: "$allowance" },
        deduction: { $sum: "$deduction" },
        grossPay: { $sum: "$grossPay" },
        insuranceTotal: { $sum: "$insuranceTotal" },
        pit: { $sum: "$pit" },
        netPay: { $sum: "$netPay" },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

const payrollController = {
  // MANAGER gets read-only, department-scoped totals (own department's
  // payslips only) — HR/ADMIN see the company-wide totals unscoped.
  listPeriods: async (req, res) => {
    try {
      const { status, year } = req.query;
      const condition = {};
      if (status && status !== "all" && PAYROLL_PERIOD_STATUSES.includes(status)) {
        condition.status = status;
      }
      if (year) condition.year = Number(year);

      const periods = await PayrollPeriodModel.find(condition).sort({ year: -1, month: -1 });
      const departmentId = req.user.role === "MANAGER" ? await getManagerDepartmentId(req) : null;
      const totals = await totalsByPeriod(periods.map((p) => p._id), departmentId);

      res.json({
        success: true,
        items: periods.map((p) => periodToClient(p, totals.get(String(p._id)))),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  createPeriod: async (req, res) => {
    let created = null;
    try {
      const year = Number(req.body.year);
      const month = Number(req.body.month);
      const fxRate = providedVnd(req.body.fxRate)
        ? Number(req.body.fxRate)
        : DEFAULT_FX_RATE_VND_PER_USD;

      const existing = await PayrollPeriodModel.findOne({ year, month });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `A payroll period for ${year}-${String(month).padStart(2, "0")} already exists.`,
          code: "PAYROLL_PERIOD_ALREADY_EXISTS",
          params: { year, month: String(month).padStart(2, "0") },
        });
      }

      created = await PayrollPeriodModel.create({
        year,
        month,
        fxRate,
        standardWorkingDays: standardWorkingDaysInMonth(year, month),
        note: req.body.note ?? "",
        createdBy: req.user.id,
      });

      const rows = await buildPayslipRows(created);
      if (!rows.length) {
        await PayrollPeriodModel.findByIdAndDelete(created._id);
        created = null;
        return res.status(400).json({
          success: false,
          message: "No payable employees exist for this period. Add employees first.",
          code: "NO_PAYABLE_EMPLOYEES",
        });
      }

      const generated = await insertPayslips(rows);
      const totals = await totalsByPeriod([created._id]);

      await logAction(req, {
        action: "created",
        resource: "payroll",
        resourceId: created._id,
        label: `Payroll ${periodLabel(created)}`,
      });

      notifyHR({
        title: "Payroll drafts generated",
        message: `${generated} draft payslip${generated === 1 ? "" : "s"} generated for ${periodLabel(created)}.`,
        titleKey: "payrollDraftsGenerated",
        messageKey: "payrollDraftsGenerated",
        params: { count: generated, periodLabel: periodLabel(created) },
        category: "payroll",
        link: "/payroll",
        linkLabel: "Open payroll",
      });

      res.status(201).json({
        success: true,
        data: periodToClient(created, totals.get(String(created._id))),
        generated,
      });
    } catch (error) {
      if (created?._id) {
        await PayrollPeriodModel.findByIdAndDelete(created._id).catch(() => {});
        await PayslipModel.deleteMany({ period: created._id }).catch(() => {});
      }
      if (error?.code === 11000) {
        return res
          .status(409)
          .json({ success: false, message: "A payroll period for that month already exists.", code: "PAYROLL_PERIOD_DUPLICATE_KEY" });
      }
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  regenerate: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Only a draft period can be regenerated.",
          code: "ONLY_DRAFT_PERIOD_REGENERATABLE",
        });
      }

      await PayslipModel.deleteMany({ period: period._id });
      const rows = await buildPayslipRows(period);
      const generated = await insertPayslips(rows);
      const totals = await totalsByPeriod([period._id]);

      await logAction(req, {
        action: "updated",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)} regenerated`,
      });

      res.json({
        success: true,
        data: periodToClient(period, totals.get(String(period._id))),
        generated,
        warning: "Manual bonus, allowance and deduction edits for this period were discarded.",
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  listPayslips: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }

      const condition = { period: period._id };
      let departmentId = null;
      if (req.user.role === "MANAGER") {
        departmentId = await getManagerDepartmentId(req);
        condition.departmentId = departmentId;
      }

      const payslips = await PayslipModel.find(condition).sort({ employeeName: 1 });
      const totals = await totalsByPeriod([period._id], departmentId);

      res.json({
        success: true,
        period: periodToClient(period, totals.get(String(period._id))),
        items: payslips.map((p) => payslipToClient(p, period)),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  updatePayslip: async (req, res) => {
    try {
      const payslip = await PayslipModel.findById(req.params.id);
      if (!payslip) {
        return res.status(404).json({ success: false, message: "Payslip not found.", code: "PAYSLIP_NOT_FOUND" });
      }
      const period = await PayrollPeriodModel.findById(payslip.period);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Payslips can only be edited while the pay period is a draft.",
          code: "PAYSLIP_LOCKED",
        });
      }

      const body = req.body ?? {};
      const pick = (key) => (providedVnd(body[key]) ? Number(body[key]) : payslip[key]);
      const before = {
        baseSalary: payslip.baseSalary,
        bonus: payslip.bonus,
        allowance: payslip.allowance,
        deduction: payslip.deduction,
      };
      const merged = {
        baseSalary: pick("baseSalary"),
        bonus: pick("bonus"),
        allowance: pick("allowance"),
        deduction: pick("deduction"),
      };

      if (merged.deduction > merged.baseSalary + merged.bonus + merged.allowance) {
        return res.status(400).json({
          success: false,
          message: "Deduction cannot exceed base salary plus bonus plus allowance.",
          code: "DEDUCTION_EXCEEDS_LIMIT",
        });
      }

      payslip.autoDeduction = autoDeductionVnd({
        baseSalary: merged.baseSalary,
        bonus: merged.bonus,
        allowance: merged.allowance,
        unpaidLeaveDays: payslip.unpaidLeaveDays,
        absentDays: payslip.absentDays,
        standardWorkingDays: period.standardWorkingDays,
      });
      payslip.deductionOverridden = merged.deduction !== payslip.autoDeduction;
      Object.assign(
        payslip,
        computePayslip({
          ...merged,
          unpaidDays: payslip.unpaidLeaveDays + payslip.absentDays,
          // Read back from the payslip, not recomputed from attendance.
          // computePayslip returns a COMPLETE payslip, so omitting this would
          // write overtimePay: 0 over the stored figure and silently erase an
          // employee's overtime the moment HR nudged their bonus.
          overtimePay: payslip.overtimePay,
          overtimeTaxExempt: payslip.overtimeTaxExempt,
        }),
      );
      await payslip.save();

      const changes = diffChanges(before, merged) ?? {};
      changes.reason = { from: null, to: body.reason.trim() };

      await logAction(req, {
        action: "updated",
        resource: "payroll",
        resourceId: payslip._id,
        label: `${payslip.employeeName} — ${periodLabel(period)}`,
        changes,
      });

      res.json({ success: true, data: payslipToClient(payslip, period) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  recomputeDeduction: async (req, res) => {
    try {
      const payslip = await PayslipModel.findById(req.params.id);
      if (!payslip) {
        return res.status(404).json({ success: false, message: "Payslip not found.", code: "PAYSLIP_NOT_FOUND" });
      }
      const period = await PayrollPeriodModel.findById(payslip.period);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Payslips can only be edited while the pay period is a draft.",
          code: "PAYSLIP_LOCKED",
        });
      }

      const dayCountsFor = await loadMonthDayCounts(period.year, period.month);
      const { unpaidLeaveDays, absentDays } = dayCountsFor(payslip.employee);

      const autoDeduction = autoDeductionVnd({
        baseSalary: payslip.baseSalary,
        bonus: payslip.bonus,
        allowance: payslip.allowance,
        unpaidLeaveDays,
        absentDays,
        standardWorkingDays: period.standardWorkingDays,
      });

      payslip.unpaidLeaveDays = unpaidLeaveDays;
      payslip.absentDays = absentDays;
      payslip.autoDeduction = autoDeduction;
      payslip.deductionOverridden = false;
      Object.assign(
        payslip,
        computePayslip({
          baseSalary: payslip.baseSalary,
          bonus: payslip.bonus,
          allowance: payslip.allowance,
          deduction: autoDeduction,
          unpaidDays: unpaidLeaveDays + absentDays,
          // Same reason as adjust() above — carried forward, never dropped.
          overtimePay: payslip.overtimePay,
          overtimeTaxExempt: payslip.overtimeTaxExempt,
        }),
      );
      await payslip.save();

      res.json({ success: true, data: payslipToClient(payslip, period) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  setPeriodStatus: async (req, res) => {
    try {
      const { status } = req.body ?? {};
      if (!PAYROLL_PERIOD_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of ${PAYROLL_PERIOD_STATUSES.join(", ")}.`,
          code: "PAYROLL_STATUS_INVALID",
          params: { statuses: PAYROLL_PERIOD_STATUSES.join(", ") },
        });
      }

      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }

      const from = period.status;
      if (from === status) {
        return res
          .status(409)
          .json({ success: false, message: `This period is already ${status}.`, code: "PERIOD_ALREADY_IN_STATUS", params: { status } });
      }
      if (from === "paid") {
        return res.status(409).json({
          success: false,
          message: "A paid period is closed and cannot change status.",
          code: "PAID_PERIOD_LOCKED",
        });
      }
      if (from === "draft" && status === "paid") {
        return res
          .status(409)
          .json({ success: false, message: "Approve the period before marking it paid.", code: "PERIOD_NOT_APPROVED" });
      }
      if (from === "approved" && status === "draft" && req.user.role !== "ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Only an Administrator can reopen an approved period.",
          code: "ADMIN_ONLY_REOPEN_PERIOD",
        });
      }

      if (from === "draft" && status === "approved") {
        const count = await PayslipModel.countDocuments({ period: period._id });
        if (!count) {
          return res
            .status(400)
            .json({ success: false, message: "Cannot approve a period with no payslips.", code: "CANNOT_APPROVE_EMPTY_PERIOD" });
        }
        period.approvedBy = req.user.id;
        period.approvedAt = new Date();
      }

      if (status === "paid") {
        period.paidBy = req.user.id;
        period.paidAt = new Date();
      }

      if (status === "draft") {
        period.approvedBy = null;
        period.approvedAt = null;
      }

      period.status = status;
      await period.save();

      await logAction(req, {
        action: "status_changed",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)} — ${from} to ${status}`,
      });

      if (status === "paid") {
        // NOTE: jobs/runMonthlyPayroll.js emits this same notice with
        // audience "all". Whether HR/Admin see "Payroll paid" therefore depends
        // on whether a human or the cron marked the period paid. Pinned as-is in
        // tests/notificationProducers.characterization.test.js — reconciling the
        // two is a behaviour decision, separate from moving the call site.
        await emitNotification({
          audience: "employees",
          category: "payroll",
          title: "Payroll paid",
          message: `${periodLabel(period)} payroll has been paid.`,
          titleKey: "payrollPaid",
          messageKey: "payrollPaid",
          params: { periodLabel: periodLabel(period) },
        });
      }

      const totals = await totalsByPeriod([period._id]);
      res.json({ success: true, data: periodToClient(period, totals.get(String(period._id))) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  removePeriod: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found.", code: "PAYROLL_PERIOD_NOT_FOUND" });
      }
      if (period.status !== "draft") {
        return res
          .status(409)
          .json({ success: false, message: "Only a draft period can be deleted.", code: "ONLY_DRAFT_PERIOD_DELETABLE" });
      }

      await PayslipModel.deleteMany({ period: period._id });
      await PayrollPeriodModel.findByIdAndDelete(period._id);

      await logAction(req, {
        action: "deleted",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)}`,
      });

      res.json({ success: true, message: "Payroll period deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // Tasks 3.8/3.9: manual trigger for the same job the scheduler runs on the
  // 1st of the month (jobs/generateMonthlyPayrollDraft.js). Mirrors
  // attendanceController.closeDay's pattern — useful for demos, and for
  // hosts where the scheduler is disabled (e.g. a free-tier host that sleeps
  // when idle, same caveat already documented for CRON_CLOSE_ATTENDANCE).
  // Optional { year, month } body lets HR backfill/regenerate a specific
  // month; defaults to the current month otherwise. A no-op (skipped: true)
  // if that month's period already exists.
  generateMonthlyDraft: async (req, res) => {
    try {
      const { year, month } = req.body ?? {};
      const asOf =
        year && month ? new Date(Number(year), Number(month) - 1, 1) : new Date();

      const result = await generateMonthlyPayrollDraft({ asOf });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  runMonthly: async (req, res) => {
    try {
      const result = await runMonthlyPayroll({});
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // Task 10.8 — payroll self-service: any authenticated user gets their own
  // payslips, resolved from their own Employee link (see
  // utils/reviewQueue.js's resolveRequestingEmployee — same lookup every
  // other self-service endpoint uses). Draft-period payslips are withheld:
  // a draft's numbers are still subject to HR edits/recompute, so it isn't
  // a real payslip yet from the employee's point of view.
  myPayslips: async (req, res) => {
    try {
      const employee = await resolveRequestingEmployee(req);
      if (!employee) {
        return res.json({ success: true, items: [] });
      }

      const payslips = await PayslipModel.find({ employee: employee._id })
        .populate("period")
        .sort({ createdAt: -1 });

      const visible = payslips.filter((p) => p.period && p.period.status !== "draft");

      res.json({
        success: true,
        items: visible.map((p) => payslipToClient(p, p.period)),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // Task 3.8, frontend support: lets the "New period" form show HR the
  // current month's FX snapshot (fetching/persisting it on first ask, same
  // get-or-create-once-per-month contract the scheduled job uses) so they
  // can prefill the manual fxRate field with a live number instead of
  // typing one from memory. Read-only from the caller's point of view - it
  // never creates a PayrollPeriod, only (at most) an ExchangeRate snapshot.
  previewFxRate: async (req, res) => {
    try {
      const year = Number(req.params.year);
      const month = Number(req.params.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ success: false, message: "Invalid year/month.", code: "INVALID_YEAR_MONTH" });
      }

      const snapshot = await getOrCreateMonthlyFxRate({ year, month });
      res.json({
        success: true,
        data: {
          year,
          month,
          rateVndPerUsd: snapshot.rateVndPerUsd,
          source: snapshot.source,
          fetchedAt: snapshot.fetchedAt,
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default payrollController;
