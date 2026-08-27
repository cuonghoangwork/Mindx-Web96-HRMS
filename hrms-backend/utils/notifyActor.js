// Shared by notification call sites whose message names the acting user
// (departmentController.js, employeeController.js) — req.user.name is never
// populated in the JWT payload (see utils/tokens.js), so these always need a
// "*ByUnknown" fallback key/params when the actor is missing.
export function actorNotifyKeys(req, baseKey, baseParams) {
  const actorName = req.user?.name;
  return {
    titleKey: baseKey,
    messageKey: actorName ? baseKey : `${baseKey}ByUnknown`,
    params: actorName ? { ...baseParams, actorName } : baseParams,
  };
}
