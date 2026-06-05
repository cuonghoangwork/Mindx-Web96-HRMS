import { useTheme } from '../context/ThemeContext'

function Settings() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="content-card">
      <h2>Settings</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>
        Manage your application preferences.
      </p>

      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          background: 'var(--surface-alt)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Dark Mode</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Toggle between light and dark themes
            </p>
          </div>
          <button 
            onClick={toggleTheme}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {theme === 'light' ? '☀ Light' : '◐ Dark'}
          </button>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          background: 'var(--surface-alt)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Email Notifications</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Receive email updates about your account
            </p>
          </div>
          <label style={{
            width: '50px',
            height: '26px',
            background: 'var(--primary)',
            borderRadius: '13px',
            position: 'relative',
            cursor: 'pointer'
          }}>
            <span style={{
              width: '22px',
              height: '22px',
              background: 'white',
              borderRadius: '50%',
              position: 'absolute',
              top: '2px',
              right: '2px'
            }}></span>
          </label>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          background: 'var(--surface-alt)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>Language</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Choose your preferred language
            </p>
          </div>
          <select style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)'
          }}>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export default Settings
