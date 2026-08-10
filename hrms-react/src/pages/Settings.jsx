import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { apiFetch } from '../api/client'
import { ProfileEditRequestsAPI, EmployeesAPI, PromotionRequestsAPI, NoShowReviewsAPI } from '../api'
import { getRoleLabel } from '../utils/roles'
import Button from "../components/Button";

/* ─────────────────────────────────────────────
   Shared helpers / sub-components
───────────────────────────────────────────── */
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
   Employee: My Profile Edit section
───────────────────────────────────────────── */
function MyProfileEditSection() {
  const { t } = useTranslation()
  const { language } = useLanguage()
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
    } catch {}
    setLoadingP(false)
  }, [])

  const loadRequests = useCallback(async () => {
    setLoadingR(true)
    try {
      const res = await ProfileEditRequestsAPI.list()
      const reqs = res.items ?? []
      setMyRequests(reqs)
      setPending(reqs.find((r) => r.status === 'pending') ?? null)
    } catch {}
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
      setError(err.message || t('settings.myProfile.submitFailed'))
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
                placeholder="+84 90 123 4567"
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
                placeholder="Street, City, State"
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
   HR/Admin: Review pending profile edit requests
───────────────────────────────────────────── */
const usd = (n) =>
  n === null || n === undefined || n === '' ? '—' : `$${Number(n).toLocaleString('en-US')}`

// Position Ladder (task 2.1) — mirrors model/PositionLevel.js's POSITION_LEVELS.
// Kept as a local constant (no shared constants module exists yet in this
// frontend), matching how EMPLOYEE_TYPES is scoped locally in ViewEmployee.jsx.
const POSITION_LEVELS = ['Intern', 'Full-time', 'Senior', 'Manager']

function PromotionProposeSection() {
  const { t } = useTranslation()
  const { employees, departments } = useStore()
  const [form, setForm] = useState({
    employeeId: '', designation: '', department: '', salary: '', positionLevel: '', effectiveDate: '', reason: '',
  })
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const selected = useMemo(
    () => employees.find((e) => String(e.id) === String(form.employeeId)) ?? null,
    [employees, form.employeeId],
  )

  const loadMine = useCallback(async () => {
    setLoading(true)
    try {
      const res = await PromotionRequestsAPI.list()
      setMine(res.items ?? [])
      setError('')
    } catch (err) {
      setError(err.message || t('settings.proposePromotion.loadFailed'))
    }
    setLoading(false)
  }, [t])

  useEffect(() => { loadMine() }, [loadMine])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.employeeId) { setError(t('settings.proposePromotion.pickEmployeeFirst')); return }
    setSubmitting(true)
    try {
      const body = { employeeId: form.employeeId }
      if (form.designation.trim()) body.designation = form.designation.trim()
      if (form.department) body.department = form.department
      if (form.salary !== '') body.salary = Number(form.salary)
      if (form.positionLevel) body.positionLevel = form.positionLevel
      if (form.effectiveDate) body.effectiveDate = form.effectiveDate
      if (form.reason.trim()) body.reason = form.reason.trim()
      await PromotionRequestsAPI.create(body)
      setToast(t('settings.proposePromotion.submitSuccess'))
      setForm({ employeeId: '', designation: '', department: '', salary: '', positionLevel: '', effectiveDate: '', reason: '' })
      loadMine()
    } catch (err) {
      setError(err.message || t('settings.proposePromotion.submitFailed'))
    }
    setSubmitting(false)
  }

  return (
    <div>
      {toast && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-success-subtle)', border: '1px solid var(--bdr-success)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-success)', fontSize: 'var(--fs-sm)',
        }}>{toast}</div>
      )}
      {error && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)',
        }}>{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="promo-employee">{t('settings.fields.employee')} <span className="required">*</span></label>
            <select id="promo-employee" name="employeeId" value={form.employeeId} onChange={handleChange}>
              <option value="">{t('settings.proposePromotion.selectEmployee')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-effective">{t('settings.proposePromotion.effectiveDate')}</label>
            <input id="promo-effective" name="effectiveDate" type="date"
              value={form.effectiveDate} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-designation">{t('settings.proposePromotion.newDesignation')}</label>
            <input id="promo-designation" name="designation" value={form.designation}
              onChange={handleChange} placeholder={selected?.designation || 'Senior Developer'} />
            {selected && (
              <span className="form-hint">{t('settings.proposePromotion.currently', { value: selected.designation || '—' })}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-department">{t('settings.proposePromotion.newDepartment')}</label>
            <select id="promo-department" name="department" value={form.department} onChange={handleChange}>
              <option value="">{t('settings.proposePromotion.leaveUnchanged')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
            {selected && (
              <span className="form-hint">{t('settings.proposePromotion.currently', { value: selected.department || '—' })}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-position-level">{t('settings.proposePromotion.newPositionLevel')}</label>
            <select id="promo-position-level" name="positionLevel" value={form.positionLevel} onChange={handleChange}>
              <option value="">{t('settings.proposePromotion.leaveUnchanged')}</option>
              {POSITION_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
            {selected && (
              <span className="form-hint">{t('settings.proposePromotion.currently', { value: selected.positionLevel || '—' })}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-salary">{t('settings.proposePromotion.newSalary')}</label>
            <input id="promo-salary" name="salary" type="number" min="0" step="1000"
              value={form.salary} onChange={handleChange} placeholder={selected?.salary ?? '75000'} />
            {selected && (
              <span className="form-hint">{t('settings.proposePromotion.currently', { value: usd(selected.salary) })}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-reason">{t('settings.fields.reason')}</label>
            <textarea id="promo-reason" name="reason" rows={2} value={form.reason}
              onChange={handleChange} placeholder={t('settings.proposePromotion.reasonPlaceholder')}
              style={{ resize: 'vertical' }} />
          </div>
        </div>

        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? t('settings.proposePromotion.submitting') : t('settings.proposePromotion.submitProposal')}
        </Button>
      </form>

      <div style={{ marginTop: 'var(--sp-6)' }}>
        <div style={{
          fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-3)',
        }}>{t('settings.proposePromotion.recentProposals')}</div>
        {loading ? (
          <div style={{ color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>{t('settings.loadingEllipsis')}</div>
        ) : mine.length === 0 ? (
          <div style={{ color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>{t('settings.proposePromotion.noProposalsYet')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {mine.slice(0, 5).map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap',
                padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-surface-alt)',
                border: '1px solid var(--bdr-subtle)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)',
              }}>
                <span style={{ fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                  {r.employeeName}
                </span>
                <span style={{ color: 'var(--txt-secondary)', flex: 1, minWidth: '160px' }}>
                  {[
                    r.proposed.positionLevel && `${t('settings.proposePromotion.diff.level')} → ${r.proposed.positionLevel}`,
                    r.proposed.designation && `${t('settings.proposePromotion.diff.title')} → ${r.proposed.designation}`,
                    r.proposed.department && `${t('settings.proposePromotion.diff.dept')} → ${r.proposed.department}`,
                    r.proposed.salary !== null && `${t('settings.proposePromotion.diff.salary')} → ${usd(r.proposed.salary)}`,
                  ].filter(Boolean).join(' · ') || '—'}
                </span>
                {r.systemGenerated && (
                  <span style={{
                    fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: 'var(--radius-full, 999px)',
                    background: 'var(--bg-info-subtle, var(--bg-surface-alt))', color: 'var(--txt-info, var(--txt-secondary))',
                    border: '1px solid var(--bdr-subtle)',
                  }}>{t('settings.autoFlagged')}</span>
                )}
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PromotionReviewPanel() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilter] = useState('pending')
  const [reviewingId, setReviewingId] = useState(null)
  const [note, setNote] = useState('')
  const [actionLoading, setActionL] = useState(null)
  const [toast, setToast] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await PromotionRequestsAPI.list({ status: filterStatus })
      setRequests(res.items ?? [])
    } catch (err) {
      setError(err.message || t('settings.proposePromotion.loadFailed'))
    }
    setLoading(false)
  }, [filterStatus, t])

  useEffect(() => { loadRequests() }, [loadRequests])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handleReview = async (requestId, decision) => {
    setActionL(decision)
    try {
      await PromotionRequestsAPI.review(requestId, decision, note)
      setToast(decision === 'approved' ? t('settings.promotionReview.approveSuccess') : t('settings.promotionReview.rejectSuccess'))
      setReviewingId(null)
      setNote('')
      loadRequests()
    } catch (err) {
      setToast(`Error: ${err.message}`)
    }
    setActionL(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', padding: '3px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setReviewingId(null) }}
              style={{
                padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: filterStatus === s ? 'var(--bg-surface)' : 'transparent',
                color: filterStatus === s ? 'var(--txt-primary)' : 'var(--txt-secondary)',
                fontFamily: 'var(--font-family)', fontSize: 'var(--fs-xs)',
                fontWeight: filterStatus === s ? 'var(--fw-medium)' : 'var(--fw-regular)',
                boxShadow: filterStatus === s ? 'var(--shadow-xs)' : 'none',
                textTransform: 'capitalize',
              }}
            >{t(`settings.statusFilter.${s}`)}</button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t('settings.refresh')}</Button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>
          {t('settings.promotionReview.proposalCount', { count: requests.length })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: toast.startsWith('Error') ? 'var(--bg-danger-subtle)' : 'var(--bg-success-subtle)',
          border: `1px solid ${toast.startsWith('Error') ? 'var(--bdr-danger)' : 'var(--bdr-success)'}`,
          borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)',
          color: toast.startsWith('Error') ? 'var(--txt-danger)' : 'var(--txt-success)',
        }}>{toast}</div>
      )}

      {error && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)',
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.promotionReview.loadingProposals')}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {filterStatus !== 'all'
            ? t('settings.promotionReview.noProposalsFiltered', { status: t(`settings.statusFilter.${filterStatus}`) })
            : t('settings.promotionReview.noProposals')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id
            const isMine = String(req.requestedBy) === String(user?.id)
            const rows = [
              [t('settings.fields.positionLevel'), req.current.positionLevel, req.proposed.positionLevel],
              [t('settings.fields.designation'), req.current.designation, req.proposed.designation],
              [t('settings.fields.department'), req.current.department, req.proposed.department],
              [t('settings.fields.annualSalary'), usd(req.current.salary), req.proposed.salary === null ? null : usd(req.proposed.salary)],
            ].filter(([, , to]) => to !== null && to !== undefined)

            return (
              <div key={req.id} style={{
                border: `1px solid ${isOpen ? 'var(--bdr-brand)' : 'var(--bdr-subtle)'}`,
                borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)',
                background: 'var(--bg-surface-alt)', transition: 'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-primary)', color: 'var(--txt-on-brand)', display: 'grid',
                    placeItems: 'center', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                  }}>{req.employeeName?.[0]?.toUpperCase() ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                      {req.employeeName} <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>({req.employeeCode})</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                      {req.systemGenerated ? t('settings.promotionReview.autoFlaggedBySystem') : t('settings.promotionReview.proposedBy', { name: req.requestedByName ?? 'HR' })} · {formatDate(req.createdAt, language)}
                      {req.effectiveDate ? ` · ${t('settings.promotionReview.effective', { date: req.effectiveDate })}` : ''}
                    </div>
                  </div>
                  {req.systemGenerated && (
                    <span style={{
                      fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: 'var(--radius-full, 999px)',
                      background: 'var(--bg-info-subtle, var(--bg-surface-alt))', color: 'var(--txt-info, var(--txt-secondary))',
                      border: '1px solid var(--bdr-subtle)',
                    }}>{t('settings.autoFlagged')}</span>
                  )}
                  <StatusBadge status={req.status} />
                  {req.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote('') }}
                    >{isOpen ? t('settings.close') : t('settings.review')}</Button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--bdr-subtle)' }}>
                    <div style={{
                      fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-2)',
                    }}>{t('settings.promotionReview.proposedChanges')}</div>
                    {rows.map(([label, from, to]) => (
                      <FieldRow key={label} label={label} from={from} to={to} />
                    ))}

                    {req.reason && (
                      <div style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)' }}>
                        <strong style={{ color: 'var(--txt-primary)' }}>{t('settings.reasonLabel')}</strong> {req.reason}
                      </div>
                    )}

                    {isMine ? (
                      <div style={{
                        marginTop: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
                        background: 'var(--bg-warning-subtle)', border: '1px solid var(--bdr-warning)',
                        borderRadius: 'var(--radius-md)', color: 'var(--txt-warning)', fontSize: 'var(--fs-sm)',
                      }}>
                        {t('settings.promotionReview.selfCreatedWarning')}
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ marginTop: 'var(--sp-4)' }}>
                          <label className="form-label" htmlFor={`promo-note-${req.id}`}>
                            {t('settings.reviewNoteLabel')} <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>{t('settings.optional')}</span>
                          </label>
                          <textarea
                            id={`promo-note-${req.id}`}
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t('settings.notePlaceholderEmployee')}
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                          <Button
                            variant="success"
                            disabled={actionLoading !== null}
                            onClick={() => handleReview(req.id, 'approved')}
                          >{actionLoading === 'approved' ? t('settings.approvingEllipsis') : t('settings.promotionReview.approveAndApply')}</Button>
                          <Button
                            variant="danger"
                            disabled={actionLoading !== null}
                            onClick={() => handleReview(req.id, 'rejected')}
                          >{actionLoading === 'rejected' ? t('settings.rejectingEllipsis') : t('settings.reject')}</Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {req.status !== 'pending' && req.reviewNote && (
                  <div style={{
                    marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)',
                    borderTop: '1px solid var(--bdr-subtle)', fontStyle: 'italic',
                    fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)',
                  }}>{t('settings.adminNote', { note: req.reviewNote })}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NoShowReviewPanel() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilter] = useState('pending')
  const [reviewingId, setReviewingId] = useState(null)
  const [note, setNote] = useState('')
  const [actionLoading, setActionL] = useState(null)
  const [toast, setToast] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await NoShowReviewsAPI.list({ status: filterStatus })
      setRequests(res.items ?? [])
    } catch (err) {
      setError(err.message || t('settings.noShowReview.loadFailed'))
    }
    setLoading(false)
  }, [filterStatus, t])

  useEffect(() => { loadRequests() }, [loadRequests])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handleReview = async (requestId, decision) => {
    setActionL(decision)
    try {
      await NoShowReviewsAPI.review(requestId, decision, note)
      setToast(decision === 'approved' ? t('settings.noShowReview.confirmSuccess') : t('settings.noShowReview.dismissSuccess'))
      setReviewingId(null)
      setNote('')
      loadRequests()
    } catch (err) {
      setToast(`Error: ${err.message}`)
    }
    setActionL(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', padding: '3px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setReviewingId(null) }}
              style={{
                padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: filterStatus === s ? 'var(--bg-surface)' : 'transparent',
                color: filterStatus === s ? 'var(--txt-primary)' : 'var(--txt-secondary)',
                fontFamily: 'var(--font-family)', fontSize: 'var(--fs-xs)',
                fontWeight: filterStatus === s ? 'var(--fw-medium)' : 'var(--fw-regular)',
                boxShadow: filterStatus === s ? 'var(--shadow-xs)' : 'none',
                textTransform: 'capitalize',
              }}
            >{t(`settings.statusFilter.${s}`)}</button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t('settings.refresh')}</Button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>
          {t('settings.noShowReview.flagCount', { count: requests.length })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: toast.startsWith('Error') ? 'var(--bg-danger-subtle)' : 'var(--bg-success-subtle)',
          border: `1px solid ${toast.startsWith('Error') ? 'var(--bdr-danger)' : 'var(--bdr-success)'}`,
          borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)',
          color: toast.startsWith('Error') ? 'var(--txt-danger)' : 'var(--txt-success)',
        }}>{toast}</div>
      )}

      {error && (
        <div style={{
          marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)',
          borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)',
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.noShowReview.loadingFlags')}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {filterStatus !== 'all'
            ? t('settings.noShowReview.noFlagsFiltered', { status: t(`settings.statusFilter.${filterStatus}`) })
            : t('settings.noShowReview.noFlags')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id
            return (
              <div key={req.id} style={{
                border: `1px solid ${isOpen ? 'var(--bdr-brand)' : 'var(--bdr-subtle)'}`,
                borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)',
                background: 'var(--bg-surface-alt)', transition: 'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-danger, var(--clr-danger-500))', color: 'var(--txt-on-brand)', display: 'grid',
                    placeItems: 'center', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                  }}>{req.employeeName?.[0]?.toUpperCase() ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                      {req.employeeName} <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>({req.employeeCode})</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                      {t('settings.noShowReview.recordLine', { count: req.noShowCount, date: formatDate(req.flaggedAt ?? req.createdAt, language) })}
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                  {req.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote('') }}
                    >{isOpen ? t('settings.close') : t('settings.review')}</Button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--bdr-subtle)' }}>
                    {req.reason && (
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-3)' }}>
                        <strong style={{ color: 'var(--txt-primary)' }}>{t('settings.reasonLabel')}</strong> {req.reason}
                      </div>
                    )}
                    <div style={{
                      marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
                      background: 'var(--bg-warning-subtle)', border: '1px solid var(--bdr-warning)',
                      borderRadius: 'var(--radius-md)', color: 'var(--txt-warning)', fontSize: 'var(--fs-sm)',
                    }}>
                      {t('settings.noShowReview.autoStatusWarning')}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor={`noshow-note-${req.id}`}>
                        {t('settings.reviewNoteLabel')} <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>{t('settings.optional')}</span>
                      </label>
                      <textarea
                        id={`noshow-note-${req.id}`}
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t('settings.noShowReview.notePlaceholder')}
                        style={{ resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                      <Button
                        variant="success"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'approved')}
                      >{actionLoading === 'approved' ? t('settings.savingEllipsis') : t('settings.noShowReview.confirmPattern')}</Button>
                      <Button
                        variant="danger"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'rejected')}
                      >{actionLoading === 'rejected' ? t('settings.savingEllipsis') : t('settings.noShowReview.dismiss')}</Button>
                    </div>
                  </div>
                )}

                {req.status !== 'pending' && req.reviewNote && (
                  <div style={{
                    marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)',
                    borderTop: '1px solid var(--bdr-subtle)', fontStyle: 'italic',
                    fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)',
                  }}>{t('settings.adminNote', { note: req.reviewNote })}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProfileEditReviewPanel() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [requests, setRequests]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [filterStatus, setFilter]     = useState('pending')
  const [reviewingId, setReviewingId] = useState(null) // which request is open
  const [note, setNote]               = useState('')
  const [actionLoading, setActionL]   = useState(null) // 'approved' | 'rejected' | null
  const [toast, setToast]             = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await ProfileEditRequestsAPI.list({ status: filterStatus })
      setRequests(res.items ?? [])
    } catch (err) {
      setError(err.message || t('settings.profileEditReview.loadFailed'))
    }
    setLoading(false)
  }, [filterStatus, t])

  useEffect(() => { loadRequests() }, [loadRequests])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handleReview = async (requestId, decision) => {
    setActionL(decision)
    try {
      await ProfileEditRequestsAPI.review(requestId, decision, note)
      setToast(decision === 'approved' ? t('settings.profileEditReview.approveSuccess') : t('settings.profileEditReview.rejectSuccess'))
      setReviewingId(null)
      setNote('')
      loadRequests()
    } catch (err) {
      setToast(`Error: ${err.message}`)
    }
    setActionL(null)
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', padding: '3px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setReviewingId(null) }}
              style={{
                padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: filterStatus === s ? 'var(--bg-surface)' : 'transparent',
                color: filterStatus === s ? 'var(--txt-primary)' : 'var(--txt-secondary)',
                fontFamily: 'var(--font-family)', fontSize: 'var(--fs-xs)',
                fontWeight: filterStatus === s ? 'var(--fw-medium)' : 'var(--fw-regular)',
                boxShadow: filterStatus === s ? 'var(--shadow-xs)' : 'none',
                textTransform: 'capitalize',
              }}
            >
              {t(`settings.statusFilter.${s}`)}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>
          {t('settings.refresh')}
        </Button>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginLeft: 'auto' }}>
          {t('settings.profileEditReview.requestCount', { count: requests.length })}
        </span>
      </div>

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

      {error && (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)', borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {t('settings.profileEditReview.loadingRequests')}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          {filterStatus !== 'all'
            ? t('settings.profileEditReview.noRequestsFiltered', { status: t(`settings.statusFilter.${filterStatus}`) })
            : t('settings.profileEditReview.noRequests')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id
            return (
              <div key={req.id} style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${isOpen ? 'var(--bdr-brand)' : 'var(--bdr-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}>
                {/* Request header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                  padding: 'var(--sp-4) var(--sp-5)',
                  background: isOpen ? 'var(--bg-primary-subtle)' : 'var(--bg-surface-alt)',
                  flexWrap: 'wrap',
                }}>
                  {/* Avatar initial */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'var(--bg-primary)', color: 'var(--txt-on-brand)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                    flexShrink: 0,
                  }}>
                    {(req.employeeName?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                      {req.employeeName ?? t('settings.profileEditReview.unknownEmployee')}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                      {Object.keys(req.changes).map((f) => fieldLabel(t, f)).join(', ')} ·{' '}
                      {formatDate(req.createdAt, language)}
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                  {req.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote('') }}
                    >
                      {isOpen ? t('settings.close') : t('settings.review')}
                    </Button>
                  )}
                </div>

                {/* Expanded detail + action */}
                {isOpen && (
                  <div style={{ padding: 'var(--sp-5)', borderTop: '1px solid var(--bdr-subtle)' }}>
                    <div style={{ marginBottom: 'var(--sp-4)' }}>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-2)' }}>
                        {t('settings.profileEditReview.requestedChanges')}
                      </div>
                      {Object.entries(req.changes).map(([field, { from, to }]) => (
                        <FieldRow key={field} label={fieldLabel(t, field)} from={from} to={to} />
                      ))}
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--sp-4)' }}>
                      <label className="form-label" htmlFor={`note-${req.id}`}>
                        {t('settings.reviewNoteLabel')} <span style={{ fontWeight: 'var(--fw-regular)', color: 'var(--txt-secondary)' }}>{t('settings.optional')}</span>
                      </label>
                      <textarea
                        id={`note-${req.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={t('settings.notePlaceholderEmployee')}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                      <Button
                        variant="success"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'approved')}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                      >
                        {actionLoading === 'approved' ? t('settings.approvingEllipsis') : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            {t('settings.promotionReview.approveAndApply')}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'rejected')}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                      >
                        {actionLoading === 'rejected' ? t('settings.rejectingEllipsis') : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            {t('settings.reject')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Show review outcome for non-pending */}
                {req.status !== 'pending' && req.reviewNote && (
                  <div style={{
                    padding: 'var(--sp-3) var(--sp-5)',
                    borderTop: '1px solid var(--bdr-subtle)',
                    fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', fontStyle: 'italic',
                  }}>
                    {t('settings.myProfile.hrNote', { note: req.reviewNote })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Admin-only: Promote Users panel
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
      setError(err.message || t('settings.promoteUsers.loadFailed'))
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
      setToast(`Error: ${err.message}`)
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
          background: toast.startsWith('Error') ? 'var(--bg-danger-subtle)' : 'var(--bg-success-subtle)',
          border: `1px solid ${toast.startsWith('Error') ? 'var(--bdr-danger)' : 'var(--bdr-success)'}`,
          borderRadius: 'var(--radius-md)',
          color: toast.startsWith('Error') ? 'var(--txt-danger)' : 'var(--txt-success)',
          fontSize: 'var(--fs-sm)',
        }}>{toast}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {users.map((u) => {
          const isSelf = u.id === currentUser?.id
          const isAdminAcc = u.role === 'ADMIN'
          const isManager = u.role === 'MANAGER'
          const isLoading = promoting === u.id
          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
              padding: 'var(--sp-3) var(--sp-4)',
              background: isSelf ? 'var(--bg-primary-subtle)' : 'var(--bg-surface-alt)',
              border: `1px solid ${isSelf ? 'rgba(113,82,243,0.2)' : 'var(--bdr-subtle)'}`,
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
                <div style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 }}>
                  {isAdminAcc ? (
                    <Button variant="secondary" size="sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'MANAGER')}>
                      {isLoading ? '…' : t('settings.promoteUsers.demoteToHr')}
                    </Button>
                  ) : isManager ? (
                    <>
                      <Button variant="secondary" size="sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'EMPLOYEE')}>
                        {isLoading ? '…' : t('settings.promoteUsers.demote')}
                      </Button>
                      <Button variant="primary" size="sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'ADMIN')}>
                        {isLoading ? '…' : t('settings.promoteUsers.makeAdmin')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" size="sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'MANAGER')}>
                      {isLoading ? '…' : t('settings.promoteUsers.promoteToHr')}
                    </Button>
                  )}
                </div>
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
   Section wrapper card
───────────────────────────────────────────── */
function SectionCard({ icon, title, description, accent = false, children }) {
  return (
    <div style={{
      padding: '24px',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius)',
      border: `1px solid ${accent ? 'var(--bdr-brand)' : 'var(--bdr-subtle)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
        {icon && (
          <span style={{
            width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-primary-subtle)', color: 'var(--clr-primary-400)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }} aria-hidden="true">{icon}</span>
        )}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--txt-primary)', margin: 0 }}>{title}</h3>
          {description && <p style={{ fontSize: '13px', color: 'var(--txt-secondary)', marginTop: '2px' }}>{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Main Settings page
───────────────────────────────────────────── */
function Settings() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const { isAdmin, isHR, user } = useAuth()

  const onlyEmployee = !isHR  // true iff EMPLOYEE role (not HR, not Admin)

  const cardStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px',
    background: 'var(--surface-alt)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  }

  return (
    <div className="content-card">
      <h2>{t("settings.title")}</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>{t("settings.subtitle")}</p>

      {/* Current user info */}
      <div style={{
        marginTop: '24px', padding: '16px 20px',
        background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
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

      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ── Employee: My Profile ── */}
        {onlyEmployee && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            }
            title={t("settings.sections.myProfile.title")}
            description={t("settings.sections.myProfile.description")}
          >
            <MyProfileEditSection />
          </SectionCard>
        )}

        {/* ── HR/Admin: Profile Edit Requests ── */}
        {isHR && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            }
            title={t("settings.sections.profileEditRequests.title")}
            description={t("settings.sections.profileEditRequests.description")}
          >
            <ProfileEditReviewPanel />
          </SectionCard>
        )}

        {/* ── HR/Admin: propose a promotion ── */}
        {isHR && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5"/>
                <path d="M5 12l7-7 7 7"/>
              </svg>
            }
            title={t("settings.sections.proposePromotion.title")}
            description={t("settings.sections.proposePromotion.description")}
          >
            <PromotionProposeSection />
          </SectionCard>
        )}

        {/* ── Admin only: promotion approval queue ── */}
        {isAdmin && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            }
            title={t("settings.sections.promotionApprovalQueue.title")}
            description={t("settings.sections.promotionApprovalQueue.description")}
          >
            <PromotionReviewPanel />
          </SectionCard>
        )}

        {/* ── Admin only: no-show review queue (tasks 4.7 / 4.8) ── */}
        {isAdmin && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
            }
            title={t("settings.sections.noShowReviewQueue.title")}
            description={t("settings.sections.noShowReviewQueue.description")}
          >
            <NoShowReviewPanel />
          </SectionCard>
        )}

        {/* Dark mode */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{t("settings.darkMode.title")}</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>{t("settings.darkMode.description")}</p>
          </div>
          <button onClick={toggleTheme} style={{ padding: '12px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '14px' }}>
            {theme === 'light' ? t("settings.darkMode.light") : t("settings.darkMode.dark")}
          </button>
        </div>

        {/* Email notifications */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{t("settings.emailNotifications.title")}</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>{t("settings.emailNotifications.description")}</p>
          </div>
          <label style={{ width: '50px', height: '26px', background: 'var(--primary)', borderRadius: '13px', position: 'relative', cursor: 'pointer' }}>
            <span style={{ width: '22px', height: '22px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', right: '2px' }} />
          </label>
        </div>

        {/* Language — task 6.1: wired to LanguageContext (previously a
            decorative, unwired <select>). */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{t("settings.language.title")}</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>{t("settings.language.description")}</p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="en">{t("settings.language.english")}</option>
            <option value="vi">{t("settings.language.vietnamese")}</option>
          </select>
        </div>

        {/* Admin only: Manage User Roles */}
        {isAdmin && (
          <SectionCard
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            }
            title={t("settings.sections.manageUserRoles.title")}
            description={t("settings.sections.manageUserRoles.description")}
          >
            <PromoteUsersPanel />
          </SectionCard>
        )}
      </div>
    </div>
  )
}

export default Settings
