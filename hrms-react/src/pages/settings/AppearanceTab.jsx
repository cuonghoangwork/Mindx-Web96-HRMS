import { useTranslation } from 'react-i18next'
import { useTheme } from '../../context/ThemeContext'
import { Panel } from './shared'

/* ─────────────────────────────────────────────
   Appearance tab — real (ThemeContext)
───────────────────────────────────────────── */
export function AppearanceTab() {
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
