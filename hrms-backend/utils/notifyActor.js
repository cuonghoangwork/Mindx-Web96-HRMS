// Shared by notification call sites whose message names the acting user
// (departmentController.js, employeeController.js).
//
// The JWT now carries `name` (controller/authController.js), so the
// "*ByUnknown" branch is no longer the normal case — it used to be the ONLY
// case, which is why these keys exist at all. It still earns its keep: an
// access token minted before that change lasts up to 20 minutes, and a
// scheduled job calling into this path has no req.user at all.
export function actorNotifyKeys(req, baseKey, baseParams) {
  const actorName = req.user?.name;
  return {
    titleKey: baseKey,
    messageKey: actorName ? baseKey : `${baseKey}ByUnknown`,
    params: actorName ? { ...baseParams, actorName } : baseParams,
  };
}
