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

/* Settings — left-side vertical tab nav; each tab is its own module under settings/. */
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

  // A gated tab can be stale after a role change.
  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab('profile')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHRTier, isAdmin])

  return (
    <div className="content-card">
      <h2>{t("settings.title")}</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>{t("settings.subtitle")}</p>

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
