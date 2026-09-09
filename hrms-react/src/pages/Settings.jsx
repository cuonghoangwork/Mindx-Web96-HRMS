import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { Panel, RolePill } from './settings/shared'
import { MyProfileEditSection } from './settings/ProfileTab'
import { NotificationsTab } from './settings/NotificationsTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { SecurityTab } from './settings/SecurityTab'
import { AuditLogTab } from './settings/AuditLogTab'
import { RolesTab } from './settings/RolesTab'

/* ─────────────────────────────────────────────
   Main Settings page — left-side vertical tab
   nav matching the mockup's settingsWrapStyle /
   settingsTabListStyle / settingsContentStyle
   layout (a new pattern for this app, distinct
   from the horizontal toggle-tabs used on
   Attendance/AllEmployees).

   Note: the fuller "Profile edit requests" and
   "Promotion approval queue" review panels that
   used to live here were removed — the mockup
   never shows them under Settings; it puts the
   equivalent pending-request queues on the
   Employees page (Roster / Edit requests tabs +
   Pending Promotions banner), which already
   exists there. "Company info" tab is omitted —
   there's no Company entity in the backend to
   persist it against.
───────────────────────────────────────────── */
function Settings() {
  const { t } = useTranslation()
  const { isAdmin, isHRTier, user } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')

  const tabs = [
    { key: 'profile',       label: t('settings.tabs.myProfile') },
    { key: 'notifications', label: t('settings.tabs.notifications') },
    { key: 'appearance',    label: t('settings.tabs.appearance') },
    { key: 'security',      label: t('settings.tabs.security') },
    ...(isHRTier ? [{ key: 'audit', label: t('settings.tabs.auditLog') }] : []),
    ...(isAdmin ? [{ key: 'roles', label: t('settings.tabs.rolesPermissions') }] : []),
  ]

  // Guard against landing on a gated tab after a role change / relogin.
  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab('profile')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHRTier, isAdmin])

  return (
    <div className="content-card">
      <h2>{t("settings.title")}</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>{t("settings.subtitle")}</p>

      {/* Current user info */}
      <div style={{
        marginTop: '24px', padding: '16px 20px',
        background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius)',
        border: '1px solid var(--bdr-default)',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg-primary)', color: 'var(--txt-on-brand)',
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

      {/* Tab nav + content */}
      <div style={{ marginTop: '30px', display: 'flex', gap: '28px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '2px',
          width: '200px', flexShrink: 0,
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                textAlign: 'left', padding: '10px 14px', borderRadius: 'var(--radius-md)',
                border: 'none', cursor: 'pointer',
                background: activeTab === tab.key ? 'var(--bg-primary-subtle)' : 'transparent',
                color: activeTab === tab.key ? 'var(--txt-primary-brand)' : 'var(--txt-secondary)',
                fontFamily: 'var(--font-family)', fontSize: 'var(--fs-sm)',
                fontWeight: activeTab === tab.key ? 'var(--fw-semibold)' : 'var(--fw-regular)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          {activeTab === 'profile' && (
            <Panel><MyProfileEditSection /></Panel>
          )}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'audit' && isHRTier && <AuditLogTab />}
          {activeTab === 'roles' && isAdmin && <RolesTab />}
        </div>
      </div>
    </div>
  )
}

export default Settings
