// Shared position-level label lookup, mirroring leaveTypeLabel (leaveTypes.js)
// and getRoleLabel (roles.js) for the same enum-to-display-label need.
export function positionLevelLabel(level, t) {
  return t ? t(`common.positionLevel.${level}`, { defaultValue: level }) : level;
}
