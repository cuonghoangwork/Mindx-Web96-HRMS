import jwt from "jsonwebtoken";

/**
 * Signs an Access Token + Refresh Token pair from the same payload,
 * using two SEPARATE secrets (AT_SECRETKEY / RT_SECRETKEY) so a leaked
 * AT secret can't be used to forge refresh tokens.
 */
export function signTokens(payload) {
  const access_token = jwt.sign(
    { ...payload, tokenType: "AT" },
    process.env.AT_SECRETKEY,
    { expiresIn: process.env.AT_EXPIRES_IN || "20m" },
  );
  const refresh_token = jwt.sign(
    { ...payload, tokenType: "RT" },
    process.env.RT_SECRETKEY,
    { expiresIn: process.env.RT_EXPIRES_IN || "4w" },
  );
  return { access_token, refresh_token };
}
