import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { formatDate, formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { EmployeesAPI, ProfileEditRequestsAPI, AuditLogAPI, PermissionsAPI } from '../api'
import { apiFetch } from '../api/client'
import { getRoleLabel } from '../utils/roles'
import { translateApiError } from '../utils/apiError'
import Button from "../components/Button";

/* ─────────────────────────────────────────────
   Shared helpers / sub-components
───────────────────────────────────────────── */
const ROLE_STYLE = {
  ADMIN:    { bg: 'var(--bg-primary-subtle)', color: 'var(--txt-primary-brand)', border: 'rgba(47,111,237,0.25)' },
  HR:       { bg: 'var(--bg-info-subtle)',    color: 'var(--txt-info)',           border: 'var(--bdr-info)' },
  MANAGER:  { bg: 'var(--bg-info-subtle)',    color: 'var(--txt-info)',           border: 'var(--bdr-info)' },
  EMPLOYEE: { bg: 'var(--bg-surface-alt)',    color: 'var(--txt-secondary)',      border: 'var(--bdr-default)' },
}
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

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const cfg = {
    pending:  { bg: 'var(--bg-warning-subtle)', color: 'var(--txt-warning)', border: 'var(--bdr-warning)', label: t('settings.status.pending') },
    approved: { bg: 'var(--bg-success-subtle)', color: 'var(--txt-success)', border: 'var(--bdr-success)', label: t('settings.status.approved') },
    rejected: { bg: 'var(--bg-danger-subtle)',  color: 'var(--txt-danger)',  border: 'var(--bdr-danger)',  label: t('settings.status.rejected') },
  }[status] ?? { bg: 'var(--bg-surface-alt)', color: 'var(--txt-secondary)', border: 'var(--bdr-default)', label: status }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
      {cfg.label}
    </span>
  )
}

function FieldRow({ label, from, to }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: '8px 0', borderBottom: '1px solid var(--bdr-subtle)',
      fontSize: 'var(--fs-sm)', flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--txt-secondary)', minWidth: '80px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--txt-disabled)', textDecoration: 'line-through' }}>{from ?? '—'}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt-secondary)" strokeWidth="2" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ color: 'var(--clr-success-700)', fontWeight: 'var(--fw-medium)' }}>{to ?? '—'}</span>
    </div>
  )
}

const FIELD_LABEL_KEYS = {
  name: 'settings.fields.fullName', phone: 'settings.fields.phone', address: 'settings.fields.address',
  age: 'settings.fields.age', sex: 'settings.fields.gender',
}
const fieldLabel = (t, field) => t(FIELD_LABEL_KEYS[field] ?? field, { defaultValue: field })

/* ─────────────────────────────────────────────
   Panel wrapper — matches the mockup's Settings
   tab-content cards (title + optional subtitle).
───────────────────────────────────────────── */
function Panel({ title, subtitle, children, style }) {
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

/* ─────────────────────────────────────────────
   Avatar upload — real, self-serve (all roles
   may upload their own avatar; see
   employeeRouter.js /:id/avatar).
───────────────────────────────────────────── */
function AvatarUploader({ profile, onUploaded }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handlePick = () => fileRef.current?.click()

  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setUploading(true)
    setError('')
    try {
      const res = await EmployeesAPI.uploadAvatar(profile.id, file)
      onUploaded(res.data)
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.profile.uploadFailed', { defaultValue: 'Failed to upload photo.' }))
    }
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
      <div
        style={{
          width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
          background: profile?.avatar ? `center/cover no-repeat url(${profile.avatar})` : 'var(--bg-primary)',
          color: 'var(--txt-on-brand)', display: 'grid', placeItems: 'center',
          fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)',
          border: '1px solid var(--bdr-subtle)',
        }}
      >
        {!profile?.avatar && (profile?.name?.[0]?.toUpperCase() ?? '?')}
      </div>
      <div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChange} />
        <Button variant="secondary" size="sm" disabled={uploading} onClick={handlePick}>
          {uploading ? t('settings.profile.uploadingPhoto') : t('settings.profile.changePhoto')}
        </Button>
        {error && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-danger)', marginTop: '6px' }}>{error}</div>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   My Profile tab
───────────────────────────────────────────── */
function MyProfileEditSection() {
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()
  const [profile, setProfile]         = useState(null)
  const [editForm, setEditForm]       = useState({})
  const [pendingRequest, setPending]  = useState(null)
  const [myRequests, setMyRequests]   = useState([])
  const [loadingProfile, setLoadingP] = useState(true)
  const [loadingReqs, setLoadingR]    = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [isEditing, setIsEditing]     = useState(false)

  const loadProfile = useCallback(async () => {
    setLoadingP(true)
    try {
      const res = await EmployeesAPI.myProfile()
      if (res.data) {
        setProfile(res.data)
        setEditForm({
          name:    res.data.name    ?? '',
          phone:   res.data.phone   ?? '',
          address: res.data.address ?? '',
          age:     res.data.age     ?? '',
          sex:     res.data.sex     ?? '',
        })
      }
    } catch {
      /* profile fetch best-effort; UI shows its own loading/empty states */
    }
    setLoadingP(false)
  }, [])

  const loadRequests = useCallback(async () => {
    setLoadingR(true)
    try {
      const res = await ProfileEditRequestsAPI.list()
      const reqs = res.items ?? []
      setMyRequests(reqs)
      setPending(reqs.find((r) => r.status === 'pending') ?? null)
    } catch {
      /* requests fetch best-effort; UI shows its own loading/empty states */
    }
    setLoadingR(false)
  }, [])

  useEffect(() => {
    loadProfile()
    loadRequests()
  }, [loadProfile, loadRequests])

  useEffect(() => {
    if (!success) return
    const id = setTimeout(() => setSuccess(''), 5000)
    return () => clearTimeout(id)
  }, [success])

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!profile) { setError(t('settings.myProfile.noLinkedProfile')); return }

    // Build the diff (only changed fields)
    const changes = {}
    if (editForm.name    !== (profile.name    ?? ''))      changes.name    = editForm.name
    if (editForm.phone   !== (profile.phone   ?? ''))      changes.phone   = editForm.phone
    if (editForm.address !== (profile.address ?? ''))      changes.address = editForm.address
    if (String(editForm.age ?? '') !== String(profile.age ?? '')) changes.age = editForm.age
    if (editForm.sex     !== (profile.sex     ?? ''))      changes.sex     = editForm.sex

    if (Object.keys(changes).length === 0) {
      setError(t('settings.myProfile.noChanges'))
      return
    }

    setSubmitting(true)
    try {
      await ProfileEditRequestsAPI.create(changes)
      setSuccess(t('settings.myProfile.submitSuccess'))
      setIsEditing(false)
      loadRequests()
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.myProfile.submitFailed', { defaultValue: 'Failed to submit request.' }))
    }
    setSubmitting(false)
  }

  if (loadingProfile) {
    return (
      <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
        {t('settings.myProfile.loadingProfile')}
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{
        padding: 'var(--sp-5)', background: 'var(--bg-warning-subtle)',
        border: '1px solid var(--bdr-warning)', borderRadius: 'var(--radius-md)',
        color: 'var(--txt-warning)', fontSize: 'var(--fs-sm)',
      }}>
        {t('settings.myProfile.noProfileLinked')}
      </div>
    )
  }

  const hasPending = Boolean(pendingRequest)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Avatar — real, self-serve upload */}
      <AvatarUploader profile={profile} onUploaded={(data) => setProfile((p) => ({ ...p, ...data }))} />

      {/* Current info read-only display */}
      <div style={{
        padding: 'var(--sp-5)',
        background: 'var(--bg-surface-alt)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--bdr-subtle)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
          <h4 style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', margin: 0 }}>
            {t('settings.myProfile.currentProfile')}
          </h4>
          {!isEditing && !hasPending && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setIsEditing(true); setError(''); setSuccess('') }}
            >
              {t('settings.myProfile.requestEdit')}
            </Button>
          )}
          {hasPending && (
            <StatusBadge status="pending" />
          )}
        </div>

        {[
          { label: t('settings.fields.fullName'),   value: profile.name },
          { label: t('settings.fields.email'),       value: profile.email },
          { label: t('settings.fields.employeeId'), value: profile.employeeId },
          { label: t('settings.fields.department'), value: profile.department },
          { label: t('settings.fields.designation'), value: profile.designation },
          { label: t('settings.fields.phone'),       value: profile.phone || '—' },
          { label: t('settings.fields.address'),     value: profile.address || '—' },
          { label: t('settings.fields.age'),         value: profile.age || '—' },
          { label: t('settings.fields.gender'),      value: profile.sex || '—' },
        ].map((row) => (
          <div key={row.label} style={{
            display: 'flex', gap: 'var(--sp-4)',
            padding: '8px 0', borderBottom: '1px solid var(--bdr-subtle)',
            fontSize: 'var(--fs-sm)',
          }}>
            <span style={{ color: 'var(--txt-secondary)', minWidth: '110px', flexShrink: 0 }}>{row.label}</span>
            <span style={{ color: 'var(--txt-primary)', fontWeight: 'var(--fw-medium)' }}>{row.value}</span>
          </div>
        ))}
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: 'var(--sp-3)', marginBottom: 0 }}>
          {t('settings.profile.emailReadOnlyHint')}
        </p>
      </div>

      {/* Language — instant, client-side preference (not part of the
          HR-approved profile fields above). */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-3)',
        padding: 'var(--sp-5)', background: 'var(--bg-surface-alt)',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--bdr-subtle)',
      }}>
        <div>
          <h4 style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', margin: 0 }}>
            {t('settings.language.title')}
          </h4>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)', marginTop: '4px' }}>
            {t('settings.language.description')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', padding: '3px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bdr-subtle)' }}>
          {[['en', t('settings.language.english')], ['vi', t('settings.language.vietnamese')]].map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: language === code ? 'var(--bg-primary)' : 'transparent',
                color: language === code ? 'var(--txt-on-brand)' : 'var(--txt-secondary)',
                fontFamily: 'var(--font-family)', fontSize: 'var(--fs-sm)',
                fontWeight: language === code ? 'var(--fw-medium)' : 'var(--fw-regular)',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Task 1.4 — My Contract. Read-only here: only HR/Admin can upload
          (see ContractCard in ViewEmployee.jsx). */}
      <div style={{
        padding: 'var(--sp-5)',
        background: 'var(--bg-surface-alt)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--bdr-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 'var(--sp-3)', flexWrap: 'wrap',
      }}>
        <div>
          <h4 style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', margin: 0 }}>
            {t('settings.myProfile.myContract')}
          </h4>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)', marginTop: '4px' }}>
            {profile.contractUrl
              ? t('settings.myProfile.contractUploaded', { date: formatDate(profile.contractUploadedAt, language) })
              : t('settings.myProfile.contractNotUploaded')}
          </p>
        </div>
        {profile.contractUrl && (
          <a
            href={profile.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            {t('settings.myProfile.viewContract')}
          </a>
        )}
      </div>

      {/* Edit form */}
      {isEditing && !hasPending && (
        <div style={{
          padding: 'var(--sp-5)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--bdr-brand)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <span style={{
              width: '32px', height: '32px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-primary-subtle)', color: 'var(--clr-primary-400)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </span>
            <div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)' }}>
                {t('settings.myProfile.requestProfileEdit')}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                {t('settings.myProfile.requestEditHint')}
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-name">{t('settings.fields.fullName')}</label>
              <input
                id="edit-name"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-phone">{t('settings.fields.phone')}</label>
              <input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder={t('settings.myProfile.phonePlaceholder', { defaultValue: '+84 90 123 4567' })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-age">{t('settings.fields.age')}</label>
              <input
                id="edit-age"
                type="number"
                value={editForm.age}
                onChange={(e) => setEditForm((p) => ({ ...p, age: e.target.value }))}
                min="18"
                max="80"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-sex">{t('settings.fields.gender')}</label>
              <select
                id="edit-sex"
                value={editForm.sex}
                onChange={(e) => setEditForm((p) => ({ ...p, sex: e.target.value }))}
              >
                <option value="">{t('settings.myProfile.selectEllipsis')}</option>
                <option value="Male">{t('settings.fields.genderOptions.male')}</option>
                <option value="Female">{t('settings.fields.genderOptions.female')}</option>
                <option value="Other">{t('settings.fields.genderOptions.other')}</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="edit-address">{t('settings.fields.address')}</label>
              <input
                id="edit-address"
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                placeholder={t('settings.myProfile.addressPlaceholder', { defaultValue: 'Street, City, State' })}
              />
            </div>
          </div>

          {error && (
            <div className="form-error" style={{ marginBottom: 'var(--sp-4)' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
            <Button
              variant="secondary"
              onClick={() => { setIsEditing(false); setError('') }}
            >
              {t('settings.myProfile.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? t('settings.myProfile.submitting') : t('settings.myProfile.submitRequest')}
            </Button>
          </div>
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-success-subtle)', border: '1px solid var(--bdr-success)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-success)', fontSize: 'var(--fs-sm)',
          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        }}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3.5 6L5.5 8L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {success}
        </div>
      )}

      {/* Request history */}
      {!loadingReqs && myRequests.length > 0 && (
        <div>
          <h4 style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', marginBottom: 'var(--sp-3)' }}>
            {t('settings.myProfile.requestHistory')}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {myRequests.slice(0, 5).map((req) => (
              <div key={req.id} style={{
                padding: 'var(--sp-4)',
                background: 'var(--bg-surface-alt)',
                border: '1px solid var(--bdr-subtle)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>
                    {formatDate(req.createdAt, language)}
                  </span>
                  <StatusBadge status={req.status} />
                </div>
                {Object.entries(req.changes).map(([field, { from, to }]) => (
                  <FieldRow key={field} label={fieldLabel(t, field)} from={from} to={to} />
                ))}
                {req.reviewNote && (
                  <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', fontStyle: 'italic' }}>
                    {t('settings.myProfile.hrNote', { note: req.reviewNote })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Notifications tab — no per-category preference
   storage exists in the backend (Notification
   model has no per-user prefs), so this is a
   disclosed gap rather than a fake checkbox table.
───────────────────────────────────────────── */
function NotificationsTab() {
  const { t } = useTranslation()
  return (
    <Panel title={t('settings.notificationsTab.title')} subtitle={t('settings.notificationsTab.subtitle')}>
      <div style={{
        padding: 'var(--sp-4) var(--sp-5)', background: 'var(--bg-surface-alt)',
        border: '1px solid var(--bdr-subtle)', borderRadius: 'var(--radius-md)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
      }}>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)', margin: 0 }}>
          {t('settings.notificationsTab.gapNotice')}
        </p>
        <a href="/notifications" className="btn btn-secondary btn-sm">{t('settings.notificationsTab.viewAll')}</a>
      </div>
    </Panel>
  )
}

/* ─────────────────────────────────────────────
   Appearance tab — real (ThemeContext)
───────────────────────────────────────────── */
function AppearanceTab() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  return (
    <Panel title={t('settings.appearanceTab.title')} subtitle={t('settings.appearanceTab.subtitle')}>
      <div style={{ display: 'flex', gap: 'var(--sp-1)', padding: '3px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)', width: 'fit-content', border: '1px solid var(--bdr-subtle)' }}>
        {[['light', t('settings.darkMode.light')], ['dark', t('settings.darkMode.dark')]].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => { if (theme !== mode) toggleTheme() }}
            style={{
              padding: '8px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: theme === mode ? 'var(--bg-primary)' : 'transparent',
              color: theme === mode ? 'var(--txt-on-brand)' : 'var(--txt-secondary)',
              fontFamily: 'var(--font-family)', fontSize: 'var(--fs-sm)',
              fontWeight: theme === mode ? 'var(--fw-medium)' : 'var(--fw-regular)',
            }}
          >{label}</button>
        ))}
      </div>
    </Panel>
  )
}

/* ─────────────────────────────────────────────
   Security tab — real Change Password (wired to
   AuthContext.changePassword / AuthAPI). Two-factor
   auth and session management have no backend
   support (no TOTP secret / session-token list
   anywhere in the API) so they're disclosed as a
   gap instead of being faked as working toggles.
───────────────────────────────────────────── */
function SecurityTab() {
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

/* ─────────────────────────────────────────────
   Audit log tab — real, HR/Admin only
   (GET /audit-log, admin+manager per
   auditLogRouter.js).
───────────────────────────────────────────── */
const AUDIT_LIMIT_STEP = 20

function AuditLogTab() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(AUDIT_LIMIT_STEP)

  const load = useCallback(async (lim) => {
    setLoading(true); setError('')
    try {
      const res = await AuditLogAPI.list({ limit: lim })
      setItems(res.items ?? [])
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.auditLogTab.title', { defaultValue: 'Audit log' }))
    }
    setLoading(false)
  }, [t])

  useEffect(() => { load(limit) }, [load, limit])

  return (
    <Panel title={t('settings.auditLogTab.title')} subtitle={t('settings.auditLogTab.subtitle')}>
      {error && (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)', borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>
          {error}
        </div>
      )}
      {loading ? (
        <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.auditLogTab.loading')}
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.auditLogTab.empty')}
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('settings.auditLogTab.time')}</th>
                <th>{t('settings.auditLogTab.actor')}</th>
                <th>{t('settings.auditLogTab.role')}</th>
                <th>{t('settings.auditLogTab.action')}</th>
                <th>{t('settings.auditLogTab.target')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--txt-secondary)' }}>{formatDateTime(a.createdAt, language)}</td>
                  <td>{a.actor?.name ?? '—'}</td>
                  <td style={{ color: 'var(--txt-secondary)' }}>{a.actor?.role ? getRoleLabel(a.actor.role) : '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{a.action?.replace(/_/g, ' ')}</td>
                  <td style={{ color: 'var(--txt-secondary)' }}>{a.label ?? a.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length >= limit && (
            <div style={{ textAlign: 'center', marginTop: 'var(--sp-4)' }}>
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + AUDIT_LIMIT_STEP)}>
                {t('settings.auditLogTab.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

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

function RolesTab() {
  const { t } = useTranslation()
  return (
    <Panel title={t('settings.rolesTab.title')} subtitle={t('settings.rolesTab.subtitle')}>
      <PromoteUsersPanel />
      <PermissionsMatrix />
    </Panel>
  )
}

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
