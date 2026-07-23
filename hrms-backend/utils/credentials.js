import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%&*?";
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

const ASSIGNABLE_BY_ROLE = {
  ADMIN: ["EMPLOYEE", "MANAGER", "ADMIN"],
  MANAGER: ["EMPLOYEE"],
};

function pick(pool) {
  return pool[randomInt(pool.length)];
}

export function generateTempPassword(length = 12) {
  const min = 8;
  const size = Math.max(min, Number(length) || min);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < size) {
    chars.push(pick(ALL));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function resolveAccountEmail(employeeId, email) {
  const supplied = typeof email === "string" ? email.trim() : "";
  if (supplied) return supplied.toLowerCase();

  const code = typeof employeeId === "string" ? employeeId.trim() : "";
  if (!code) throw new Error("employeeId is required to derive a login email.");

  const domain = process.env.ACCOUNT_EMAIL_DOMAIN || "hrms.com";
  return `${code.toLowerCase()}@${domain.toLowerCase()}`;
}

export function assignableRoles(actorRole) {
  return ASSIGNABLE_BY_ROLE[actorRole] || [];
}

export function assertCanAssignRole(actorRole, targetRole) {
  const allowed = assignableRoles(actorRole);
  if (!allowed.includes(targetRole)) {
    const err = new Error(
      `Your role (${actorRole || "unknown"}) cannot create ${targetRole || "unknown"} accounts.`,
    );
    err.status = 403;
    throw err;
  }
  return targetRole;
}
