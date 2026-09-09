import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../context/LanguageContext'
import { formatDate } from '../../utils/format'
import { EmployeesAPI, ProfileEditRequestsAPI } from '../../api'
import { translateApiError } from '../../utils/apiError'
import Button from "../../components/Button";

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
export function MyProfileEditSection() {
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
