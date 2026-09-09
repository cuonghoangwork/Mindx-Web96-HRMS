import AuditLog from "../model/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const auditLogController = {
  /**
   * GET /api/v1/audit-log
   * Query params:
   *   limit      — number of entries (default 20, max 100)
   *   resource   — filter by resource type
   *   action     — filter by action
   *   actorId    — filter by actor user id
   */
  getAll: asyncHandler(async (req, res) => {
    const { limit = 20, resource, action, actorId } = req.query;
    const safeLimit = Math.min(Number(limit) || 20, 100);

    const condition = {};
    if (resource) condition.resource = resource;
    if (action)   condition.action   = action;
    if (actorId)  condition["actor.id"] = actorId;

    const items = await AuditLog.find(condition)
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json({ success: true, items });
  }, 500),

  /**
   * GET /api/v1/audit-log/recent?limit=10
   * Shortcut used by Dashboard "Recent Activity" feed.
   * Returns the last N entries with a category/icon hint the frontend can map.
   */
  getRecent: asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const items = await AuditLog.find()
      .select("-changes")
      .sort({ createdAt: -1 })
      .limit(limit);

    // Enrich each entry with a `category` field that matches the
    // frontend's Notifications.jsx CATEGORY_CONFIG keys so the same
    // icon chips can be reused on the Dashboard.
    const RESOURCE_CATEGORY = {
      employee:     "employee",
      department:   "employee",
      attendance:   "leave",
      job:          "interview",
      candidate:    "interview",
      holiday:      "holiday",
      notification: "system",
      user:         "system",
      promotion:    "employee",
      payroll:      "payroll",
      performance:  "employee",
    };

    const enriched = items.map((entry) => {
      const e = entry.toObject();
      e.category = RESOURCE_CATEGORY[e.resource] ?? "system";
      // Human-readable title for the activity feed
      e.title = buildTitle(e);
      return e;
    });

    res.json({ success: true, items: enriched });
  }, 500),
};

/** Build a short, human-friendly activity title. */
function buildTitle({ action, resource, label, actor }) {
  const who  = label  || "Unknown";
  const by   = actor?.name ? ` by ${actor.name}` : "";
  switch (action) {
    case "created":         return `${capitalise(resource)} added: ${who}`;
    case "updated":         return `${capitalise(resource)} updated: ${who}`;
    case "deleted":         return `${capitalise(resource)} removed: ${who}`;
    case "uploaded_avatar": return `Avatar updated for ${who}`;
    case "checked_in":      return `${who} clocked in`;
    case "checked_out":     return `${who} clocked out`;
    case "status_changed":  return `Status changed: ${who}`;
    case "budget_updated":  return `Budget updated: ${who}`;
    case "stage_changed":   return `Hiring stage changed: ${who}`;
    case "login":           return `${who} signed in`;
    case "logout":          return `${who} signed out`;
    case "registered":      return `New account registered: ${who}`;
    // `label` already reads "<email>: MANAGER -> HR (reason)", so it carries
    // the whole story — a prefix here would only repeat it.
    case "role_migrated":   return `Role migrated — ${who}`;
    default:                return `${who} — ${action}`;
  }
}

function capitalise(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default auditLogController;
