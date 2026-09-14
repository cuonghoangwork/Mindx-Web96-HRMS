/**
 * Review queue for repeated no-shows (DECISIONS.md D2, D6). No manual
 * create — every request comes from the close job. "Approved" means HR
 * confirmed the pattern and is following up outside the system; "Rejected"
 * means reviewed, no action. Neither changes the employee record.
 */

import NoShowReviewModel from "../model/NoShowReview.js";
import { createReviewRequestController } from "../utils/reviewQueue.js";
import { toPlainObject, reviewRequestBase } from "../utils/mappers.js";

const POPULATE = [["employee", "name email employeeId"]];

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = toPlainObject(doc);
  return {
    ...reviewRequestBase(o),
    employeeCode: o.employee?.employeeId ?? null,
    noShowCount: o.noShowCountAtFlag,
    reason: o.reason ?? "",
    systemGenerated: Boolean(o.systemGenerated),
    flaggedAt: o.flaggedAt,
  };
}

const { list, review } = createReviewRequestController({
  Model: NoShowReviewModel,
  resourceLabel: "no-show review",
  populate: POPULATE,
  toClient: toClientRequest,
  // No onApprove side effect, by design (D2).
  notifyEmployee: (decision, request) => {
    if (decision === "approved") {
      return {
        title: "Attendance record reviewed",
        message: `HR reviewed your attendance record and confirmed a pattern of ${request.noShowCountAtFlag} no-show day(s) on file.${request.reviewNote ? ` Note: ${request.reviewNote}` : " Please speak with HR if you have questions."}`,
      };
    }
    return {
      title: "Attendance record reviewed",
      message: `HR reviewed your attendance record. No further action was taken.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
    };
  },
  employeeLink: "/attendance",
  employeeLinkLabel: "View attendance",
});

const noShowReviewController = { list, review };

export default noShowReviewController;
