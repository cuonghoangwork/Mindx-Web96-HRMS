import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { apiFetch } from '../api/client'
import { ProfileEditRequestsAPI, EmployeesAPI, PromotionRequestsAPI } from '../api'
import { getRoleLabel } from '../utils/roles'

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
  const cfg = {
    pending:  { bg: 'var(--bg-warning-subtle)', color: 'var(--txt-warning)', border: 'var(--bdr-warning)', label: 'Pending' },
    approved: { bg: 'var(--bg-success-subtle)', color: 'var(--txt-success)', border: 'var(--bdr-success)', label: 'Approved' },
    rejected: { bg: 'var(--bg-danger-subtle)',  color: 'var(--txt-danger)',  border: 'var(--bdr-danger)',  label: 'Rejected' },
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

const FIELD_LABELS = {
  name: 'Full Name', phone: 'Phone', address: 'Address', age: 'Age', sex: 'Gender',
}

/* ─────────────────────────────────────────────
   Employee: My Profile Edit section
───────────────────────────────────────────── */
function MyProfileEditSection() {
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
    if (!profile) { setError('No employee profile linked to your account.'); return }

    // Build the diff (only changed fields)
    const changes = {}
    if (editForm.name    !== (profile.name    ?? ''))      changes.name    = editForm.name
    if (editForm.phone   !== (profile.phone   ?? ''))      changes.phone   = editForm.phone
    if (editForm.address !== (profile.address ?? ''))      changes.address = editForm.address
    if (String(editForm.age ?? '') !== String(profile.age ?? '')) changes.age = editForm.age
    if (editForm.sex     !== (profile.sex     ?? ''))      changes.sex     = editForm.sex

    if (Object.keys(changes).length === 0) {
      setError('No changes detected.')
      return
    }

    setSubmitting(true)
    try {
      await ProfileEditRequestsAPI.create(changes)
      setSuccess('Your profile edit request has been submitted and is pending HR approval.')
      setIsEditing(false)
      loadRequests()
    } catch (err) {
      setError(err.message || 'Failed to submit request.')
    }
    setSubmitting(false)
  }

  if (loadingProfile) {
    return (
      <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
        Loading your profile…
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
        No employee profile is linked to your account yet. Contact HR to have your profile linked.
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
            Current Profile
          </h4>
          {!isEditing && !hasPending && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => { setIsEditing(true); setError(''); setSuccess('') }}
            >
              Request Edit
            </button>
          )}
          {hasPending && (
            <StatusBadge status="pending" />
          )}
        </div>

        {[
          { label: 'Full Name',   value: profile.name },
          { label: 'Employee ID', value: profile.employeeId },
          { label: 'Department',  value: profile.department },
          { label: 'Designation', value: profile.designation },
          { label: 'Phone',       value: profile.phone || '—' },
          { label: 'Address',     value: profile.address || '—' },
          { label: 'Age',         value: profile.age || '—' },
          { label: 'Gender',      value: profile.sex || '—' },
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
                Request Profile Edit
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                Changes are sent to HR for approval. HR-managed fields (department, salary, status) cannot be self-edited.
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-name">Full Name</label>
              <input
                id="edit-name"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-phone">Phone</label>
              <input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+84 90 123 4567"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-age">Age</label>
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
              <label className="form-label" htmlFor="edit-sex">Gender</label>
              <select
                id="edit-sex"
                value={editForm.sex}
                onChange={(e) => setEditForm((p) => ({ ...p, sex: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="edit-address">Address</label>
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setIsEditing(false); setError('') }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
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
            Request History
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
                    {new Date(req.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <StatusBadge status={req.status} />
                </div>
                {Object.entries(req.changes).map(([field, { from, to }]) => (
                  <FieldRow key={field} label={FIELD_LABELS[field] ?? field} from={from} to={to} />
                ))}
                {req.reviewNote && (
                  <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', fontStyle: 'italic' }}>
                    HR note: {req.reviewNote}
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
  n === null || n === undefined || n === '' ? '—' : `$${Number(n).toLocaleString()}`

function PromotionProposeSection() {
  const { employees, departments } = useStore()
  const [form, setForm] = useState({
    employeeId: '', designation: '', department: '', salary: '', effectiveDate: '', reason: '',
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
      setError(err.message || 'Failed to load proposals.')
    }
    setLoading(false)
  }, [])

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
    if (!form.employeeId) { setError('Pick an employee first.'); return }
    setSubmitting(true)
    try {
      const body = { employeeId: form.employeeId }
      if (form.designation.trim()) body.designation = form.designation.trim()
      if (form.department) body.department = form.department
      if (form.salary !== '') body.salary = Number(form.salary)
      if (form.effectiveDate) body.effectiveDate = form.effectiveDate
      if (form.reason.trim()) body.reason = form.reason.trim()
      await PromotionRequestsAPI.create(body)
      setToast('Promotion proposal submitted for Administrator review.')
      setForm({ employeeId: '', designation: '', department: '', salary: '', effectiveDate: '', reason: '' })
      loadMine()
    } catch (err) {
      setError(err.message || 'Failed to submit proposal.')
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
            <label className="form-label" htmlFor="promo-employee">Employee <span className="required">*</span></label>
            <select id="promo-employee" name="employeeId" value={form.employeeId} onChange={handleChange}>
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-effective">Effective date</label>
            <input id="promo-effective" name="effectiveDate" type="date"
              value={form.effectiveDate} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-designation">New designation</label>
            <input id="promo-designation" name="designation" value={form.designation}
              onChange={handleChange} placeholder={selected?.designation || 'Senior Developer'} />
            {selected && (
              <span className="form-hint">Currently: {selected.designation || '—'}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-department">New department</label>
            <select id="promo-department" name="department" value={form.department} onChange={handleChange}>
              <option value="">Leave unchanged</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
            {selected && (
              <span className="form-hint">Currently: {selected.department || '—'}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-salary">New annual salary (USD)</label>
            <input id="promo-salary" name="salary" type="number" min="0" step="1000"
              value={form.salary} onChange={handleChange} placeholder={selected?.salary ?? '75000'} />
            {selected && (
              <span className="form-hint">Currently: {usd(selected.salary)}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="promo-reason">Reason</label>
            <textarea id="promo-reason" name="reason" rows={2} value={form.reason}
              onChange={handleChange} placeholder="Why this promotion is justified…"
              style={{ resize: 'vertical' }} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit proposal'}
        </button>
      </form>

      <div style={{ marginTop: 'var(--sp-6)' }}>
        <div style={{
          fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-3)',
        }}>Recent proposals</div>
        {loading ? (
          <div style={{ color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>Loading…</div>
        ) : mine.length === 0 ? (
          <div style={{ color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>No proposals yet.</div>
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
                    r.proposed.designation && `title → ${r.proposed.designation}`,
                    r.proposed.department && `dept → ${r.proposed.department}`,
                    r.proposed.salary !== null && `salary → ${usd(r.proposed.salary)}`,
                  ].filter(Boolean).join(' · ') || '—'}
                </span>
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
      setError(err.message || 'Failed to load proposals.')
    }
    setLoading(false)
  }, [filterStatus])

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
      setToast(decision === 'approved' ? 'Promotion approved and applied.' : 'Proposal rejected.')
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
            >{s}</button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadRequests}>Refresh</button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>
          {requests.length} proposal{requests.length === 1 ? '' : 's'}
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
          Loading proposals…
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          No {filterStatus !== 'all' ? filterStatus : ''} proposals.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id
            const isMine = String(req.requestedBy) === String(user?.id)
            const rows = [
              ['Designation', req.current.designation, req.proposed.designation],
              ['Department', req.current.department, req.proposed.department],
              ['Annual Salary', usd(req.current.salary), req.proposed.salary === null ? null : usd(req.proposed.salary)],
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
                    background: 'var(--bg-primary)', color: '#fff', display: 'grid',
                    placeItems: 'center', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                  }}>{req.employeeName?.[0]?.toUpperCase() ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                      {req.employeeName} <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>({req.employeeCode})</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                      Proposed by {req.requestedByName ?? 'HR'} · {new Date(req.createdAt).toLocaleDateString()}
                      {req.effectiveDate ? ` · effective ${req.effectiveDate}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                  {req.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote('') }}
                    >{isOpen ? 'Close' : 'Review'}</button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--bdr-subtle)' }}>
                    <div style={{
                      fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-2)',
                    }}>Proposed changes</div>
                    {rows.map(([label, from, to]) => (
                      <FieldRow key={label} label={label} from={from} to={to} />
                    ))}

                    {req.reason && (
                      <div style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: 'var(--txt-secondary)' }}>
                        <strong style={{ color: 'var(--txt-primary)' }}>Reason:</strong> {req.reason}
                      </div>
                    )}

                    {isMine ? (
                      <div style={{
                        marginTop: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)',
                        background: 'var(--bg-warning-subtle)', border: '1px solid var(--bdr-warning)',
                        borderRadius: 'var(--radius-md)', color: 'var(--txt-warning)', fontSize: 'var(--fs-sm)',
                      }}>
                        You created this proposal — another Administrator must review it.
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ marginTop: 'var(--sp-4)' }}>
                          <label className="form-label" htmlFor={`promo-note-${req.id}`}>
                            Review Note <span style={{ color: 'var(--txt-secondary)', fontWeight: 'var(--fw-regular)' }}>(optional)</span>
                          </label>
                          <textarea
                            id={`promo-note-${req.id}`}
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add a note for the employee…"
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-success"
                            disabled={actionLoading !== null}
                            onClick={() => handleReview(req.id, 'approved')}
                          >{actionLoading === 'approved' ? 'Approving…' : 'Approve & Apply'}</button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={actionLoading !== null}
                            onClick={() => handleReview(req.id, 'rejected')}
                          >{actionLoading === 'rejected' ? 'Rejecting…' : 'Reject'}</button>
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
                  }}>Admin note: {req.reviewNote}</div>
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
      setError(err.message || 'Failed to load requests.')
    }
    setLoading(false)
  }, [filterStatus])

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
      setToast(decision === 'approved' ? 'Profile update approved and applied.' : 'Request rejected.')
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
              {s}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadRequests}>
          Refresh
        </button>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginLeft: 'auto' }}>
          {requests.length} request{requests.length !== 1 ? 's' : ''}
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
          Loading requests…
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>
          No {filterStatus !== 'all' ? filterStatus : ''} requests.
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
                    background: 'var(--bg-primary)', color: '#fff',
                    display: 'grid', placeItems: 'center',
                    fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                    flexShrink: 0,
                  }}>
                    {(req.employeeName?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)' }}>
                      {req.employeeName ?? 'Unknown employee'}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>
                      {Object.keys(req.changes).map((f) => FIELD_LABELS[f] ?? f).join(', ')} ·{' '}
                      {new Date(req.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                  {req.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote('') }}
                    >
                      {isOpen ? 'Close' : 'Review'}
                    </button>
                  )}
                </div>

                {/* Expanded detail + action */}
                {isOpen && (
                  <div style={{ padding: 'var(--sp-5)', borderTop: '1px solid var(--bdr-subtle)' }}>
                    <div style={{ marginBottom: 'var(--sp-4)' }}>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--txt-secondary)', marginBottom: 'var(--sp-2)' }}>
                        Requested Changes
                      </div>
                      {Object.entries(req.changes).map(([field, { from, to }]) => (
                        <FieldRow key={field} label={FIELD_LABELS[field] ?? field} from={from} to={to} />
                      ))}
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--sp-4)' }}>
                      <label className="form-label" htmlFor={`note-${req.id}`}>
                        Review Note <span style={{ fontWeight: 'var(--fw-regular)', color: 'var(--txt-secondary)' }}>(optional)</span>
                      </label>
                      <textarea
                        id={`note-${req.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Add a note for the employee…"
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'approved')}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                      >
                        {actionLoading === 'approved' ? 'Approving…' : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Approve & Apply
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, 'rejected')}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                      >
                        {actionLoading === 'rejected' ? 'Rejecting…' : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Reject
                          </>
                        )}
                      </button>
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
                    HR note: {req.reviewNote}
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
      setError(err.message || 'Failed to load users.')
    }
    setLoading(false)
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
      const res = await apiFetch(`/auth/users/${userId}/promote`, { method: 'PATCH', body: { role: newRole } })
      setToast(res.message || 'Role updated.')
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err) {
      setToast(`Error: ${err.message}`)
    }
    setPromoting(null)
  }

  if (loading) return <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--txt-secondary)', fontSize: 'var(--fs-sm)' }}>Loading accounts…</div>
  if (error) return (
    <div style={{ padding: 'var(--sp-4)', background: 'var(--bg-danger-subtle)', border: '1px solid var(--bdr-danger)', borderRadius: 'var(--radius-md)', color: 'var(--txt-danger)', fontSize: 'var(--fs-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {error}<button className="btn btn-secondary btn-sm" onClick={fetchUsers}>Retry</button>
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
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, background: 'var(--bg-primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
                {u.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  {u.name}{isSelf && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)' }}>(you)</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: '2px' }}>{u.email}</div>
              </div>
              <RolePill role={u.role} />
              {u.mustChangePassword && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', flexShrink: 0 }}>Not activated</span>
              )}
              {!isSelf && (
                <div style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 }}>
                  {isAdminAcc ? (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'MANAGER')}>
                      {isLoading ? '…' : 'Demote to HR'}
                    </button>
                  ) : isManager ? (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'EMPLOYEE')}>
                        {isLoading ? '…' : 'Demote'}
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'ADMIN')}>
                        {isLoading ? '…' : 'Make Admin'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" disabled={isLoading} onClick={() => handlePromote(u.id, 'MANAGER')}>
                      {isLoading ? '…' : 'Promote to HR'}
                    </button>
                  )}
                </div>
              )}
              {isSelf && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-disabled)', flexShrink: 0 }}>Cannot change own role</span>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', marginTop: 'var(--sp-4)' }}>
        Accounts are created through the Add Employee flow. Promote grants full HR/Manager access; Demote returns the account to Employee read-only mode. You cannot change your own role.
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
  const { theme, toggleTheme } = useTheme()
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
      <h2>Settings</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>Manage your application preferences.</p>

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
            title="My Profile"
            description="View your HR profile and request changes to personal details. Changes require HR approval."
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
            title="Profile Edit Requests"
            description="Review and approve or reject employee requests to update their personal information."
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
            title="Propose a Promotion"
            description="Propose a new designation, department or salary for an employee. An Administrator must approve it before it takes effect."
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
            title="Promotion Approval Queue"
            description="Approve or reject promotion proposals. You cannot review a proposal you created yourself."
          >
            <PromotionReviewPanel />
          </SectionCard>
        )}

        {/* Dark mode */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Dark Mode</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>Toggle between light and dark themes</p>
          </div>
          <button onClick={toggleTheme} style={{ padding: '12px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '14px' }}>
            {theme === 'light' ? '☀ Light' : '◐ Dark'}
          </button>
        </div>

        {/* Email notifications */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Email Notifications</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>Receive email updates about your account</p>
          </div>
          <label style={{ width: '50px', height: '26px', background: 'var(--primary)', borderRadius: '13px', position: 'relative', cursor: 'pointer' }}>
            <span style={{ width: '22px', height: '22px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', right: '2px' }} />
          </label>
        </div>

        {/* Language */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Language</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>Choose your preferred language</p>
          </div>
          <select style={{ padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <option>English</option>
            <option>Vietnamese</option>
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
            title="Manage User Roles"
            description="Promote employees to HR/Manager or demote them back to Employee."
          >
            <PromoteUsersPanel />
          </SectionCard>
        )}
      </div>
    </div>
  )
}

export default Settings
