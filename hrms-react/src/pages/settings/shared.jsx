import { getRoleLabel } from '../../utils/roles'

/* ─────────────────────────────────────────────
   Shared helpers / sub-components
───────────────────────────────────────────── */
const ROLE_STYLE = {
  ADMIN:    { bg: 'var(--bg-primary-subtle)', color: 'var(--txt-primary-brand)', border: 'rgba(47,111,237,0.25)' },
  HR:       { bg: 'var(--bg-info-subtle)',    color: 'var(--txt-info)',           border: 'var(--bdr-info)' },
  MANAGER:  { bg: 'var(--bg-info-subtle)',    color: 'var(--txt-info)',           border: 'var(--bdr-info)' },
  EMPLOYEE: { bg: 'var(--bg-surface-alt)',    color: 'var(--txt-secondary)',      border: 'var(--bdr-default)' },
}

export function RolePill({ role }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.EMPLOYEE
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {getRoleLabel(role)}
    </span>
  )
}

/* ─────────────────────────────────────────────
   Panel wrapper — matches the mockup's Settings
   tab-content cards (title + optional subtitle).
───────────────────────────────────────────── */
export function Panel({ title, subtitle, children, style }) {
  return (
    <div style={{
      padding: '24px',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--bdr-subtle)',
      ...style,
    }}>
      {title && <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--txt-primary)', margin: 0 }}>{title}</h3>}
      {subtitle && <p style={{ fontSize: '13px', color: 'var(--txt-secondary)', marginTop: '4px', marginBottom: 0 }}>{subtitle}</p>}
      <div style={{ marginTop: (title || subtitle) ? 'var(--sp-5)' : 0 }}>
        {children}
      </div>
    </div>
  )
}
