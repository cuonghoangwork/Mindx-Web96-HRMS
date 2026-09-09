import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import Button from "../../components/Button";
import { Panel } from './shared'

/* ─────────────────────────────────────────────
   Security tab — real Change Password (wired to
   AuthContext.changePassword / AuthAPI). Two-factor
   auth and session management have no backend
   support (no TOTP secret / session-token list
   anywhere in the API) so they're disclosed as a
   gap instead of being faked as working toggles.
───────────────────────────────────────────── */
export function SecurityTab() {
  const { t } = useTranslation()
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), 4000)
    return () => clearTimeout(id)
  }, [saved])

  const mismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!currentPassword) { setError(t('settings.securityTab.currentPassword') + ' — ' + t('settings.myProfile.noChanges')); return }
    if (newPassword.length < 8) { setError(t('login.passwordTooShort', { defaultValue: 'New password must be at least 8 characters.' })); return }
    if (newPassword !== confirmPassword) { setError(t('settings.securityTab.passwordsMismatch')); return }

    setSaving(true)
    const res = await changePassword(currentPassword, newPassword)
    setSaving(false)
    if (res.success) {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setSaved(true)
    } else {
      setError(res.error)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <Panel title={t('settings.securityTab.changePasswordTitle')} subtitle={t('settings.securityTab.changePasswordSubtitle')}>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="sec-current">{t('settings.securityTab.currentPassword')}</label>
            <input id="sec-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sec-new">{t('settings.securityTab.newPassword')}</label>
            <input id="sec-new" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sec-confirm">{t('settings.securityTab.confirmNewPassword')}</label>
            <input id="sec-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>

          {mismatch && (
            <div className="form-error" style={{ gridColumn: '1 / -1' }}>{t('settings.securityTab.passwordsMismatch')}</div>
          )}
          {error && (
            <div className="form-error" style={{ gridColumn: '1 / -1' }}>{error}</div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            {saved && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-success)' }}>{t('settings.securityTab.updateSuccess')}</span>}
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('settings.securityTab.updating') : t('settings.securityTab.updatePassword')}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={t('settings.securityTab.otherTitle')}>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)', margin: 0 }}>
          {t('settings.securityTab.gapNotice')}
        </p>
      </Panel>
    </div>
  )
}
