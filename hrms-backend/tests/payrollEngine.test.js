import { describe, it, expect } from "vitest";
import {
  BHTN_CAP_VND,
  BHXH_BHYT_CAP_VND,
  PERSONAL_DEDUCTION_VND,
  autoDeductionVnd,
  calcProgressivePitVnd,
  computePayslip,
  seedBaseSalaryVnd,
  standardWorkingDaysInMonth,
} from "../utils/payrollEngine.js";

describe("calcProgressivePitVnd", () => {
  it("returns 0 for zero and negative income", () => {
    expect(calcProgressivePitVnd(0)).toBe(0);
    expect(calcProgressivePitVnd(-1)).toBe(0);
    expect(calcProgressivePitVnd(undefined)).toBe(0);
  });

  it("taxes each band at its own rate", () => {
    expect(calcProgressivePitVnd(5_000_000)).toBe(250_000);
    expect(calcProgressivePitVnd(10_000_000)).toBe(750_000);
    expect(calcProgressivePitVnd(18_000_000)).toBe(1_950_000);
    expect(calcProgressivePitVnd(32_000_000)).toBe(4_750_000);
  });

  it("is monotonic non-decreasing", () => {
    let prev = 0;
    for (let i = 0; i <= 120_000_000; i += 1_000_000) {
      const tax = calcProgressivePitVnd(i);
      expect(tax).toBeGreaterThanOrEqual(prev);
      prev = tax;
    }
  });

  it("never exceeds 35% of income", () => {
    for (const income of [1, 5_000_000, 50_000_000, 500_000_000]) {
      expect(calcProgressivePitVnd(income)).toBeLessThanOrEqual(income * 0.35);
    }
  });
});

describe("computePayslip", () => {
  const CASES = [
    {},
    { baseSalary: 1 },
    { baseSalary: 7 },
    { baseSalary: 10 },
    { baseSalary: 1, deduction: 5 },
    { baseSalary: 12_000_000 },
    { baseSalary: 11_000_001 },
    { baseSalary: BHXH_BHYT_CAP_VND },
    { baseSalary: BHXH_BHYT_CAP_VND + 1 },
    { baseSalary: BHTN_CAP_VND },
    { baseSalary: BHTN_CAP_VND + 1 },
    { baseSalary: 177_083_333 },
    { baseSalary: 10_000_000, bonus: 50_000_000_000 },
    { baseSalary: 10_000_000, deduction: 10_000_000 },
    { baseSalary: 10_000_000, bonus: 2_000_000, allowance: 3_000_000, deduction: 15_000_000 },
    { baseSalary: 10_000_000, bonus: 2_000_000, allowance: 3_000_000, deduction: 99_000_000 },
    { allowance: 50_000_000 },
    { bonus: 50_000_000 },
  ];

  it("reconciles exactly: grossPay === netPay + insuranceTotal + pit", () => {
    for (const input of CASES) {
      const r = computePayslip(input);
      expect(r.grossPay).toBe(r.netPay + r.insuranceTotal + r.pit);
    }
  });

  it("sums insuranceTotal from the already-rounded parts", () => {
    for (const input of CASES) {
      const r = computePayslip(input);
      expect(r.insuranceTotal).toBe(r.bhxh + r.bhyt + r.bhtn);
    }
  });

  it("returns integers for every field", () => {
    for (const input of CASES) {
      for (const [key, value] of Object.entries(computePayslip(input))) {
        expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      }
    }
  });

  it("never produces a negative net pay", () => {
    for (const input of CASES) {
      expect(computePayslip(input).netPay).toBeGreaterThanOrEqual(0);
    }
  });

  it("holds both invariants across a deterministic fuzz sweep", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 20_000; i += 1) {
      const baseSalary = Math.floor(rnd() * 300_000_000);
      const bonus = Math.floor(rnd() * 100_000_000);
      const allowance = Math.floor(rnd() * 50_000_000);
      const deduction = Math.floor(rnd() * (baseSalary + bonus + allowance + 1));
      const r = computePayslip({ baseSalary, bonus, allowance, deduction });
      expect(r.grossPay).toBe(r.netPay + r.insuranceTotal + r.pit);
      expect(r.netPay).toBeGreaterThanOrEqual(0);
      expect(r.insuranceTotal).toBe(r.bhxh + r.bhyt + r.bhtn);
    }
  });

  it("caps BHXH and BHYT at 20x the statutory base salary", () => {
    const r = computePayslip({ baseSalary: 100_000_000 });
    expect(r.bhxh).toBe(3_744_000);
    expect(r.bhyt).toBe(702_000);
  });

  it("caps BHTN at 20x the region I minimum wage", () => {
    const r = computePayslip({ baseSalary: 200_000_000 });
    expect(r.bhtn).toBe(992_000);
  });

  it("excludes bonus from the insurance base but not from tax", () => {
    const without = computePayslip({ baseSalary: 20_000_000, allowance: 1_000_000 });
    const with_ = computePayslip({ baseSalary: 20_000_000, allowance: 1_000_000, bonus: 50_000_000 });
    expect(with_.bhxh).toBe(without.bhxh);
    expect(with_.bhyt).toBe(without.bhyt);
    expect(with_.bhtn).toBe(without.bhtn);
    expect(with_.insuranceBase).toBe(without.insuranceBase);
    expect(with_.pit).toBeGreaterThan(without.pit);
  });

  it("subtracts the manual deduction before tax", () => {
    const without = computePayslip({ baseSalary: 60_000_000 });
    const with_ = computePayslip({ baseSalary: 60_000_000, deduction: 20_000_000 });
    expect(with_.grossPay).toBe(without.grossPay - 20_000_000);
    expect(with_.pit).toBeLessThan(without.pit);
  });

  it("never insures more than what was actually paid", () => {
    const r = computePayslip({ baseSalary: 10_000_000, allowance: 5_000_000, deduction: 12_000_000 });
    expect(r.insuranceBase).toBeLessThanOrEqual(r.grossPay);
  });

  it("charges no tax when gross minus insurance is under the personal deduction", () => {
    const r = computePayslip({ baseSalary: PERSONAL_DEDUCTION_VND });
    expect(r.taxableIncome).toBe(0);
    expect(r.pit).toBe(0);
  });

  it("clamps a deduction larger than earnings to a zero payslip", () => {
    const r = computePayslip({ baseSalary: 1_000_000, deduction: 9_999_999 });
    expect(r.grossPay).toBe(0);
    expect(r.netPay).toBe(0);
    expect(r.insuranceTotal).toBe(0);
    expect(r.pit).toBe(0);
  });
});

describe("seedBaseSalaryVnd", () => {
  it("converts an annual USD salary to a monthly VND figure", () => {
    expect(seedBaseSalaryVnd(60_000, 25_000)).toBe(125_000_000);
    expect(seedBaseSalaryVnd(85_000, 25_000)).toBe(177_083_333);
  });

  it("returns 0 for missing or invalid input", () => {
    expect(seedBaseSalaryVnd(0, 25_000)).toBe(0);
    expect(seedBaseSalaryVnd(60_000, 0)).toBe(0);
    expect(seedBaseSalaryVnd(undefined, 25_000)).toBe(0);
    expect(seedBaseSalaryVnd(60_000, undefined)).toBe(0);
  });
});

describe("standardWorkingDaysInMonth", () => {
  it("counts Monday to Friday", () => {
    expect(standardWorkingDaysInMonth(2026, 8)).toBe(21);
    expect(standardWorkingDaysInMonth(2026, 2)).toBe(20);
    expect(standardWorkingDaysInMonth(2024, 2)).toBe(21);
    expect(standardWorkingDaysInMonth(2026, 1)).toBe(22);
  });

  it("handles December without rolling into the next year", () => {
    expect(standardWorkingDaysInMonth(2026, 12)).toBe(23);
  });

  it("always returns a value between 19 and 23", () => {
    for (let y = 2024; y <= 2030; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const n = standardWorkingDaysInMonth(y, m);
        expect(n).toBeGreaterThanOrEqual(19);
        expect(n).toBeLessThanOrEqual(23);
      }
    }
  });

  it("rejects an invalid month", () => {
    expect(() => standardWorkingDaysInMonth(2026, 0)).toThrow(/Invalid year\/month/);
    expect(() => standardWorkingDaysInMonth(2026, 13)).toThrow(/Invalid year\/month/);
  });
});

describe("autoDeductionVnd", () => {
  const STD = 21;

  it("returns 0 when no chargeable days", () => {
    expect(autoDeductionVnd({ baseSalary: 21_000_000, standardWorkingDays: STD })).toBe(0);
  });

  it("charges one daily rate per chargeable day", () => {
    const baseSalary = 21_000_000;
    const daily = Math.round(baseSalary / STD);
    expect(autoDeductionVnd({ baseSalary, unpaidLeaveDays: 3, standardWorkingDays: STD }))
      .toBe(daily * 3);
    expect(autoDeductionVnd({ baseSalary, absentDays: 2, standardWorkingDays: STD }))
      .toBe(daily * 2);
    expect(autoDeductionVnd({ baseSalary, unpaidLeaveDays: 1, absentDays: 2, standardWorkingDays: STD }))
      .toBe(daily * 3);
  });

  it("includes allowance in the daily rate but excludes bonus", () => {
    const withAllowance = autoDeductionVnd({
      baseSalary: 21_000_000, allowance: 2_100_000, unpaidLeaveDays: 1, standardWorkingDays: STD,
    });
    const withBonus = autoDeductionVnd({
      baseSalary: 21_000_000, bonus: 2_100_000, unpaidLeaveDays: 1, standardWorkingDays: STD,
    });
    expect(withAllowance).toBe(Math.round(23_100_000 / STD));
    expect(withBonus).toBe(Math.round(21_000_000 / STD));
  });

  it("never exceeds base + bonus + allowance", () => {
    const capped = autoDeductionVnd({
      baseSalary: 21_000_000, unpaidLeaveDays: 31, absentDays: 31, standardWorkingDays: STD,
    });
    expect(capped).toBe(21_000_000);
  });

  it("returns 0 when standardWorkingDays is missing or non-positive", () => {
    expect(autoDeductionVnd({ baseSalary: 21_000_000, absentDays: 3 })).toBe(0);
    expect(autoDeductionVnd({ baseSalary: 21_000_000, absentDays: 3, standardWorkingDays: 0 })).toBe(0);
  });

  it("ignores negative day counts", () => {
    expect(autoDeductionVnd({
      baseSalary: 21_000_000, unpaidLeaveDays: -5, absentDays: -5, standardWorkingDays: STD,
    })).toBe(0);
  });
});
