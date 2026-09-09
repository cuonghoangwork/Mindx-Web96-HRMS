import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../context/LanguageContext'
import { formatDateTime } from '../../utils/format'
import { AuditLogAPI } from '../../api'
import { getRoleLabel } from '../../utils/roles'
import { translateApiError } from '../../utils/apiError'
import Button from "../../components/Button";
import { Panel } from './shared'

/* ─────────────────────────────────────────────
   Audit log tab — real, HR/Admin only
   (GET /audit-log, admin+manager per
   auditLogRouter.js).
───────────────────────────────────────────── */
const AUDIT_LIMIT_STEP = 20

export function AuditLogTab() {
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
