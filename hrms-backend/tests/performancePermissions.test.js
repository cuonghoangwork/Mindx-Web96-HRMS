import { describe, it, expect } from "vitest";
import { describePermissions, idOf } from "../utils/performanceScope.js";

const OPEN = { status: "Open" };
const CLOSED = { status: "Closed" };

const SUBMITTED = new Date("2026-08-20T10:00:00.000Z");
const IN_WINDOW = new Date("2026-08-25T10:00:00.000Z");
const PAST_WINDOW = new Date("2026-09-04T10:00:00.000Z");

function access(overrides = {}) {
  return {
    role: "EMPLOYEE",
    isSelf: false,
    isAdmin: false,
    isHR: false,
    isDeptManager: false,
    isOrphan: false,
    canView: false,
    canRateAsManager: false,
    ...overrides,
  };
}

const asSelf = access({ isSelf: true, canView: true });
const asDeptManager = access({
  role: "MANAGER",
  isDeptManager: true,
  canView: true,
  canRateAsManager: true,
});
const asAdmin = access({ role: "ADMIN", isAdmin: true, canView: true, canRateAsManager: true });
const asHrOrphan = access({
  role: "HR",
  isHR: true,
  isOrphan: true,
  canView: true,
  canRateAsManager: true,
});
const asHrNonOrphan = access({ role: "HR", isHR: true, canView: true });
const asOutsider = access();

function reviewWith(overrides = {}) {
  return { managerSubmittedDate: null, appeal: null, ...overrides };
}

describe("idOf", () => {
  it("normalises populated documents, raw ids and empty values", () => {
    expect(idOf({ _id: "abc", name: "Engineering" })).toBe("abc");
    expect(idOf("64f0000000000000000000aa")).toBe("64f0000000000000000000aa");
    expect(idOf(null)).toBe(null);
    expect(idOf(undefined)).toBe(null);
    expect(idOf("")).toBe(null);
  });
});

describe("describePermissions — self review", () => {
  it("lets the subject edit their own half while the cycle is open", () => {
    const p = describePermissions(asSelf, OPEN, reviewWith());
    expect(p.canEditSelf).toBe(true);
    expect(p.canEditCompetencySelf).toBe(true);
    expect(p.canAddGoals).toBe(true);
    expect(p.canEditManager).toBe(false);
    expect(p.canEditCompetencyManager).toBe(false);
  });

  it("locks every edit once the cycle is closed", () => {
    const p = describePermissions(asSelf, CLOSED, reviewWith());
    expect(p.canEditSelf).toBe(false);
    expect(p.canEditCompetencySelf).toBe(false);
    expect(p.canAddGoals).toBe(false);
  });

  it("treats a missing cycle as closed rather than open", () => {
    expect(describePermissions(asSelf, null, reviewWith()).canEditSelf).toBe(false);
    expect(describePermissions(asSelf, undefined, reviewWith()).canAddGoals).toBe(false);
  });
});

describe("describePermissions — manager review", () => {
  it("lets a department manager rate a report but not themselves", () => {
    expect(describePermissions(asDeptManager, OPEN, reviewWith()).canEditManager).toBe(true);

    const ownReview = access({
      role: "MANAGER",
      isSelf: true,
      isDeptManager: true,
      canView: true,
      canRateAsManager: false,
    });
    const p = describePermissions(ownReview, OPEN, reviewWith());
    expect(p.canEditManager).toBe(false);
    expect(p.canEditSelf).toBe(true);
  });

  it("lets HR stand in only for an orphan manager", () => {
    expect(describePermissions(asHrOrphan, OPEN, reviewWith()).canEditManager).toBe(true);
    expect(describePermissions(asHrNonOrphan, OPEN, reviewWith()).canEditManager).toBe(false);
  });

  it("always lets an ADMIN rate someone else", () => {
    expect(describePermissions(asAdmin, OPEN, reviewWith()).canEditManager).toBe(true);
  });

  it("locks the manager half once the cycle is closed", () => {
    expect(describePermissions(asDeptManager, CLOSED, reviewWith()).canEditManager).toBe(false);
    expect(describePermissions(asAdmin, CLOSED, reviewWith()).canEditCompetencyManager).toBe(false);
  });
});

describe("describePermissions — peer feedback", () => {
  it("follows canView and ignores cycle status", () => {
    expect(describePermissions(asSelf, OPEN, reviewWith()).canAddPeerFeedback).toBe(true);
    expect(describePermissions(asSelf, CLOSED, reviewWith()).canAddPeerFeedback).toBe(true);
    expect(describePermissions(asHrNonOrphan, CLOSED, reviewWith()).canAddPeerFeedback).toBe(true);
    expect(describePermissions(asOutsider, OPEN, reviewWith()).canAddPeerFeedback).toBe(false);
  });
});

describe("describePermissions — appeals", () => {
  it("opens filing only for the subject, once a manager review exists", () => {
    const review = reviewWith({ managerSubmittedDate: SUBMITTED });
    expect(describePermissions(asSelf, OPEN, review, IN_WINDOW).canFileAppeal).toBe(true);
    expect(describePermissions(asDeptManager, OPEN, review, IN_WINDOW).canFileAppeal).toBe(false);
    expect(describePermissions(asAdmin, OPEN, review, IN_WINDOW).canFileAppeal).toBe(false);
  });

  it("blocks filing with no manager review, past the window, or when one exists", () => {
    expect(describePermissions(asSelf, OPEN, reviewWith(), IN_WINDOW).canFileAppeal).toBe(false);

    const submitted = reviewWith({ managerSubmittedDate: SUBMITTED });
    expect(describePermissions(asSelf, OPEN, submitted, PAST_WINDOW).canFileAppeal).toBe(false);

    const alreadyAppealed = reviewWith({
      managerSubmittedDate: SUBMITTED,
      appeal: { status: "Pending" },
    });
    expect(describePermissions(asSelf, OPEN, alreadyAppealed, IN_WINDOW).canFileAppeal).toBe(false);
  });

  it("survives a closed cycle, since the window outlives the cycle", () => {
    const review = reviewWith({ managerSubmittedDate: SUBMITTED });
    expect(describePermissions(asSelf, CLOSED, review, IN_WINDOW).canFileAppeal).toBe(true);
  });

  it("lets only HR and ADMIN resolve, and only while pending", () => {
    const pending = reviewWith({
      managerSubmittedDate: SUBMITTED,
      appeal: { status: "Pending" },
    });
    expect(describePermissions(asHrNonOrphan, OPEN, pending).canResolveAppeal).toBe(true);
    expect(describePermissions(asAdmin, OPEN, pending).canResolveAppeal).toBe(true);
    expect(describePermissions(asDeptManager, OPEN, pending).canResolveAppeal).toBe(false);
    expect(describePermissions(asSelf, OPEN, pending).canResolveAppeal).toBe(false);

    const resolved = reviewWith({ appeal: { status: "Resolved" } });
    expect(describePermissions(asAdmin, OPEN, resolved).canResolveAppeal).toBe(false);
    expect(describePermissions(asAdmin, OPEN, reviewWith()).canResolveAppeal).toBe(false);
  });
});

describe("describePermissions — shape", () => {
  it("always returns the same eight boolean keys", () => {
    const expected = [
      "canEditSelf",
      "canEditManager",
      "canEditCompetencySelf",
      "canEditCompetencyManager",
      "canAddGoals",
      "canAddPeerFeedback",
      "canFileAppeal",
      "canResolveAppeal",
    ];

    for (const actor of [asSelf, asDeptManager, asAdmin, asHrOrphan, asOutsider]) {
      for (const cycle of [OPEN, CLOSED, null]) {
        const permissions = describePermissions(actor, cycle, undefined);
        expect(Object.keys(permissions).sort()).toEqual([...expected].sort());
        for (const value of Object.values(permissions)) {
          expect(typeof value).toBe("boolean");
        }
      }
    }
  });
});
