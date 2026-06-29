import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../api/client'
import { getRoleLabel } from '../utils/roles'

/* ── Role badge colours ── */
const ROLE_STYLE = {
  ADMIN:    { bg: 'var(--bg-primary-subtle)', color: 'var(--txt-primary-brand)', border: 'rgba(113,82,243,0.25)' },
  MANAGER:  { bg: 'var(--bg-info-subtle)',    color: 'var(--txt-info)',           border: 'var(--bdr-info)' },
  EMPLOYEE: { bg: 'var(--bg-surface-alt)',    color: 'var(--txt-secondary)',      border: 'var(--bdr-default)' },
}

function RolePill({ role }) {
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

/* ── Promote Users panel (Admin only) ── */
function PromoteUsersPanel() {
  const { user: currentUser } = useAuth()
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [promoting, setPromoting] = useState(null) // id being changed
  const [toast, setToast]       = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/auth/users')
      setUsers(res.items || [])
    } catch (err) {
      setError(err.message || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handlePromote = async (userId, newRole) => {
    setPromoting(userId)
    try {
      const res = await apiFetch(`/auth/users/${userId}/promote`, {
        method: 'PATCH',
        body: { role: newRole },
      })
      setToast(res.message || 'Role updated.')
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err) {
      setToast(`Error: ${err.message}`)
    } finally {
      setPromoting(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
        Loading accounts…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--sp-4)', background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)', borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {error}
        <button className="btn btn-secondary btn-sm" onClick={fetchUsers}>Retry</button>
      </div>
    )
  }

  return (
    <div>
      {toast && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: toast.startsWith('Error') ? 'var(--bg-danger-subtle)' : 'var(--bg-success-subtle)',
          border: `1px solid ${toast.startsWith('Error') ? 'var(--bdr-danger)' : 'var(--bdr-success)'}`,
          borderRadius: 'var(--radius-md)',
          color: toast.startsWith('Error') ? 'var(--txt-danger)' : 'var(--txt-success)',
          fontSize: 'var(--fs-sm)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {users.map((u) => {
          const isSelf    = u.id === currentUser?.id
          const isAdminAcc = u.role === 'ADMIN'
          const isManager  = u.role === 'MANAGER'
          const isLoading  = promoting === u.id

          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
              padding: 'var(--sp-3) var(--sp-4)',
              background: isSelf ? 'var(--bg-primary-subtle)' : 'var(--bg-surface-alt)',
              border: `1px solid ${isSelf ? 'rgba(113,82,243,0.2)' : 'var(--bdr-subtle)'}`,
              borderRadius: 'var(--radius-md)',
            }}>
              {/* Avatar initial */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg-primary)', color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
              }}>
                {u.name?.[0]?.toUpperCase() ?? '?'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  {u.name}
                  {isSelf && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>(you)</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>{u.email}</div>
              </div>

              <RolePill role={u.role} />

              {/* Action buttons — disabled for ADMIN accounts and self */}
              {!isAdminAcc && !isSelf && (
                <div style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 }}>
                  {isManager ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={isLoading}
                      onClick={() => handlePromote(u.id, 'EMPLOYEE')}
                      title="Demote to Employee"
                    >
                      {isLoading ? '…' : 'Demote'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isLoading}
                      onClick={() => handlePromote(u.id, 'MANAGER')}
                      title="Promote to HR/Manager"
                    >
                      {isLoading ? '…' : 'Promote to HR'}
                    </button>
                  )}
                </div>
              )}

              {isAdminAcc && !isSelf && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-disabled)', flexShrink: 0 }}>
                  Cannot modify
                </span>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: 'var(--sp-4)' }}>
        ADMIN accounts can only be created via database configuration. Promote grants full HR/Manager access; Demote returns the account to Employee read-only mode.
      </p>
    </div>
  )
}

/* ── Main Settings page ── */
function Settings() {
  const { theme, toggleTheme } = useTheme()
  const { isAdmin, user }      = useAuth()

  const cardStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px',
    background: 'var(--surface-alt)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  }

  return (
    <div className="content-card">
      <h2>Settings</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>
        Manage your application preferences.
      </p>

      {/* Current user info */}
      <div style={{
        marginTop: '24px', padding: '16px 20px',
        background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg-primary)', color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: '18px', fontWeight: '600',
        }}>
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '500', color: 'var(--txt-primary)' }}>{user?.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--txt-secondary)', marginTop: '2px' }}>{user?.email}</div>
        </div>
        <RolePill role={user?.role} />
      </div>

      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Dark mode */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Dark Mode</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Toggle between light and dark themes
            </p>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              padding: '12px 24px', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: 'pointer', fontSize: '14px',
            }}
          >
            {theme === 'light' ? '☀ Light' : '◐ Dark'}
          </button>
        </div>

        {/* Email notifications */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Email Notifications</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Receive email updates about your account
            </p>
          </div>
          <label style={{
            width: '50px', height: '26px', background: 'var(--primary)',
            borderRadius: '13px', position: 'relative', cursor: 'pointer',
          }}>
            <span style={{
              width: '22px', height: '22px', background: 'white', borderRadius: '50%',
              position: 'absolute', top: '2px', right: '2px',
            }} />
          </label>
        </div>

        {/* Language */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Language</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Choose your preferred language
            </p>
          </div>
          <select style={{
            padding: '8px 16px', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            <option>English</option>
            <option>Vietnamese</option>
          </select>
        </div>

        {/* ── Admin only: Promote Users ── */}
        {isAdmin && (
          <div style={{
            padding: '24px',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--bdr-brand)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
              <span style={{
                width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-primary-subtle)', color: 'var(--clr-primary-400)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--txt-primary)', margin: 0 }}>
                  Manage User Roles
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                  Promote employees to HR/Manager or demote them back to Employee.
                </p>
              </div>
            </div>
            <PromoteUsersPanel />
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
