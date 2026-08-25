import { describe, it, expect } from "vitest";
import { computeAnalytics, computeAppealRate, computeComparison, reviewStatusOf } from "../utils/performanceAnalytics.js";
import { COMPETENCIES } from "../model/PerformanceReview.js";

const ENG = { _id: "dept-eng", name: "Engineering" };
const DESIGN = { _id: "dept-design", name: "Design" };

function employee(id, department = ENG) {
  return { _id: id, department };
}

function review(employeeId, overrides = {}) {
  return {
    employee: employeeId,
    selfRating: null,
    managerRating: null,
    selfSubmittedDate: null,
    managerSubmittedDate: null,
    competencies: {},
    ...overrides,
  };
}

describe("reviewStatusOf", () => {
  it("maps submission dates to the four roster statuses", () => {
    expect(reviewStatusOf(undefined)).toBe("Not started");
    expect(reviewStatusOf(review("a"))).toBe("Not started");
    expect(reviewStatusOf(review("a", { selfSubmittedDate: new Date() }))).toBe("Self submitted");
    expect(reviewStatusOf(review("a", { managerSubmittedDate: new Date() }))).toBe("Manager submitted");
    expect(
      reviewStatusOf(review("a", { selfSubmittedDate: new Date(), managerSubmittedDate: new Date() })),
    ).toBe("Completed");
  });
});

describe("computeAnalytics on an empty sample", () => {
  it("returns zero-filled buckets and null averages, never zero averages", () => {
    const result = computeAnalytics({ employees: [], reviews: [] });

    expect(result.totals).toEqual({
      employees: 0,
      notStarted: 0,
      selfSubmitted: 0,
      managerSubmitted: 0,
      completed: 0,
      completionRate: null,
    });
    expect(result.ratingDistribution.self).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(result.ratingDistribution.manager).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(result.averages.self).toBe(null);
    expect(result.averages.manager).toBe(null);
    expect(result.averages.self).not.toBe(0);
  });

  it("still returns all six competency rows in COMPETENCIES order", () => {
    const result = computeAnalytics({ employees: [], reviews: [] });
    expect(result.competencyAverages.map((row) => row.key)).toEqual(COMPETENCIES);
    for (const row of result.competencyAverages) {
      expect(row.self).toBe(null);
      expect(row.manager).toBe(null);
      expect(row.selfCount).toBe(0);
      expect(row.managerCount).toBe(0);
    }
  });

  it("defaults deptCompare to null rather than an empty array", () => {
    expect(computeAnalytics({}).deptCompare).toBe(null);
  });
});

describe("computeAnalytics totals and distribution", () => {
  it("counts every employee into exactly one status bucket", () => {
    const employees = [employee("e1"), employee("e2"), employee("e3"), employee("e4")];
    const reviews = [
      review("e1", { selfSubmittedDate: new Date() }),
      review("e2", { managerSubmittedDate: new Date() }),
      review("e3", { selfSubmittedDate: new Date(), managerSubmittedDate: new Date() }),
    ];

    const { totals } = computeAnalytics({ employees, reviews });

    expect(totals).toEqual({
      employees: 4,
      notStarted: 1,
      selfSubmitted: 1,
      managerSubmitted: 1,
      completed: 1,
      completionRate: 0.25,
    });
    const summed =
      totals.notStarted + totals.selfSubmitted + totals.managerSubmitted + totals.completed;
    expect(summed).toBe(totals.employees);
  });

  it("excludes unsubmitted reviews from the averages instead of counting them as zero", () => {
    const employees = ["e1", "e2", "e3", "e4", "e5"].map((id) => employee(id));
    const reviews = [
      review("e1", { selfRating: 4, selfSubmittedDate: new Date() }),
      review("e2", { selfRating: 2, selfSubmittedDate: new Date() }),
      review("e3"),
      review("e4"),
    ];

    const result = computeAnalytics({ employees, reviews });

    expect(result.averages.self).toBe(3);
    expect(result.averages.manager).toBe(null);
    expect(result.ratingDistribution.self).toEqual({ 1: 0, 2: 1, 3: 0, 4: 1, 5: 0 });
  });

  it("rounds averages to two decimal places", () => {
    const employees = ["e1", "e2", "e3"].map((id) => employee(id));
    const reviews = [
      review("e1", { managerRating: 3 }),
      review("e2", { managerRating: 4 }),
      review("e3", { managerRating: 4 }),
    ];
    expect(computeAnalytics({ employees, reviews }).averages.manager).toBe(3.67);
  });

  it("ignores out-of-range or non-numeric ratings", () => {
    const employees = ["e1", "e2", "e3"].map((id) => employee(id));
    const reviews = [
      review("e1", { selfRating: 0 }),
      review("e2", { selfRating: 9 }),
      review("e3", { selfRating: "4" }),
    ];
    const result = computeAnalytics({ employees, reviews });
    expect(result.averages.self).toBe(null);
    expect(result.ratingDistribution.self).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it("reflects a managerRating overwritten by an adjusted appeal", () => {
    const employees = [employee("e1")];
    const reviews = [
      review("e1", {
        managerRating: 4,
        managerSubmittedDate: new Date(),
        appeal: { status: "Resolved", resolution: "Adjusted", resolvedRating: 4 },
      }),
    ];
    const result = computeAnalytics({ employees, reviews });
    expect(result.ratingDistribution.manager[4]).toBe(1);
    expect(result.averages.manager).toBe(4);
  });

  it("counts an employee with no review document at all", () => {
    const result = computeAnalytics({ employees: [employee("ghost")], reviews: [] });
    expect(result.totals.employees).toBe(1);
    expect(result.totals.notStarted).toBe(1);
  });
});

describe("computeAnalytics competency averages", () => {
  it("averages each rater independently and reports sample sizes", () => {
    const employees = ["e1", "e2", "e3"].map((id) => employee(id));
    const reviews = [
      review("e1", { competencies: { communication: { self: 5, manager: 3 } } }),
      review("e2", { competencies: { communication: { self: 3, manager: null } } }),
      review("e3", { competencies: { execution: { self: null, manager: 4 } } }),
    ];

    const rows = computeAnalytics({ employees, reviews }).competencyAverages;
    const communication = rows.find((row) => row.key === "communication");
    const execution = rows.find((row) => row.key === "execution");
    const leadership = rows.find((row) => row.key === "leadership");

    expect(communication).toEqual({
      key: "communication",
      self: 4,
      manager: 3,
      selfCount: 2,
      managerCount: 1,
    });
    expect(execution.self).toBe(null);
    expect(execution.manager).toBe(4);
    expect(leadership.self).toBe(null);
    expect(leadership.managerCount).toBe(0);
    expect(rows).toHaveLength(COMPETENCIES.length);
  });
});

describe("computeAnalytics department comparison", () => {
  it("returns null unless explicitly asked for", () => {
    const employees = [employee("e1", ENG), employee("e2", DESIGN)];
    expect(computeAnalytics({ employees, reviews: [] }).deptCompare).toBe(null);
    expect(
      computeAnalytics({ employees, reviews: [], includeDeptCompare: false }).deptCompare,
    ).toBe(null);
  });

  it("groups by department, sorted by name, with per-department averages", () => {
    const employees = [
      employee("e1", ENG),
      employee("e2", ENG),
      employee("e3", DESIGN),
    ];
    const reviews = [
      review("e1", {
        selfRating: 4,
        managerRating: 5,
        selfSubmittedDate: new Date(),
        managerSubmittedDate: new Date(),
      }),
      review("e2", { selfRating: 2 }),
      review("e3", { managerRating: 3 }),
    ];

    const deptCompare = computeAnalytics({
      employees,
      reviews,
      includeDeptCompare: true,
    }).deptCompare;

    expect(deptCompare.map((row) => row.department)).toEqual(["Design", "Engineering"]);

    const eng = deptCompare.find((row) => row.department === "Engineering");
    expect(eng).toEqual({
      departmentId: "dept-eng",
      department: "Engineering",
      employees: 2,
      completed: 1,
      avgSelf: 3,
      avgManager: 5,
    });

    const design = deptCompare.find((row) => row.department === "Design");
    expect(design.employees).toBe(1);
    expect(design.completed).toBe(0);
    expect(design.avgSelf).toBe(null);
  });

  it("keeps employees with no department in their own bucket so the counts still add up", () => {
    const employees = [employee("e1", ENG), employee("e2", null)];
    const result = computeAnalytics({ employees, reviews: [], includeDeptCompare: true });
    const total = result.deptCompare.reduce((sum, row) => sum + row.employees, 0);
    expect(total).toBe(result.totals.employees);
    expect(result.deptCompare.some((row) => row.departmentId === null)).toBe(true);
  });

  it("accepts an unpopulated department ObjectId without crashing", () => {
    const employees = [employee("e1", "64f0000000000000000000aa")];
    const result = computeAnalytics({ employees, reviews: [], includeDeptCompare: true });
    expect(result.deptCompare).toHaveLength(1);
    expect(result.deptCompare[0].departmentId).toBe("64f0000000000000000000aa");
    expect(result.deptCompare[0].department).toBe(null);
  });
});

describe("computeAppealRate", () => {
  it("returns null for a zero-employee cycle instead of dividing by zero", () => {
    expect(computeAppealRate([], 0)).toBe(null);
  });

  it("counts reviews carrying an appeal, divided by the full employee count", () => {
    const reviews = [
      review("e1", { appeal: { status: "Pending" } }),
      review("e2", { appeal: null }),
      review("e3", {}),
    ];
    expect(computeAppealRate(reviews, 4)).toBe(0.25);
  });

  it("treats employees with no review document as non-appealed", () => {
    expect(computeAppealRate([review("e1", { appeal: { status: "Resolved" } })], 5)).toBe(0.2);
  });
});

describe("computeComparison", () => {
  const currentAnalytics = (overrides = {}) => ({
    totals: { employees: 4, notStarted: 0, selfSubmitted: 0, managerSubmitted: 4, completed: 4, completionRate: 1 },
    averages: { self: 4, manager: 3.5 },
    competencyAverages: [
      { key: "communication", self: 4, manager: 3, selfCount: 4, managerCount: 4 },
      { key: "execution", self: null, manager: null, selfCount: 0, managerCount: 0 },
    ],
    appealRate: 0.25,
    ...overrides,
  });

  it("returns every delta as null when there is no previous cycle", () => {
    const result = computeComparison(currentAnalytics(), null);
    expect(result.avgSelfDelta).toBe(null);
    expect(result.avgManagerDelta).toBe(null);
    expect(result.completionRateDelta).toBe(null);
    expect(result.appealRateDelta).toBe(null);
    expect(result.competencyDeltas).toEqual([
      { key: "communication", selfDelta: null, managerDelta: null },
      { key: "execution", selfDelta: null, managerDelta: null },
    ]);
  });

  it("computes rounded deltas against a real previous cycle", () => {
    const previous = currentAnalytics({
      totals: { employees: 4, notStarted: 1, selfSubmitted: 0, managerSubmitted: 0, completed: 3, completionRate: 0.75 },
      averages: { self: 3.7, manager: 3.2 },
      competencyAverages: [
        { key: "communication", self: 3.5, manager: 2.5, selfCount: 4, managerCount: 4 },
        { key: "execution", self: 4, manager: 4, selfCount: 2, managerCount: 2 },
      ],
      appealRate: 0.5,
    });

    const result = computeComparison(currentAnalytics(), previous);

    expect(result.avgSelfDelta).toBe(0.3);
    expect(result.avgManagerDelta).toBe(0.3);
    expect(result.completionRateDelta).toBe(0.25);
    expect(result.appealRateDelta).toBe(-0.25);
    expect(result.competencyDeltas).toEqual([
      { key: "communication", selfDelta: 0.5, managerDelta: 0.5 },
      // current has no execution ratings at all (null) — delta stays null, not -4.
      { key: "execution", selfDelta: null, managerDelta: null },
    ]);
  });

  it("leaves a delta null when only one side has data, rather than comparing against 0", () => {
    const previous = currentAnalytics({ averages: { self: null, manager: null } });
    const result = computeComparison(currentAnalytics(), previous);
    expect(result.avgSelfDelta).toBe(null);
    expect(result.avgManagerDelta).toBe(null);
  });
});
