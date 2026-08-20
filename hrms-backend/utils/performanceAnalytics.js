import { COMPETENCIES, RATING_OPTIONS } from "../model/PerformanceReview.js";

function isRating(value) {
  return Number.isFinite(value) && value >= 1 && value <= 5;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function average(values) {
  if (!values.length) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function emptyBuckets() {
  return Object.fromEntries(RATING_OPTIONS.map((option) => [option, 0]));
}

function idOf(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function nameOf(value) {
  return value && typeof value === "object" && value.name ? value.name : null;
}

export function reviewStatusOf(review) {
  const self = Boolean(review?.selfSubmittedDate);
  const manager = Boolean(review?.managerSubmittedDate);
  if (self && manager) return "Completed";
  if (manager) return "Manager submitted";
  if (self) return "Self submitted";
  return "Not started";
}

export function computeAnalytics({ employees = [], reviews = [], includeDeptCompare = false } = {}) {
  const byEmployee = new Map(reviews.map((review) => [String(review.employee), review]));

  const totals = {
    employees: employees.length,
    notStarted: 0,
    selfSubmitted: 0,
    managerSubmitted: 0,
    completed: 0,
  };
  const statusKey = {
    "Not started": "notStarted",
    "Self submitted": "selfSubmitted",
    "Manager submitted": "managerSubmitted",
    Completed: "completed",
  };

  const ratingDistribution = { self: emptyBuckets(), manager: emptyBuckets() };
  const selfRatings = [];
  const managerRatings = [];
  const competencyValues = new Map(
    COMPETENCIES.map((key) => [key, { self: [], manager: [] }]),
  );
  const departments = new Map();

  for (const employee of employees) {
    const review = byEmployee.get(String(employee._id));
    const status = reviewStatusOf(review);
    totals[statusKey[status]] += 1;

    const selfRating = review?.selfRating;
    const managerRating = review?.managerRating;

    if (isRating(selfRating)) {
      ratingDistribution.self[selfRating] += 1;
      selfRatings.push(selfRating);
    }
    if (isRating(managerRating)) {
      ratingDistribution.manager[managerRating] += 1;
      managerRatings.push(managerRating);
    }

    for (const key of COMPETENCIES) {
      const pair = review?.competencies?.[key];
      if (isRating(pair?.self)) competencyValues.get(key).self.push(pair.self);
      if (isRating(pair?.manager)) competencyValues.get(key).manager.push(pair.manager);
    }

    if (includeDeptCompare) {
      const departmentId = idOf(employee.department);
      if (!departments.has(departmentId)) {
        departments.set(departmentId, {
          departmentId,
          department: nameOf(employee.department),
          employees: 0,
          completed: 0,
          self: [],
          manager: [],
        });
      }
      const bucket = departments.get(departmentId);
      bucket.employees += 1;
      if (status === "Completed") bucket.completed += 1;
      if (isRating(selfRating)) bucket.self.push(selfRating);
      if (isRating(managerRating)) bucket.manager.push(managerRating);
    }
  }

  const competencyAverages = COMPETENCIES.map((key) => {
    const { self, manager } = competencyValues.get(key);
    return {
      key,
      self: average(self),
      manager: average(manager),
      selfCount: self.length,
      managerCount: manager.length,
    };
  });

  const deptCompare = includeDeptCompare
    ? [...departments.values()]
        .map((bucket) => ({
          departmentId: bucket.departmentId,
          department: bucket.department,
          employees: bucket.employees,
          completed: bucket.completed,
          avgSelf: average(bucket.self),
          avgManager: average(bucket.manager),
        }))
        .sort((a, b) => String(a.department ?? "").localeCompare(String(b.department ?? "")))
    : null;

  return {
    totals,
    ratingDistribution,
    averages: { self: average(selfRatings), manager: average(managerRatings) },
    competencyAverages,
    deptCompare,
  };
}
