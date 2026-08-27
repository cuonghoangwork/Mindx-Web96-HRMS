import RolePermissionModel from "../model/RolePermission.js";
import { MANAGER_CAPABILITIES } from "../utils/permissions.js";

function toClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return { role: o.role, capability: o.capability, enabled: o.enabled };
}

const permissionController = {
  // GET /permissions — ADMIN only.
  list: async (req, res) => {
    try {
      const items = await RolePermissionModel.find({ role: "MANAGER" }).sort({ capability: 1 });
      res.json({ success: true, items: items.map(toClient) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // PATCH /permissions/:role/:capability — ADMIN only. Upserts so this
  // works correctly even if the startup seed hasn't run yet.
  toggle: async (req, res) => {
    try {
      const { role, capability } = req.params;
      if (role !== "MANAGER") {
        return res.status(400).json({
          success: false,
          message: "Only MANAGER capabilities can be toggled.",
          code: "ONLY_MANAGER_CAPABILITIES_TOGGLEABLE",
        });
      }
      if (!MANAGER_CAPABILITIES.includes(capability)) {
        return res.status(400).json({
          success: false,
          message: `capability must be one of: ${MANAGER_CAPABILITIES.join(", ")}.`,
          code: "CAPABILITY_INVALID",
          params: { capabilities: MANAGER_CAPABILITIES.join(", ") },
        });
      }
      if (typeof req.body.enabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "enabled must be true or false.",
          code: "ENABLED_MUST_BE_BOOLEAN",
        });
      }

      const doc = await RolePermissionModel.findOneAndUpdate(
        { role, capability },
        { $set: { enabled: req.body.enabled } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
      );

      res.json({ success: true, data: toClient(doc) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default permissionController;
