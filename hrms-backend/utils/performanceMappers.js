import mongoose from "mongoose";
import { COMPETENCIES } from "../model/PerformanceReview.js";
import { reviewStatusOf } from "./performanceAnalytics.js";
import { appealDeadlineKey } from "./performanceCycles.js";
import { idOf } from "./performanceScope.js";
import { AppError } from "./appError.js";

/**
 * Pure DTO mappers for the performance domain — no Express, no database.
 *
 * Lifted out of performanceController.js, which held 134 lines of these ahead
 * of its 18 HTTP handlers (B3: "leave the controller doing HTTP only").
 *
 * NOTE ON THE RENAME. The controller called one of these `employeeToClient`,
 * which collided with the `employeeToClient` in utils/mappers.js — and the two
 * were NOT the same function. mappers.js returns the full 18-field employee
 * DTO keyed `id`; this one returns a 5-field summary keyed `employeeId` for
 * embedding in review payloads. Two different contracts under one name is a
 * trap, so this is now `employeeSummary`. Its output is unchanged.
 */

export function cycleToClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    key: o.key,
    label: o.label,
    kind: o.kind,
    status: o.status,
    start: o.start ?? null,
    end: o.end ?? null,
    statusOverriddenAt: o.statusOverriddenAt ?? null,
  };
}

function competenciesToClient(value) {
  const source = value && typeof value.toObject === "function" ? value.toObject() : (value ?? {});
  return Object.fromEntries(
    COMPETENCIES.map((key) => [
      key,
      {
        self: source?.[key]?.self ?? null,
        selfComment: source?.[key]?.selfComment ?? "",
        manager: source?.[key]?.manager ?? null,
        managerComment: source?.[key]?.managerComment ?? "",
      },
    ]),
  );
}

function goalToClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    text: o.text ?? "",
    progress: o.progress ?? 0,
  };
}

function peerFeedbackToClient(doc, includeAudit) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    name: o.name ?? "",
    relation: o.relation ?? "",
    comments: o.comments ?? "",
    addedAt: o.addedAt ?? null,
    ...(includeAudit ? { addedBy: o.addedBy ? String(o.addedBy) : null } : {}),
  };
}

function appealToClient(value) {
  if (!value) return null;
  const o = typeof value.toObject === "function" ? value.toObject() : value;
  return {
    reasonCategory: o.reasonCategory ?? null,
    detail: o.detail ?? "",
    status: o.status ?? null,
    filedDate: o.filedDate ?? null,
    resolution: o.resolution ?? null,
    resolvedRating: o.resolvedRating ?? null,
    resolverNote: o.resolverNote ?? "",
    resolvedDate: o.resolvedDate ?? null,
  };
}

export function emptyReviewDoc(cycleKey, employeeId) {
  return {
    _id: null,
    cycleKey,
    employee: employeeId,
    selfRating: null,
    selfComments: "",
    selfSubmittedDate: null,
    managerRating: null,
    managerComments: "",
    managerSubmittedDate: null,
    competencies: {},
    goals: [],
    peerFeedback: [],
    appeal: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function reviewToClient(doc, includeAudit = false) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    cycleKey: o.cycleKey ?? null,
    employeeId: idOf(o.employee),
    selfRating: o.selfRating ?? null,
    selfComments: o.selfComments ?? "",
    selfSubmittedDate: o.selfSubmittedDate ?? null,
    managerRating: o.managerRating ?? null,
    managerComments: o.managerComments ?? "",
    managerSubmittedDate: o.managerSubmittedDate ?? null,
    competencies: competenciesToClient(o.competencies),
    goals: (o.goals ?? []).map(goalToClient),
    peerFeedback: (o.peerFeedback ?? []).map((row) => peerFeedbackToClient(row, includeAudit)),
    appeal: appealToClient(o.appeal),
    status: reviewStatusOf(o),
    appealDeadline: appealDeadlineKey(o.managerSubmittedDate),
    createdAt: o.createdAt ?? null,
    updatedAt: o.updatedAt ?? null,
  };
}

export function employeeSummary(employee) {
  return {
    employeeId: String(employee._id),
    employeeCode: employee.employeeId ?? null,
    name: employee.name ?? null,
    department: employee.department?.name ?? null,
    departmentId: idOf(employee.department),
  };
}

export function numberOr(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : Number(value);
}

export function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const err = new AppError(`${label} is not a valid id.`, "INVALID_OBJECT_ID", { label });
    err.status = 400;
    throw err;
  }
}
