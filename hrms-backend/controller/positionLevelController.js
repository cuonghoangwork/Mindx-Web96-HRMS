import PositionLevelModel, { POSITION_LEVELS } from "../model/PositionLevel.js";

function toClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    level: o.level,
    order: o.order,
    baseSalary: o.baseSalary,
    note: o.note ?? "",
  };
}

const positionLevelController = {
  // GET /position-levels — any authenticated user (used to render the
  // ladder and to pre-fill proposed salary in the promotion UI).
  getAll: async (req, res) => {
    try {
      const items = await PositionLevelModel.find().sort({ order: 1 });
      res.json({ success: true, items: items.map(toClient) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // PATCH /position-levels/:level — ADMIN only. Upserts by level name so
  // seeding/re-seeding is idempotent; only baseSalary/note are editable —
  // level and order are structural and not meant to change at runtime.
  updateBaseSalary: async (req, res) => {
    try {
      const { level } = req.params;
      if (!POSITION_LEVELS.includes(level)) {
        return res.status(400).json({
          success: false,
          message: `level must be one of: ${POSITION_LEVELS.join(", ")}.`,
          code: "POSITION_LEVEL_INVALID",
          params: { levels: POSITION_LEVELS.join(", ") },
        });
      }
      const { baseSalary, note } = req.body;
      if (baseSalary === undefined || isNaN(Number(baseSalary)) || Number(baseSalary) < 0) {
        return res.status(400).json({
          success: false,
          message: "baseSalary must be a non-negative number.",
          code: "BASE_SALARY_INVALID",
        });
      }

      const doc = await PositionLevelModel.findOneAndUpdate(
        { level },
        { $set: { baseSalary: Number(baseSalary), ...(note !== undefined ? { note } : {}) } },
        { new: true, runValidators: true },
      );
      if (!doc) {
        return res.status(404).json({
          success: false,
          message: `PositionLevel "${level}" hasn't been seeded yet.`,
          code: "POSITION_LEVEL_NOT_SEEDED",
          params: { level },
        });
      }

      res.json({ success: true, data: toClient(doc) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default positionLevelController;
