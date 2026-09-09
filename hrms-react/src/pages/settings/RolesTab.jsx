import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { PermissionsAPI } from '../../api'
import { apiFetch } from '../../api/client'
import { getRoleLabel } from '../../utils/roles'
import { translateApiError } from '../../utils/apiError'
import Button from "../../components/Button";
import { Panel, RolePill } from './shared'

// All 4 roles are parallel tiers, not a strict ladder (HR and MANAGER
// aren't "greater/lesser" than each other — different scope, not rank), so
// role changes below use a plain select instead of a promote/demote ladder.
const ASSIGNABLE_ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']

// Solo Gaps Milestone 3 — the 4 MANAGER capabilities the permissions
// matrix can toggle. Keep in sync with
// hrms-backend/utils/permissions.js's MANAGER_CAPABILITIES.
const MANAGER_CAPABILITIES = [
  'approveLeaveRequests',
  'reviewProfileEdits',
  'manageAttendanceRecords',
  'proposePromotions',
]

/* ─────────────────────────────────────────────
   Roles & permissions tab — Admin-only. Real
   role changes (EMPLOYEE/MANAGER/ADMIN) via
   /auth/users/:id/promote, plus (Solo Gaps
   Milestone 3) a real per-capability toggle for
   MANAGER below it — see PermissionsMatrix.
───────────────────────────────────────────── */
function PromoteUsersPanel() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [promoting, setPromoting] = useState(null)
  const [toast, setToast]       = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await apiFetch('/auth/users')
      setUsers(res.items || [])
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.promoteUsers.loadFailed', { defaultValue: 'Failed to load users.' }))
    }
    setLoading(false)
  }, [t])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handlePromote = async (userId, newRole) => {
    setPromoting(userId)
    try {
      const res = await apiFetch(`/auth/users/${userId}/promote`, { method: 'PATCH', body: { role: newRole } })
      setToast(res.message || t('settings.promoteUsers.roleUpdated'))
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err) {
      setToast(`${t('payroll.errorPrefix', { defaultValue: 'Error:' })} ${translateApiError(err, t)}`)
    }
    setPromoting(null)
  }

  if (loading) return <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>{t('settings.promoteUsers.loadingAccounts')}</div>
  if (error) return (
    <div style={{ padding: 'var(--sp-4)', background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)', borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {error}<Button variant="secondary" size="sm" onClick={fetchUsers}>{t('settings.retry')}</Button>
    </div>
  )

  return (
    <div>
      {toast && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: toast.startsWith(t('payroll.errorPrefix', { defaultValue: 'Error:' })) ? 'var(--bg-danger-subtle)' : 'var(--bg-success-subtle)',
          border: `1px solid ${toast.startsWith(t('payroll.errorPrefix', { defaultValue: 'Error:' })) ? 'var(--bdr-danger)' : 'var(--bdr-success)'}`,
          borderRadius: 'var(--radius-md)',
          color: toast.startsWith(t('payroll.errorPrefix', { defaultValue: 'Error:' })) ? 'var(--txt-danger)' : 'var(--txt-success)',
          fontSize: 'var(--fs-sm)',
        }}>{toast}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {users.map((u) => {
          const isSelf = u.id === currentUser?.id
          const isLoading = promoting === u.id
          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
              padding: 'var(--sp-3) var(--sp-4)',
              background: isSelf ? 'var(--bg-primary-subtle)' : 'var(--bg-surface-alt)',
              border: `1px solid ${isSelf ? 'rgba(47,111,237,0.2)' : 'var(--bdr-subtle)'}`,
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, background: 'var(--bg-primary)', color: 'var(--txt-on-brand)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
                {u.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  {u.name}{isSelf && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>{t('settings.promoteUsers.youSuffix')}</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>{u.email}</div>
              </div>
              <RolePill role={u.role} />
              {u.mustChangePassword && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', flexShrink: 0 }}>{t('settings.promoteUsers.notActivated')}</span>
              )}
              {!isSelf && (
                <select
                  aria-label={t('settings.promoteUsers.changeRoleLabel')}
                  value={u.role}
                  disabled={isLoading}
                  onChange={(e) => handlePromote(u.id, e.target.value)}
                  style={{
                    flexShrink: 0, padding: '6px 10px',
                    border: '1px solid var(--bdr-default)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)', color: 'var(--txt-primary)',
                    fontFamily: 'var(--font-family)', fontSize: 'var(--fs-sm)',
                    cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{getRoleLabel(r)}</option>
                  ))}
                </select>
              )}
              {isSelf && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-disabled)', flexShrink: 0 }}>{t('settings.promoteUsers.cannotChangeOwnRole')}</span>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: 'var(--sp-4)' }}>
        {t('settings.promoteUsers.footerHint')}
      </p>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Permissions matrix (Solo Gaps Milestone 3) —
   a second, additional gate that can only make
   MANAGER stricter than authorize() already
   allows; never grants anything wider. ADMIN and
   HR are never affected by any toggle here — see
   hrms-backend/utils/permissions.js.
───────────────────────────────────────────── */
function PermissionsMatrix() {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(null)

  const fetchPermissions = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await PermissionsAPI.list()
      setItems(res.items || [])
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.permissions.loadFailed', { defaultValue: 'Failed to load permissions.' }))
    }
    setLoading(false)
  }, [t])

  useEffect(() => { fetchPermissions() }, [fetchPermissions])

  const handleToggle = async (capability, current) => {
    setToggling(capability)
    try {
      const res = await PermissionsAPI.toggle('MANAGER', capability, !current)
      setItems((prev) => {
        const next = prev.filter((i) => i.capability !== capability)
        return [...next, res.data]
      })
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.permissions.updateFailed', { defaultValue: 'Failed to update permission.' }))
    }
    setToggling(null)
  }

  return (
    <div style={{ marginTop: 'var(--sp-6)' }}>
      <h4 style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', margin: 0 }}>
        {t('settings.permissions.title')}
      </h4>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '4px', marginBottom: 'var(--sp-4)' }}>
        {t('settings.permissions.subtitle')}
      </p>

      {error && (
        <div style={{
          marginBottom: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.permissions.loading')}
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('settings.permissions.capabilityColumn')}</th>
              <th>{t('settings.permissions.managerColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {MANAGER_CAPABILITIES.map((capability) => {
              const row = items.find((i) => i.capability === capability)
              const enabled = row ? row.enabled : true
              const isToggling = toggling === capability
              return (
                <tr key={capability}>
                  <td>{t(`settings.permissions.capabilities.${capability}`)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggle(capability, enabled)}
                      disabled={isToggling}
                      style={{
                        fontFamily: 'var(--font-family)', fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-sm)',
                        padding: '6px 14px', cursor: isToggling ? 'default' : 'pointer',
                        background: enabled ? 'var(--bg-success-subtle)' : 'var(--bg-danger-subtle)',
                        color: enabled ? 'var(--txt-success)' : 'var(--txt-danger)',
                        border: `1px solid ${enabled ? 'var(--bdr-success)' : 'var(--bdr-danger)'}`,
                        opacity: isToggling ? 0.6 : 1,
                      }}
                    >
                      {enabled ? t('settings.permissions.enabled') : t('settings.permissions.disabled')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function RolesTab() {
  const { t } = useTranslation()
  return (
    <Panel title={t('settings.rolesTab.title')} subtitle={t('settings.rolesTab.subtitle')}>
      <PromoteUsersPanel />
      <PermissionsMatrix />
    </Panel>
  )
}
