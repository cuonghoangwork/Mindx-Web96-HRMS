export function publicRegistrationEnabled() {
  return process.env.ALLOW_PUBLIC_REGISTRATION === "true";
}

export function accountEmailDomain() {
  return process.env.ACCOUNT_EMAIL_DOMAIN || "hrms.com";
}

export function blockIfRegistrationClosed(req, res, next) {
  if (!publicRegistrationEnabled()) {
    return res.status(403).json({
      success: false,
      message: "Public registration is disabled. Contact your HR administrator.",
    });
  }
  next();
}
