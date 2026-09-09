import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { NotificationsAPI } from '../../api'
import { translateApiError } from '../../utils/apiError'
import { permissionState, isWanted, setWanted, ensurePermission } from '../../utils/desktopNotify'
import { isPushSupported, currentSubscription, subscribeToPush, unsubscribeFromPush } from '../../utils/webPush'
import Button from "../../components/Button";
import { Panel } from './shared'

/* ─────────────────────────────────────────────
   Notifications tab — no per-category preference
   storage exists in the backend (Notification
   model has no per-user prefs), so this is a
   disclosed gap rather than a fake checkbox table.
───────────────────────────────────────────── */
function SettingRow({ label, hint, control }) {
  return (
    <div style={{
      padding: 'var(--sp-4) var(--sp-5)', background: 'var(--bg-surface-alt)',
      border: '1px solid var(--bdr-subtle)', borderRadius: 'var(--radius-md)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: 'var(--sp-4)', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: '220px', flex: 1 }}>
        <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--txt-primary)', margin: 0 }}>{label}</p>
        {hint && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-secondary)', margin: '4px 0 0' }}>{hint}</p>}
      </div>
      {control}
    </div>
  )
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '24px', flexShrink: 0, padding: '2px',
        borderRadius: 'var(--radius-full)', cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid var(--bdr-default)',
        background: checked ? 'var(--bg-primary)' : 'var(--bg-surface-alt)',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{
        width: '18px', height: '18px', borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--txt-on-brand)' : 'var(--txt-secondary)',
        display: 'block',
      }} />
    </button>
  )
}

/* ─────────────────────────────────────────────
   Web Push. Unlike the email toggle below, this is
   PER-BROWSER: the subscription is minted by this
   browser for this origin, so the row is labelled
   "this device" and turning it on elsewhere does
   nothing here. See utils/webPush.js.
───────────────────────────────────────────── */
function PushRow() {
  const { t } = useTranslation()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!isPushSupported()) {
      setState({ available: false, supported: false, subscribed: false })
      return
    }
    const existing = await currentSubscription()
    try {
      const res = await NotificationsAPI.pushStatus(existing?.endpoint)
      setState({ ...res.data, supported: true })
    } catch {
      setState({ available: false, supported: true, subscribed: false })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (next) => {
    setBusy(true)
    try {
      if (next) {
        const result = await subscribeToPush(state?.publicKey)
        if (!result.ok) return
        await NotificationsAPI.pushSubscribe(result.subscription)
      } else {
        const { endpoint } = await unsubscribeFromPush()
        // Drop the server row even when the browser had nothing to revoke,
        // or it would keep pushing to an endpoint the user has disowned.
        if (endpoint) await NotificationsAPI.pushUnsubscribe(endpoint)
      }
      await load()
    } catch {
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  return (
    <SettingRow
      label={t('settings.notificationsTab.pushLabel')}
      hint={
        !state.supported ? t('settings.notificationsTab.pushUnsupported')
          : !state.available ? t('settings.notificationsTab.pushUnavailable')
          : t('settings.notificationsTab.pushHint')
      }
      control={
        <Switch
          checked={Boolean(state.subscribed)}
          onChange={toggle}
          disabled={busy || !state.supported || !state.available}
          label={t('settings.notificationsTab.pushLabel')}
        />
      }
    />
  )
}

/* ─────────────────────────────────────────────
   Email toggle. Server-side preference, unlike the
   desktop one above: an inbox is not tied to a
   device, and email is the only channel that can
   reach a broadcast audience — which is exactly
   why it defaults to off.
───────────────────────────────────────────── */
function EmailRow() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    NotificationsAPI.preferences()
      .then((res) => setEnabled(Boolean(res.data.email)))
      .catch(() => setEnabled(false))
  }, [])

  const toggle = async (next) => {
    setBusy(true)
    // Optimistic: the switch should not lag behind the tap. Rolled back below
    // if the write fails, so it can never show "on" while the server says off.
    setEnabled(next)
    try {
      const res = await NotificationsAPI.updatePreferences({ email: next })
      setEnabled(Boolean(res.data.email))
    } catch {
      setEnabled(!next)
    } finally {
      setBusy(false)
    }
  }

  if (enabled === null) return null

  return (
    <SettingRow
      label={t('settings.notificationsTab.emailLabel')}
      hint={t('settings.notificationsTab.emailHint')}
      control={
        <Switch
          checked={enabled}
          onChange={toggle}
          disabled={busy}
          label={t('settings.notificationsTab.emailLabel')}
        />
      }
    />
  )
}

/* ─────────────────────────────────────────────
   Telegram linking. The code is minted server-side
   and redeemed by the bot when the user sends
   "/start <code>" — see hrms-backend/controller/
   telegramController.js for the full handshake.

   No QR code, deliberately: the only zero-dependency
   way to render one is a third-party image service,
   which would mean putting a live link code in a URL
   owned by someone else. The deep link opens Telegram
   Desktop and Telegram mobile directly.
───────────────────────────────────────────── */
function TelegramRow() {
  const { t } = useTranslation()
  const [status, setStatus] = useState(null)
  const [invite, setInvite] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await NotificationsAPI.telegramStatus()
      setStatus(res.data)
      return res.data
    } catch {
      setStatus({ available: false })
      return null
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // The user completes linking inside Telegram, so this page has no way to
  // know it happened. Poll while a code is on screen, and stop as soon as it
  // lands or the code expires — never an unbounded background poll.
  useEffect(() => {
    if (!invite || status?.connected) return undefined
    const timer = setInterval(async () => {
      if (Date.now() > new Date(invite.expiresAt).getTime()) {
        setInvite(null)
        return
      }
      const next = await refresh()
      if (next?.connected) setInvite(null)
    }, 3000)
    return () => clearInterval(timer)
  }, [invite, status?.connected, refresh])

  const connect = async () => {
    setBusy(true); setError('')
    try {
      const res = await NotificationsAPI.telegramLinkCode()
      setInvite(res.data)
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.notificationsTab.telegramFailed'))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true); setError('')
    try {
      await NotificationsAPI.telegramDisconnect()
      setInvite(null)
      await refresh()
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.notificationsTab.telegramFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <SettingRow
        label={t('settings.notificationsTab.telegramLabel')}
        hint={
          !status.available ? t('settings.notificationsTab.telegramUnavailable')
            : status.connected ? t('settings.notificationsTab.telegramConnected')
            : t('settings.notificationsTab.telegramHint')
        }
        control={
          status.available ? (
            <Button
              variant={status.connected ? 'secondary' : 'primary'}
              onClick={status.connected ? disconnect : connect}
              disabled={busy}
            >
              {status.connected
                ? t('settings.notificationsTab.telegramDisconnect')
                : t('settings.notificationsTab.telegramConnect')}
            </Button>
          ) : null
        }
      />

      {invite && !status.connected && (
        <div style={{
          padding: 'var(--sp-4) var(--sp-5)', background: 'var(--bg-primary-subtle)',
          border: '1px solid var(--bdr-default)', borderRadius: 'var(--radius-md)',
          display: 'grid', gap: 'var(--sp-3)',
        }}>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--txt-primary)', margin: 0 }}>
            {t('settings.notificationsTab.telegramStep', { minutes: invite.expiresInMinutes })}
          </p>
          <code style={{
            fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)',
            letterSpacing: '0.15em', color: 'var(--txt-primary-brand)',
          }}>{invite.code}</code>
          <a
            href={invite.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            style={{ justifySelf: 'start' }}
          >
            {t('settings.notificationsTab.telegramOpen')}
          </a>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-danger)', margin: 0 }}>{error}</p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Notifications tab — in-app is always on (it is
   the notification record itself). Desktop toasts
   are opt-in and deliberately per-device: the
   browser owns permission, so a preference stored
   on the User document would claim "on" for a
   device that never granted it. See
   utils/desktopNotify.js.
───────────────────────────────────────────── */
export function NotificationsTab() {
  const { t } = useTranslation()
  const [permission, setPermission] = useState(() => permissionState())
  const [wanted, setWantedState] = useState(() => isWanted())

  const unsupported = permission === 'unsupported'
  const blocked = permission === 'denied'

  const handleToggle = async (next) => {
    if (!next) {
      setWantedState(setWanted(false))
      return
    }
    // Asking must happen inside this click — a permission prompt raised on
    // page load gets reflexively blocked, and "denied" cannot be undone
    // from script.
    const result = await ensurePermission()
    setPermission(result)
    setWantedState(setWanted(result === 'granted'))
  }

  return (
    <Panel title={t('settings.notificationsTab.title')} subtitle={t('settings.notificationsTab.subtitle')}>
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <SettingRow
          label={t('settings.notificationsTab.inAppLabel')}
          hint={t('settings.notificationsTab.inAppHint')}
          control={
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--txt-success)', fontWeight: 'var(--fw-medium)' }}>
              {t('settings.notificationsTab.alwaysOn')}
            </span>
          }
        />

        <SettingRow
          label={t('settings.notificationsTab.desktopLabel')}
          hint={
            unsupported ? t('settings.notificationsTab.desktopUnsupported')
              : blocked ? t('settings.notificationsTab.desktopBlocked')
              : t('settings.notificationsTab.desktopHint')
          }
          control={
            <Switch
              checked={wanted && permission === 'granted'}
              onChange={handleToggle}
              disabled={unsupported || blocked}
              label={t('settings.notificationsTab.desktopLabel')}
            />
          }
        />

        <PushRow />

        <EmailRow />

        <TelegramRow />

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
      </div>
    </Panel>
  )
}
