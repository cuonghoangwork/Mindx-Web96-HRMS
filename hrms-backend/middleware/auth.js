import jwt from "jsonwebtoken";

const PASSWORD_GATE_ALLOW = ["/auth/me", "/auth/change-password", "/auth/logout"];

export function isPasswordGateAllowed(baseUrl = "", path = "") {
  const route = `${baseUrl}${path}`.replace(/\/+$/, "") || `${baseUrl}${path}`;
  return PASSWORD_GATE_ALLOW.some((allowed) => route.endsWith(allowed));
}

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided.", code: "NO_TOKEN_PROVIDED" });
  }

  try {
    const decoded = jwt.verify(token, process.env.AT_SECRETKEY);
    if (decoded.tokenType !== "AT") {
      return res.status(401).json({ success: false, message: "Invalid token type.", code: "INVALID_TOKEN_TYPE" });
    }

    if (decoded.mustChangePassword === true && !isPasswordGateAllowed(req.baseUrl, req.path)) {
      return res.status(403).json({
        success: false,
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "You must change your password before continuing.",
      });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token is invalid or expired.", code: "TOKEN_INVALID_OR_EXPIRED" });
  }
};

// Variadic - supports any number of allowed roles per route, stacked after verifyToken.
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Access denied.", code: "ACCESS_DENIED" });
  }
  next();
};
