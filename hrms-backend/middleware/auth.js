import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.AT_SECRETKEY);
    if (decoded.tokenType !== "AT") {
      return res.status(401).json({ success: false, message: "Invalid token type." });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token is invalid or expired." });
  }
};

// Variadic - supports any number of allowed roles per route, stacked after verifyToken.
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }
  next();
};
